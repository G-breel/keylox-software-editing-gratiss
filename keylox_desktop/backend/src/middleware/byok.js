'use strict';

/**
 * Middleware BYOK (mode PROXY) — `byok-api-key.md` §5.2, `api-contract.md` §3.7.
 *
 * Tanggung jawab:
 *  1. Resolusi provider dari `X-Provider` (default `gemini`; belum didukung →
 *     `ERR_PROVIDER_UNSUPPORTED`).
 *  2. Validasi `X-Provider-Base-Url` (opsional) terhadap allowlist host + aturan
 *     anti-SSRF — header ini tidak pernah dipercaya apa adanya.
 *  3. Key dari `X-Provider-Key`: TLS-only, format diverifikasi, TIDAK PERNAH dicatat.
 *     Absen → fallback `GEMINI_API_KEY` env HANYA di dev/testing, kecuali
 *     `BYOK_REQUIRE_USER_KEY=true` (atau production) → `ERR_AI_NO_KEY`.
 *  4. Rate limit TAMBAHAN per `hash(key)` (di samping limit per user/device/IP).
 *
 * Hasil yang ditempelkan ke request untuk dipakai route/service:
 *   request.provider, request.providerBaseUrl, request.providerKey,
 *   request.providerKeyFingerprint (8 char hash — BUKAN key), request.providerKeySource.
 */

const config = require('../config');
const logger = require('../logger');
const { makeError, ErrorCodes } = require('../errors');
const { fail } = require('../utils/envelope');
const { sha256 } = require('../utils/hash');
const registry = require('../services/providerRegistry');

// Bucket rate limit per hash(key) — in-memory (MVP), tidak menyimpan key.
const KEY_BUCKETS = new Map();
const MAX_BUCKETS = 5000;

function pruneBuckets(now) {
  if (KEY_BUCKETS.size <= MAX_BUCKETS) return;
  for (const [fp, rec] of KEY_BUCKETS) {
    if (rec.resetAt <= now) KEY_BUCKETS.delete(fp);
  }
  // Bila masih penuh (semua bucket aktif), buang entri paling tua.
  if (KEY_BUCKETS.size > MAX_BUCKETS) {
    const oldest = [...KEY_BUCKETS.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt).slice(0, 100);
    for (const [fp] of oldest) KEY_BUCKETS.delete(fp);
  }
}

/** @returns {{allowed:boolean, retryAfterSec?:number}} */
function checkProviderKeyRateLimit(fingerprint) {
  const now = Date.now();
  const windowMs = config.providerKeyRateLimitWindowMs;
  pruneBuckets(now);

  const rec = KEY_BUCKETS.get(fingerprint);
  if (!rec || now >= rec.resetAt) {
    KEY_BUCKETS.set(fingerprint, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }
  rec.count += 1;
  if (rec.count > config.providerKeyRateLimitMax) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((rec.resetAt - now) / 1000)) };
  }
  return { allowed: true };
}

function extractProviderKey(request) {
  const raw = request.headers['x-provider-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function isTlsRequest(request) {
  if (request.protocol === 'https') return true;
  if (config.trustProxy) {
    const proto = String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
    if (proto === 'https') return true;
  }
  return false;
}

function noKeyError(requestId) {
  return makeError(ErrorCodes.AI_NO_KEY, 'Tidak ada API key provider. Atur API key di Settings › AI Provider.', {
    httpStatus: 401,
    retryable: false,
    requestId,
    details: { reason: 'no_provider_key' },
  });
}

/**
 * @returns {Promise<object|undefined>} `reply` bila request ditolak (response sudah dikirim).
 */
async function resolveByok(request, reply) {
  let provider;
  try {
    provider = registry.resolveProvider(request.headers['x-provider']);
  } catch (err) {
    return fail(reply, err, request.id);
  }

  request.provider = provider.id;
  request.providerKey = null;
  request.providerKeyFingerprint = null;
  request.providerKeySource = 'none';
  request.providerBaseUrl = null;

  try {
    const validated = registry.assertBaseUrlAllowed(request.headers['x-provider-base-url'], provider);
    // §3.7 butir 3 / §3.8 butir 5 (v1.2): `X-Provider-Base-Url` hanya relevan untuk
    // ROUTING pada provider `custom`/lokal. Untuk provider registry, header tetap
    // DIVALIDASI anti-SSRF (permintaan berbahaya ditolak), tetapi origin yang
    // diberikan klien DIABAIKAN — backend memakai `baseUrl` registry.
    request.providerBaseUrl = provider.clientBaseUrl ? validated : null;
  } catch (err) {
    return fail(reply, err, request.id);
  }

  const rawKey = extractProviderKey(request);
  if (!rawKey) {
    // Fallback dev/testing sah; production & BYOK_REQUIRE_USER_KEY menolak (§3.7 butir 2).
    if (config.byokRequireUserKey || config.isProduction) {
      logger.warn({ provider: provider.id, rid: request.id }, 'request AI tanpa X-Provider-Key ditolak');
      return fail(reply, noKeyError(request.id), request.id);
    }
    request.providerKeySource = (config.defaultProviderApiKey || config.geminiApiKey) ? 'env' : 'none';
    return undefined;
  }

  // TLS-only (`byok-api-key.md` §2.2): pengecualian hanya loopback dev eksplisit.
  if (!isTlsRequest(request)
    && !(config.allowInsecureLocalProviderKey && registry.isLoopbackAddress(request.ip))) {
    return fail(reply, makeError(
      ErrorCodes.VALIDATION_PAYLOAD,
      'X-Provider-Key hanya boleh dikirim melalui HTTPS.',
      { httpStatus: 400, retryable: false, requestId: request.id, details: { reason: 'insecure_transport' } },
    ), request.id);
  }

  let key;
  try {
    key = registry.assertProviderKeyFormat(provider.id, rawKey);
  } catch (err) {
    return fail(reply, err, request.id);
  }

  const fingerprint = sha256(key).slice(0, 8);
  const limit = checkProviderKeyRateLimit(fingerprint);
  if (!limit.allowed) {
    reply.header('Retry-After', String(limit.retryAfterSec));
    return fail(reply, makeError(ErrorCodes.AI_RATE_LIMIT, 'Terlalu banyak permintaan untuk API key ini. Coba lagi nanti.', {
      httpStatus: 429,
      retryable: true,
      requestId: request.id,
      details: { retryAfter: limit.retryAfterSec, scope: 'provider_key' },
    }), request.id);
  }

  request.providerKey = key;
  request.providerKeyFingerprint = fingerprint;
  request.providerKeySource = 'user';
  // Hanya fingerprint — TIDAK pernah nilai key (api-contract §3.7).
  logger.debug({ provider: provider.id, keyFp: fingerprint, rid: request.id }, 'BYOK provider key resolved');
  return undefined;
}

function __resetRateLimitForTest() {
  KEY_BUCKETS.clear();
}

module.exports = {
  resolveByok,
  isTlsRequest,
  extractProviderKey,
  checkProviderKeyRateLimit,
  __resetRateLimitForTest,
};
