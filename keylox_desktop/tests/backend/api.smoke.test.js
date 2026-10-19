'use strict';

// Integration / smoke tests: real backend over HTTP.
// Runner: `node --test "tests/backend/*.test.js"`
//
// Boots `backend/src/index.js` once (MOCK_AI=true, ephemeral port) via
// helpers/server.js, then exercises the real endpoints. Verifies the API
// contract end-to-end: envelope shape, validation errors, auth/quota hooks and
// — most importantly for Stage 4/5 handoff — that /ai/parse-command actually
// returns a schema-valid EditPlan (AC-8).

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers/server');
const {
  aiParseResultSchema,
  envelopeSchema,
  errorShapeSchema,
} = require('./helpers/editPlanContract');

// Valid UUID v4 device ids (middleware/auth.js rejects anything else with 400).
const DEVICE_A = '11111111-1111-4111-8111-111111111111';
const DEVICE_B = '22222222-2222-4222-8222-222222222222';

let server;

before(async () => {
  server = await startServer();
});

after(async () => {
  if (server) await server.stop();
});

async function request(method, path, { body, headers } = {}) {
  const res = await fetch(server.baseUrl + path, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(headers || {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON body: keep raw text */ }
  return { status: res.status, json, text };
}

// ---------------------------------------------------------------- health

test('GET /health returns a healthy envelope', async () => {
  const { status, json } = await request('GET', '/health');
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.data.status, 'healthy');
  assert.equal(json.data.mockAi, true, 'MOCK_AI must be on — no Gemini key in tests');
  assert.equal(typeof json.data.version, 'string');
  assert.equal(typeof json.data.cache, 'object');
  assert.equal(typeof json.data.queue, 'object');
  assert.equal(envelopeSchema.safeParse(json).success, true);
});

test('GET /v1/health (contract base-URL alias) responds', async () => {
  const { status, json } = await request('GET', '/v1/health');
  assert.equal(status, 200);
  assert.equal(json.ok, true);
});

test('unknown endpoint returns 404 with the uniform error shape', async () => {
  const { status, json } = await request('GET', '/no-such-endpoint');
  assert.equal(status, 404);
  assert.equal(json.ok, false);
  assert.equal(json.error.code, 'ERR_VALIDATION_PAYLOAD');
  assert.equal(json.error.retryable, false);
  assert.equal(errorShapeSchema.safeParse(json.error).success, true);
});

// ------------------------------------------------------- /ai/parse-command

test('POST /ai/parse-command returns a schema-valid EditPlan (AC-8)', async () => {
  const { status, json } = await request('POST', '/ai/parse-command', {
    headers: { 'x-device-id': DEVICE_A },
    body: { rawText: 'bikin video cinematic', inputMode: 'text', language: 'auto', context: {} },
  });

  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(envelopeSchema.safeParse(json).success, true);

  const parsed = aiParseResultSchema.safeParse(json.data);
  assert.equal(parsed.success, true, parsed.success ? '' : JSON.stringify(parsed.error.issues));
  assert.ok(Array.isArray(json.data.editPlan.ops));
  assert.equal(typeof json.data.latencyMs, 'number');
  assert.equal(typeof json.data.cacheHit, 'boolean');
});

test('POST /ai/parse-command rejects a missing rawText (400, ERR_VALIDATION_PAYLOAD)', async () => {
  const { status, json } = await request('POST', '/ai/parse-command', {
    headers: { 'x-device-id': DEVICE_A },
    body: { inputMode: 'text' },
  });
  assert.equal(status, 400);
  assert.equal(json.ok, false);
  assert.equal(json.error.code, 'ERR_VALIDATION_PAYLOAD');
  assert.equal(json.error.retryable, false);
});

test('POST /ai/parse-command rejects rawText over the 4000-char limit (boundary)', async () => {
  const { status, json } = await request('POST', '/ai/parse-command', {
    headers: { 'x-device-id': DEVICE_A },
    body: { rawText: 'a'.repeat(4001), inputMode: 'text' },
  });
  assert.equal(status, 400);
  assert.equal(json.error.code, 'ERR_VALIDATION_PAYLOAD');
});

test('POST /ai/parse-command rejects a non-UUID X-Device-Id (400)', async () => {
  const { status, json } = await request('POST', '/ai/parse-command', {
    headers: { 'x-device-id': 'not-a-uuid' },
    body: { rawText: 'potong 5 detik pertama' },
  });
  assert.equal(status, 400);
  assert.equal(json.error.code, 'ERR_VALIDATION_PAYLOAD');
  assert.match(json.error.message, /uuid/i);
});

test('identical input is served from cache on the second call (AC-11)', async () => {
  const unique = 'qe-cache-probe-' + Date.now();
  const body = { rawText: unique, inputMode: 'text', language: 'auto', context: {} };

  const first = await request('POST', '/ai/parse-command', { headers: { 'x-device-id': DEVICE_A }, body });
  const second = await request('POST', '/ai/parse-command', { headers: { 'x-device-id': DEVICE_A }, body });

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(first.json.data.cacheHit, false, 'first call must be a cache miss');
  assert.equal(second.json.data.cacheHit, true, 'identical second call must be a cache hit');
});

// ----------------------------------------------------------------- usage

test('GET /ai/usage reports per-device usage and cache stats', async () => {
  const { status, json } = await request('GET', '/ai/usage', { headers: { 'x-device-id': DEVICE_A } });
  assert.equal(status, 200);
  assert.equal(json.data.deviceId, DEVICE_A);
  assert.equal(typeof json.data.tokensIn, 'number');
  assert.equal(typeof json.data.requests, 'number');
  assert.equal(typeof json.data.dailyQuota, 'number');
  assert.equal(typeof json.data.cache.hitRate, 'number');
});

// ------------------------------------------------------------------ jobs

test('POST /ai/jobs rejects an unknown jobType (400)', async () => {
  const { status, json } = await request('POST', '/ai/jobs', {
    headers: { 'x-device-id': DEVICE_A },
    body: { jobType: 'not_a_job', inputRef: 'asset-1' },
  });
  assert.equal(status, 400);
  assert.equal(json.error.code, 'ERR_VALIDATION_PAYLOAD');
});

test('POST /ai/jobs rejects a missing inputRef (400)', async () => {
  const { status } = await request('POST', '/ai/jobs', {
    headers: { 'x-device-id': DEVICE_A },
    body: { jobType: 'asr' },
  });
  assert.equal(status, 400);
});

test('POST /ai/jobs accepts a valid job and returns 202 + jobId', async () => {
  const { status, json } = await request('POST', '/ai/jobs', {
    headers: { 'x-device-id': DEVICE_A },
    body: { jobType: 'asr', inputRef: 'asset-xyz', params: { language: 'id' } },
  });
  assert.equal(status, 202);
  assert.equal(json.ok, true);
  assert.match(json.data.jobId, /^[0-9a-f-]{36}$/i);
  assert.equal(typeof json.data.status, 'string');
});

test('GET /ai/jobs/:jobId returns 404 for an unknown job', async () => {
  const { status, json } = await request('GET', '/ai/jobs/00000000-0000-0000-0000-000000000000', {
    headers: { 'x-device-id': DEVICE_A },
  });
  assert.equal(status, 404);
  assert.equal(json.error.code, 'ERR_VALIDATION_PAYLOAD');
});

test('DELETE /ai/jobs/:jobId returns 404 for an unknown job', async () => {
  const { status } = await request('DELETE', '/ai/jobs/00000000-0000-0000-0000-000000000000', {
    headers: { 'x-device-id': DEVICE_A },
  });
  assert.equal(status, 404);
});

// ----------------------------------------------------------- auth/quota

test('POST /auth/token issues a Bearer JWT for a valid device id', async () => {
  const { status, json } = await request('POST', '/auth/token', { headers: { 'x-device-id': DEVICE_A } });
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.data.tokenType, 'Bearer');
  assert.equal(typeof json.data.accessToken, 'string');
  assert.equal(json.data.accessToken.split('.').length, 3, 'JWT must have 3 parts');
});

test('a valid Bearer token authorises /ai/usage for its own device', async () => {
  const token = (await request('POST', '/auth/token', { headers: { 'x-device-id': DEVICE_A } })).json.data.accessToken;
  const { status, json } = await request('GET', '/ai/usage', {
    headers: { 'x-device-id': DEVICE_A, authorization: `Bearer ${token}` },
  });
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.data.deviceId, DEVICE_A);
});

test('a token bound to one device is rejected on another device (401)', async () => {
  const token = (await request('POST', '/auth/token', { headers: { 'x-device-id': DEVICE_A } })).json.data.accessToken;
  const { status, json } = await request('GET', '/ai/usage', {
    headers: { 'x-device-id': DEVICE_B, authorization: `Bearer ${token}` },
  });
  assert.equal(status, 401);
  assert.equal(json.error.code, 'ERR_AUTH_TOKEN_EXPIRED');
});

test('a garbage Bearer token is rejected (401)', async () => {
  const { status, json } = await request('GET', '/ai/usage', {
    headers: { 'x-device-id': DEVICE_A, authorization: 'Bearer not.a.jwt' },
  });
  assert.equal(status, 401);
  assert.equal(json.ok, false);
});
