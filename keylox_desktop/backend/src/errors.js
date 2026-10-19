'use strict';

const { v4: uuidv4 } = require('uuid');

function makeError(code, message, opts = {}) {
  return {
    code,
    message,
    details: opts.details ?? null,
    retryable: Boolean(opts.retryable),
    httpStatus: opts.httpStatus ?? 500,
    timestamp: new Date().toISOString(),
    requestId: opts.requestId || uuidv4(),
  };
}

const ErrorCodes = {
  AI_NO_KEY: 'ERR_AI_NO_KEY',
  AI_TIMEOUT: 'ERR_AI_TIMEOUT',
  AI_INVALID_RESPONSE: 'ERR_AI_INVALID_RESPONSE',
  AI_RATE_LIMIT: 'ERR_AI_RATE_LIMIT',
  AI_QUOTA_EXCEEDED: 'ERR_AI_QUOTA_EXCEEDED',
  AI_OFFLINE: 'ERR_AI_OFFLINE',
  AI_UNSAFE_CONTENT: 'ERR_AI_UNSAFE_CONTENT',
  // BYOK / provider (`api-contract.md` §5.2 namespace ERR_PROVIDER_*)
  PROVIDER_KEY_INVALID: 'ERR_PROVIDER_KEY_INVALID',
  PROVIDER_UNREACHABLE: 'ERR_PROVIDER_UNREACHABLE',
  PROVIDER_UNSUPPORTED: 'ERR_PROVIDER_UNSUPPORTED',
  // [v1.2] §5.2.1 — kapabilitas, model, baseUrl, privasi.
  PROVIDER_INCOMPATIBLE: 'ERR_PROVIDER_INCOMPATIBLE',
  PROVIDER_MODEL_UNSUPPORTED: 'ERR_PROVIDER_MODEL_UNSUPPORTED',
  PROVIDER_BASE_URL_NOT_ALLOWED: 'ERR_PROVIDER_BASE_URL_NOT_ALLOWED',
  PRIVACY_CONSENT_REQUIRED: 'ERR_PRIVACY_CONSENT_REQUIRED',
  PRIVACY_LOCAL_ONLY_BLOCKED: 'ERR_PRIVACY_LOCAL_ONLY_BLOCKED',
  VALIDATION_PAYLOAD: 'ERR_VALIDATION_PAYLOAD',
  AUTH_TOKEN_EXPIRED: 'ERR_AUTH_TOKEN_EXPIRED',
  SYSTEM: 'ERR_SYSTEM',
};

module.exports = { makeError, ErrorCodes };
