'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const { makeError, ErrorCodes } = require('../errors');
const logger = require('../logger');
const usage = require('../services/usage');

// JWT selalu HS256 (algoritma di-pin; token tidak boleh menentukan alg-nya sendiri).
const JWT_ALGORITHM = 'HS256';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Safety net anti rotasi deviceId (klien mengendalikan header ini).
const IP_QUOTA_MULTIPLIER = 3;

function isValidDeviceId(value) {
  return typeof value === 'string' && UUID_V4.test(value);
}

function extractDeviceId(request) {
  const raw = request.headers['x-device-id'] || request.headers['x-deviceid'] || null;
  return raw ? String(raw) : null;
}

function verifyJwt(token) {
  try {
    // algorithms eksplisit → menolak alg:none dan alg confusion.
    return jwt.verify(token, config.jwtSecret, { algorithms: [JWT_ALGORITHM] });
  } catch (e) {
    return null;
  }
}

function issueDeviceToken(deviceId) {
  return jwt.sign({ deviceId, type: 'device' }, config.jwtSecret, {
    algorithm: JWT_ALGORITHM,
    expiresIn: config.jwtExpiresIn,
  });
}

function unauthorized(reply, request, message) {
  const err = makeError(ErrorCodes.AUTH_TOKEN_EXPIRED, message, {
    httpStatus: 401,
    retryable: false,
    requestId: request.id,
  });
  reply.code(401).send({ ok: false, error: err, requestId: request.id, timestamp: new Date().toISOString() });
  return reply;
}

function quotaExceeded(reply, request) {
  const err = makeError(ErrorCodes.AI_QUOTA_EXCEEDED, 'Kuota harian terlampaui. Coba lagi besok.', {
    httpStatus: 429,
    retryable: true,
    requestId: request.id,
    details: { dailyQuota: config.dailyQuota },
  });
  const tomorrow = new Date();
  tomorrow.setUTCHours(24, 0, 0, 0);
  reply.header('Retry-After', String(Math.max(60, Math.floor((tomorrow.getTime() - Date.now()) / 1000))));
  reply.code(429).send({ ok: false, error: err, requestId: request.id, timestamp: new Date().toISOString() });
  return reply;
}

/**
 * Autentikasi + kuota untuk endpoint /ai/*.
 * - deviceId tanpa JWT = mode guest (header X-Device-Id, UUID v4).
 * - bila JWT valid → deviceId diambil dari klaim token (header tidak dipercaya).
 * - kuota harian ditegakkan per-device, plus plafon per-IP sebagai pengaman.
 */
async function authenticate(request, reply) {
  const headerDeviceId = extractDeviceId(request);
  if (headerDeviceId && !isValidDeviceId(headerDeviceId)) {
    const err = makeError(ErrorCodes.VALIDATION_PAYLOAD, 'X-Device-Id harus UUID v4.', {
      httpStatus: 400,
      retryable: false,
      requestId: request.id,
    });
    reply.code(400).send({ ok: false, error: err, requestId: request.id, timestamp: new Date().toISOString() });
    return reply;
  }

  request.deviceId = headerDeviceId || 'anonymous';
  request.userId = null;

  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = verifyJwt(token);
    if (!payload) {
      return unauthorized(reply, request, 'Token JWT tidak valid atau kedaluwarsa.');
    }
    // Token terikat ke perangkat yang menerbitkannya.
    if (payload.deviceId && headerDeviceId && payload.deviceId !== headerDeviceId) {
      logger.warn({ rid: request.id }, 'device token mismatch');
      return unauthorized(reply, request, 'Token tidak cocok dengan perangkat ini.');
    }
    request.deviceId = payload.deviceId || request.deviceId;
    request.userId = payload.sub || payload.userId || null;
    request.jwtPayload = payload;
  }

  // ---- Kuota harian (per-device + plafon per-IP) ----
  const ipKey = `ip:${request.ip}`;
  const deviceUsage = usage.getUsage(request.deviceId);
  const ipUsage = usage.getUsage(ipKey);
  if (deviceUsage.requests >= config.dailyQuota || ipUsage.requests >= config.dailyQuota * IP_QUOTA_MULTIPLIER) {
    logger.warn({ deviceId: request.deviceId, ip: request.ip }, 'daily quota exceeded');
    return quotaExceeded(reply, request);
  }
  // Hitung percobaan (attempt), bukan hanya yang sukses.
  usage.countRequest(request.deviceId);
  usage.countRequest(ipKey);

  // helper
  request.issueToken = () => issueDeviceToken(request.deviceId);
  return undefined;
}

module.exports = { authenticate, issueDeviceToken, verifyJwt, extractDeviceId, isValidDeviceId, JWT_ALGORITHM };
