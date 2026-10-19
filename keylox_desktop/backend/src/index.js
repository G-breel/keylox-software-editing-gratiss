'use strict';

const Fastify = require('fastify');
const cors = require('@fastify/cors');
const rateLimit = require('@fastify/rate-limit');
const config = require('./config');
const logger = require('./logger');
const { authenticate, isValidDeviceId } = require('./middleware/auth');
const { makeError } = require('./errors');
const { ok, fail } = require('./utils/envelope');
const healthRoutes = require('./routes/health');
const aiRoutes = require('./routes/ai');
const authRoutes = require('./routes/auth');
const { resolveByok } = require('./middleware/byok');
const editPlanGate = require('./services/editPlanGate');

const fastify = Fastify({
  logger: false,
  genReqId: () => require('uuid').v4(),
  trustProxy: config.trustProxy,
  bodyLimit: 64 * 1024 * 1024, // media base64 dikirim inline; batas eksplisit, bukan default tak terbatas
});

async function main() {
  // ---------- CORS: allowlist eksplisit (bukan origin:true) ----------
  await fastify.register(cors, {
    origin: (origin, callback) => {
      // Klik dari klien native/Electron tanpa Origin, atau Origin: "null" (file://).
      if (!origin || origin === 'null') {
        return config.allowNullOrigin ? callback(null, true) : callback(null, false);
      }
      if (config.allowedOrigins.includes(origin)) return callback(null, true);
      logger.warn({ origin }, 'CORS origin ditolak');
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Id', 'X-Provider-Key', 'X-Provider', 'X-Provider-Base-Url'],
    exposedHeaders: ['Retry-After', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    maxAge: 600,
  });

  // ---------- Security headers ----------
  fastify.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    reply.header('Cross-Origin-Resource-Policy', 'same-site');
    reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    if (config.isProduction) {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    // Respons AI bisa memuat konten pengguna → tidak boleh di-cache perantara.
    reply.header('Cache-Control', 'no-store');
    return payload;
  });

  // ---------- Rate limit ----------
  // Key = user JWT (bila ada) else IP tepercaya. Header X-Device-Id TIDAK dipakai
  // sebagai key tunggal karena nilainya dikendalikan klien (bisa dirotasi untuk
  // melewati limit). Quota harian per-device ditegakkan di middleware auth.
  await fastify.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindowMs,
    keyGenerator: (req) => (req.userId ? `u:${req.userId}` : `ip:${req.ip}`),
    onExceeded: (req) => {
      logger.warn({ ip: req.ip, url: req.url }, 'rate limit exceeded');
    },
    errorResponseBuilder: (req, context) => {
      const retryAfterSec = Math.max(1, Math.ceil(context.ttl / 1000));
      const err = makeError('ERR_AI_RATE_LIMIT', 'Terlalu banyak permintaan. Coba lagi nanti.', {
        httpStatus: 429,
        retryable: true,
        requestId: req.id,
        details: { retryAfter: retryAfterSec },
      });
      // @fastify/rate-limit melempar nilai dari builder ini, sehingga WAJIB berupa
      // Error (objek biasa akan menjadi 500 + ERR_SYSTEM).
      const e = new Error('rate limit exceeded');
      e.statusCode = 429;
      e.retryAfterSec = retryAfterSec;
      e.envelopePayload = {
        ok: false,
        error: err,
        requestId: req.id,
        timestamp: new Date().toISOString(),
      };
      return e;
    },
  });

  // ---------- Request logging (tanpa PII) ----------
  fastify.addHook('onRequest', async (request) => {
    logger.info({ method: request.method, url: request.url, rid: request.id }, 'request');
  });

  // ---------- Auth + BYOK + quota untuk /ai/* (skip /health) ----------
  // CATATAN: pemetaan berbasis pathname ternormalisasi — versi sebelumnya hanya
  // memeriksa prefix '/ai' sehingga varian kontrak '/v1/ai/*' LOLOS dari auth.
  //
  // Urutan: autentikasi device/user → resolusi BYOK (`X-Provider-Key`) →
  // baru handler route. Key user TIDAK pernah dicatat: yang di-log hanya
  // fingerprint 8 char (`api-contract.md` §3.7).
  fastify.addHook('onRequest', async (request, reply) => {
    const pathname = request.url.split('?')[0].replace(/\/+$/, '') || '/';
    if (pathname === '/health' || pathname === '/v1/health') return;
    if (pathname === '/ai' || pathname.startsWith('/ai/') || pathname === '/v1/ai' || pathname.startsWith('/v1/ai/')) {
      const r = await authenticate(request, reply);
      if (r) return; // reply sudah dikirim
      const b = await resolveByok(request, reply);
      if (b) return; // reply sudah dikirim
    }
  });

  // ---------- Global error handler (tanpa kebocoran internal) ----------
  fastify.setErrorHandler((error, request, reply) => {
    logger.error({ err: error.message, code: error.code, rid: request.id }, 'unhandled error');

    // Respons rate limit (sudah berbentuk envelope standar dari errorResponseBuilder).
    if (error.rateLimitPayload || error.envelopePayload) {
      const payload = error.envelopePayload || error.rateLimitPayload;
      reply.header('Retry-After', String(error.retryAfterSec || 60));
      return reply.code(429).send(payload);
    }

    const status = error.statusCode || 500;
    // Pesan internal (stack, pesan parser Fastify, pesan driver, pesan upstream)
    // tidak pernah keluar ke client. Pesan user-facing hanya dari error yang kita
    // buat sendiri (sudah lewat `fail`) atau error validasi.
    const GENERIC = {
      400: 'Permintaan tidak valid.',
      401: 'Tidak terautentikasi.',
      403: 'Akses ditolak.',
      404: 'Tidak ditemukan.',
      413: 'Payload terlalu besar.',
      415: 'Tipe konten tidak didukung.',
      429: 'Terlalu banyak permintaan. Coba lagi nanti.',
    };
    const safeMessage = error.validation
      ? 'Payload tidak valid.'
      : (GENERIC[status] || 'Terjadi kesalahan internal.');

    const err = makeError(error.validation ? 'ERR_VALIDATION_SCHEMA' : 'ERR_SYSTEM', safeMessage, {
      httpStatus: status,
      retryable: status >= 500,
      requestId: request.id,
      // Hanya kode teknis (konstanta) yang dibagikan untuk korelasi support,
      // tanpa pesan/stack/nilai dari payload.
      details: error.code ? { code: String(error.code).slice(0, 64) } : null,
    });
    if (status === 429) reply.header('Retry-After', '60');
    reply.code(err.httpStatus).send({ ok: false, error: err, requestId: request.id, timestamp: new Date().toISOString() });
  });

  // ---------- Not found ----------
  fastify.setNotFoundHandler((request, reply) => {
    const err = makeError('ERR_VALIDATION_PAYLOAD', `Endpoint tidak ditemukan: ${request.method} ${request.url}`, {
      httpStatus: 404,
      retryable: false,
      requestId: request.id,
    });
    reply.code(404).send({ ok: false, error: err, requestId: request.id, timestamp: new Date().toISOString() });
  });

  // ---------- Routes ----------
  await fastify.register(healthRoutes);
  await fastify.register(authRoutes, { prefix: '' });
  await fastify.register(aiRoutes, { prefix: '' });
  // Contract base URL compatibility (/v1)
  await fastify.register(healthRoutes, { prefix: '/v1' });
  await fastify.register(authRoutes, { prefix: '/v1' });
  await fastify.register(aiRoutes, { prefix: '/v1' });

  // ---------- Graceful shutdown ----------
  const shutdown = async () => {
    logger.info('shutting down');
    await fastify.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await fastify.listen({ port: config.port, host: config.host });
    logger.info({ port: config.port, host: config.host }, 'Keylox backend listening');
    if (!config.geminiApiKey && !config.mockAi) {
      logger.warn('GEMINI_API_KEY tidak diset. Mode BYOK hanya jalan bila klien mengirim X-Provider-Key; selain itu 401 ERR_AI_NO_KEY. Set env atau MOCK_AI=true.');
    }
    if (config.allowedOrigins.length === 0) {
      logger.warn('ALLOWED_ORIGINS kosong: hanya origin non-browser/null yang diizinkan (klien desktop).');
    }
    // Gerbang validasi output AI (SEC-PROMPT-01): laporkan status nyatanya saat start.
    const gate = await editPlanGate.getGate();
    if (gate.available) {
      logger.info({ source: gate.source }, 'EditPlanOutputSchema kanonik aktif — semua output AI divalidasi');
    } else {
      const level = config.isProduction ? 'error' : 'warn';
      logger[level](
        { reason: gate.reason, candidates: editPlanGate.CANONICAL_CANDIDATES },
        'EditPlanOutputSchema kanonik TIDAK tersedia: output AI ditolak fail-closed (kecuali MOCK_AI=true)',
      );
    }
    if (config.byokRequireUserKey) {
      logger.info('BYOK_REQUIRE_USER_KEY=true: fallback GEMINI_API_KEY dimatikan, X-Provider-Key wajib.');
    }
  } catch (err) {
    logger.error(err, 'failed to start');
    process.exit(1);
  }
}

main();
