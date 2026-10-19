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
  VALIDATION_PAYLOAD: 'ERR_VALIDATION_PAYLOAD',
  AUTH_TOKEN_EXPIRED: 'ERR_AUTH_TOKEN_EXPIRED',
  SYSTEM: 'ERR_SYSTEM',
};

module.exports = { makeError, ErrorCodes };
