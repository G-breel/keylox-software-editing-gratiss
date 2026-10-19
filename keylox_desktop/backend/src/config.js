'use strict';

require('dotenv').config();

const crypto = require('crypto');

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

/**
 * RULE 1 — secrets tidak punya fallback. Bila JWT_SECRET tidak diset:
 *  - production: proses BERHENTI (fail-fast), tidak jalan dengan secret lemah.
 *  - development: secret acak per-proses (ephemeral) — TIDAK pernah ada nilai
 *    hardcoded di source, sehingga tidak ada secret yang bisa bocor lewat repo.
 */
function resolveJwtSecret() {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;
  if (fromEnv && fromEnv.length < 32 && isProduction) {
    console.error('FATAL: JWT_SECRET terlalu pendek (minimal 32 karakter). Refusing to start.');
    process.exit(1);
  }
  if (isProduction) {
    console.error('FATAL: JWT_SECRET tidak diset. Refusing to start (production).');
    process.exit(1);
  }
  // dev-only: ephemeral random secret, token tidak valid antar-restart
  return crypto.randomBytes(32).toString('hex');
}

function parseOrigins(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** §3.5 — TTL cache maksimum (5 menit). Perubahan perilaku v1.2 (dulu 30 hari). */
const CACHE_TTL_MS_MAX = 300000;

/**
 * §3.5 (v1.2) — TTL cache TIDAK pernah melebihi 5 menit, berapa pun nilai env.
 * `CACHE_TTL_MS` tetap dihormati untuk nilai yang lebih kecil (mis. tes expiry).
 */
function resolveCacheTtlMs() {
  const raw = Number(process.env.CACHE_TTL_MS || CACHE_TTL_MS_MAX);
  const value = Number.isFinite(raw) && raw > 0 ? raw : CACHE_TTL_MS_MAX;
  return Math.min(value, CACHE_TTL_MS_MAX);
}

const config = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '127.0.0.1',
  nodeEnv,
  isProduction,
  logLevel: process.env.LOG_LEVEL || 'info',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
  // Key fallback untuk provider default (OpenRouter). Dipakai hanya dev/testing
  // bila BYOK_REQUIRE_USER_KEY=false & !production.
  defaultProviderApiKey: process.env.DEFAULT_PROVIDER_API_KEY
    || process.env.OPENROUTER_API_KEY
    || process.env.GEMINI_API_KEY
    || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  geminiModelVersion: process.env.GEMINI_MODEL_VERSION || '1',
  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 60),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
  authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX || 10),
  dailyQuota: Number(process.env.DAILY_QUOTA || 1000),
  cacheTtlMs: resolveCacheTtlMs(),
  cacheTtlMsMax: CACHE_TTL_MS_MAX,
  cacheMaxEntries: Number(process.env.CACHE_MAX_ENTRIES || 5000),
  redisUrl: process.env.REDIS_URL || '',
  telemetryEnabled: process.env.TELEMETRY_ENABLED === 'true',
  mockAi: process.env.MOCK_AI === 'true',
  // Skenario mock KHUSUS TEST (hanya berlaku bila MOCK_AI=true): dipakai untuk
  // membuktikan output AI yang melanggar schema/invarian benar-benar DITOLAK.
  // Nilai: '' (normal) | 'destructive_no_confirm' | 'unknown_optype' | 'missing_plan'.
  mockAiScenario: process.env.MOCK_AI_SCENARIO || '',

  // ---------- BYOK / proxy (byok-api-key.md §5.2, api-contract §3.7) ----------
  // true = X-Provider-Key WAJIB; fallback GEMINI_API_KEY dimatikan sepenuhnya.
  byokRequireUserKey: process.env.BYOK_REQUIRE_USER_KEY === 'true',
  // Rate limit TAMBAHAN per hash(key) — mencegah satu key dipakai banyak device (§3.7 butir 5).
  providerKeyRateLimitMax: Number(process.env.PROVIDER_KEY_RATE_LIMIT_MAX || 30),
  providerKeyRateLimitWindowMs: Number(process.env.PROVIDER_KEY_RATE_LIMIT_WINDOW_MS || 60000),
  // X-Provider-Key tanpa TLS: hanya diizinkan dari loopback pada dev eksplisit
  // (byok-api-key.md §2.2). Default: aktif di non-production, mati di production.
  allowInsecureLocalProviderKey: process.env.ALLOW_INSECURE_PROVIDER_KEY_LOCALHOST
    ? process.env.ALLOW_INSECURE_PROVIDER_KEY_LOCALHOST === 'true'
    : !isProduction,
  // CORS: allowlist eksplisit. Origin aplikasi desktop (file://) dikirim sebagai
  // "null" oleh Chromium / tanpa header Origin oleh klien native.
  allowedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS),
  allowNullOrigin: process.env.ALLOW_NULL_ORIGIN !== 'false',
  // Hanya aktifkan bila benar-benar di belakang reverse proxy tepercaya,
  // jika tidak X-Forwarded-For bisa dipalsukan (rate limit per-IP dilewati).
  trustProxy: process.env.TRUST_PROXY === 'true',
};

module.exports = config;
