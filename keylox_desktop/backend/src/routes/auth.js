'use strict';

const { issueDeviceToken, isValidDeviceId } = require('../middleware/auth');
const { ok, fail } = require('../utils/envelope');
const { makeError, ErrorCodes } = require('../errors');

async function authRoutes(fastify) {
  fastify.post('/auth/token', {
    // Endpoint penerbitan token: limit ketat per IP (anti brute-force / abuse).
    config: {
      rateLimit: { max: 10, timeWindow: '1 minute' },
    },
  }, async (request, reply) => {
    const deviceId = request.headers['x-device-id'];
    if (!deviceId) {
      const err = makeError(ErrorCodes.VALIDATION_PAYLOAD, 'X-Device-Id header wajib.', { httpStatus: 400, retryable: false, requestId: request.id });
      return fail(reply, err, request.id);
    }
    if (!isValidDeviceId(String(deviceId))) {
      const err = makeError(ErrorCodes.VALIDATION_PAYLOAD, 'X-Device-Id harus UUID v4.', { httpStatus: 400, retryable: false, requestId: request.id });
      return fail(reply, err, request.id);
    }
    reply.header('Cache-Control', 'no-store');
    const token = issueDeviceToken(String(deviceId));
    return ok(reply, { accessToken: token, tokenType: 'Bearer', expiresIn: '30d' }, request.id);
  });
}

module.exports = authRoutes;
