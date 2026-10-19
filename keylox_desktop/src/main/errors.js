'use strict';

/**
 * Kode error + shape ErrorShape (kontrak v1.1 §5).
 *
 * Tabel semantik & `retryable` mengikuti `api-contract.md` §5.2.1 (BYOK/proxy).
 * Modul murni Node (bisa diuji unit).
 *
 * Aturan keras (§5.2.1 catatan): TIDAK ADA kode di sini yang boleh membawa key di
 * `message`/`details` — `details` hanya memuat nama field/konstanta, bukan nilai.
 */

const RETRYABLE = Object.freeze({
  ERR_AI_NO_KEY: false,
  ERR_PROVIDER_KEY_INVALID: false,
  ERR_PROVIDER_UNSUPPORTED: false,
  ERR_PROVIDER_UNREACHABLE: true,
  ERR_SECURE_STORAGE_UNAVAILABLE: true,
  ERR_AI_INVALID_RESPONSE: true,
  ERR_AI_RATE_LIMIT: true,
  ERR_AI_TIMEOUT: true,
  ERR_AI_QUOTA_EXCEEDED: false,
  ERR_AI_OFFLINE: true,
  ERR_AI_UNSAFE_CONTENT: false,
  ERR_VALIDATION_PAYLOAD: false,
  ERR_VALIDATION_SCHEMA: false,
  ERR_VALIDATION_SECRET_IN_PLAIN_SETTING: false,
  ERR_IPC_CHANNEL_DENIED: false,
  ERR_FS_PERMISSION: false,
  // [v1.2] §5.2.1 — provider, model & privasi.
  ERR_PROVIDER_INCOMPATIBLE: false,
  ERR_PROVIDER_MODEL_UNSUPPORTED: false,
  ERR_PROVIDER_BASE_URL_NOT_ALLOWED: false,
  ERR_PRIVACY_CONSENT_REQUIRED: false,
  ERR_PRIVACY_LOCAL_ONLY_BLOCKED: false,
});

const HTTP_STATUS = Object.freeze({
  ERR_AI_NO_KEY: 401,
  ERR_PROVIDER_KEY_INVALID: 401,
  ERR_PROVIDER_UNREACHABLE: 502,
  ERR_PROVIDER_UNSUPPORTED: 400,
  ERR_AI_INVALID_RESPONSE: 502,
  ERR_AI_RATE_LIMIT: 429,
  ERR_AI_TIMEOUT: 504,
  ERR_AI_UNSAFE_CONTENT: 400,
  // [v1.2] §5.2.1
  ERR_PROVIDER_INCOMPATIBLE: 422,
  ERR_PROVIDER_MODEL_UNSUPPORTED: 400,
  ERR_PROVIDER_BASE_URL_NOT_ALLOWED: 400,
  ERR_PRIVACY_CONSENT_REQUIRED: 403,
});

class KeyloxError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'KeyloxError';
    this.code = code;
    this.retryable = options.retryable !== undefined ? options.retryable : RETRYABLE[code] === true;
    this.details = options.details;
    this.httpStatus = options.httpStatus !== undefined ? options.httpStatus : HTTP_STATUS[code];
    this.timestamp = new Date().toISOString();
    this.requestId = options.requestId;
  }
}

/** ErrorShape (kontrak §5.1) — aman untuk dikirim ke renderer (tanpa rahasia). */
function toErrorShape(error, fallbackCode = 'ERR_VALIDATION_PAYLOAD') {
  if (error instanceof KeyloxError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
      retryable: error.retryable,
      ...(error.httpStatus !== undefined ? { httpStatus: error.httpStatus } : {}),
      timestamp: error.timestamp || new Date().toISOString(),
      ...(error.requestId ? { requestId: error.requestId } : {}),
    };
  }
  return {
    code: fallbackCode,
    message: error && error.message ? String(error.message) : 'Kesalahan tidak dikenal.',
    retryable: RETRYABLE[fallbackCode] === true,
    timestamp: new Date().toISOString(),
  };
}

module.exports = { KeyloxError, toErrorShape, RETRYABLE, HTTP_STATUS };
