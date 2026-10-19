'use strict';

/**
 * Konstanta bersama Keylox v1.2 — `api-contract.md` §2.12.5, §2.14.3, §2.15, §3.5, §5.2.
 *
 * **Data murni (CJS), tanpa rahasia.** Aman di-`require()` oleh main process, backend,
 * unit test, dan (bila perlu) renderer. Tidak ada nilai API key di berkas ini.
 *
 * Prinsip: satu nama kanonik per konsep. Bila `api-contract.md` berubah, berkas ini
 * yang disesuaikan lebih dulu — kode tidak menebak nama channel/jobType/mode/error.
 */

/* ------------------------------------------------------------------ *
 * jobType — §2.14.3
 * ------------------------------------------------------------------ */

/**
 * `jobType` KANONIK (§2.14.3) — 18 nilai. `transcribe` adalah nama kanonik;
 * `asr` hanya alias lama (lihat `capabilityMatrix.JOB_TYPE_ALIASES`).
 * @type {readonly string[]}
 */
const JOB_TYPES = Object.freeze([
  'parse_command', 'chat', 'refine',
  'transcribe', 'scene_detect', 'ocr', 'metadata', 'thumbnail',
  'vision_color', 'tts', 'translate', 'moderation',
  'highlight', 'montage', 'search', 'index_asset', 'script', 'reframe',
]);

/**
 * `jobType` yang boleh dipanggil renderer lewat `ai:invoke` (§2.12.5 enum) — 12 nilai.
 * @type {readonly string[]}
 */
const CLIENT_JOB_TYPES = Object.freeze([
  'parse_command', 'chat', 'refine', 'transcribe', 'scene_detect',
  'ocr', 'metadata', 'thumbnail', 'vision_color', 'tts', 'translate', 'moderation',
]);

/**
 * `jobType` yang hasilnya berupa `EditPlan` dan WAJIB lolos `EditPlanOutputSchema`
 * sebelum menyeberang ke renderer (§3.3).
 * @type {readonly string[]}
 */
const EDIT_PLAN_JOB_TYPES = Object.freeze(['parse_command', 'chat', 'refine']);

/**
 * `jobType` STRUKTURAL/NUMERIK yang BOLEH masuk cache backend (§3.5).
 * Semua jobType lain = berkonten → **tidak pernah** di-cache.
 * @type {readonly string[]}
 */
const CACHEABLE_JOB_TYPES = Object.freeze([
  'scene_detect', 'thumbnail', 'vision_color', 'reframe', 'index_asset',
]);

/** TTL cache maksimum di produksi (§3.5) = 5 menit. */
const CACHE_TTL_MS_MAX = 300000;
/** TTL cache default backend (§3.5). */
const CACHE_TTL_MS_DEFAULT = 300000;

/* ------------------------------------------------------------------ *
 * Privasi — §2.15
 * ------------------------------------------------------------------ */

/** Mode privasi (tiga tingkat) — §2.15. @type {readonly string[]} */
const PRIVACY_MODES = Object.freeze(['local-only', 'standard', 'cloud']);
/** Mode default pabrik (§2.15). */
const DEFAULT_PRIVACY_MODE = 'standard';
/** Cakupan konfirmasi eksternal yang didukung (§2.15.3). */
const CONFIRM_SCOPES = Object.freeze(['once', 'session', 'always']);
/** Scope `data:wipeLocal` (§2.15.4). */
const WIPE_SCOPES = Object.freeze(['cache', 'usage', 'all']);
/** Pref key sumber sementara mode privasi di `settings.enc` (§2.15). */
const PRIVACY_MODE_PREF_KEY = 'privacy.mode';

/* ------------------------------------------------------------------ *
 * Channel IPC baru v1.2 (§2.12.7, §2.15, §2.16)
 * ------------------------------------------------------------------ */

/** 7 channel baru v1.2 yang WAJIB ada di allowlist preload (DoD rework). */
const NEW_CHANNELS_V12 = Object.freeze([
  'shell:openExternal',
  'usage:get',
  'privacy:getMode',
  'privacy:setMode',
  'privacy:confirmExternal',
  'data:wipeLocal',
  'data:exportLocal',
]);

/* ------------------------------------------------------------------ *
 * Kode error baru v1.2 (§5.2 / §5.2.1)
 * ------------------------------------------------------------------ */

/** Kode error baru v1.2 beserta semantik retryable/httpStatus (§5.2.1). */
const ERROR_CODES_V12 = Object.freeze({
  ERR_PROVIDER_INCOMPATIBLE: Object.freeze({ retryable: false, httpStatus: 422 }),
  ERR_PROVIDER_MODEL_UNSUPPORTED: Object.freeze({ retryable: false, httpStatus: 400 }),
  ERR_PROVIDER_BASE_URL_NOT_ALLOWED: Object.freeze({ retryable: false, httpStatus: 400 }),
  ERR_PRIVACY_CONSENT_REQUIRED: Object.freeze({ retryable: false, httpStatus: 403 }),
  ERR_PRIVACY_LOCAL_ONLY_BLOCKED: Object.freeze({ retryable: false, httpStatus: undefined }),
});

/** Alasan penolakan `shell:openExternal` (§2.12.7). */
const EXTERNAL_URL_NOT_ALLOWED = 'external_url_not_allowed';

module.exports = {
  JOB_TYPES,
  CLIENT_JOB_TYPES,
  EDIT_PLAN_JOB_TYPES,
  CACHEABLE_JOB_TYPES,
  CACHE_TTL_MS_MAX,
  CACHE_TTL_MS_DEFAULT,
  PRIVACY_MODES,
  DEFAULT_PRIVACY_MODE,
  CONFIRM_SCOPES,
  WIPE_SCOPES,
  PRIVACY_MODE_PREF_KEY,
  NEW_CHANNELS_V12,
  ERROR_CODES_V12,
  EXTERNAL_URL_NOT_ALLOWED,
};
