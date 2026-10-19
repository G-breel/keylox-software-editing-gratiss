'use strict';

// Tes kebijakan cache backend v1.2 (api-contract v1.2 §3.5/§3.8, ADR-05).
//
// Yang dikunci di sini:
//  - paritas daftar provider/harga/TTL dengan `src/shared/**` (backend tidak
//    me-require lintas paket, jadi salinan wajib identik);
//  - hanya jobType struktural/numerik yang boleh ditulis & dibaca dari cache;
//  - `updateAgeOnGet:false` — membaca cache TIDAK memperpanjang TTL;
//  - TTL produksi tidak pernah melebihi 5 menit.

const test = require('node:test');
const assert = require('node:assert/strict');

const sharedRegistry = require('../../src/shared/providerRegistry');
const sharedConstants = require('../../src/shared/constants');
const usageSchema = require('../../src/shared/usage.schema');
const config = require('../../backend/src/config');
const cache = require('../../backend/src/services/cache');
const backendRegistry = require('../../backend/src/services/providerRegistry');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('paritas CACHEABLE_JOB_TYPES dengan shared/constants.js', () => {
  assert.deepEqual([...cache.CACHEABLE_JOB_TYPES], [...sharedConstants.CACHEABLE_JOB_TYPES]);
  assert.deepEqual([...cache.CACHEABLE_JOB_TYPES].sort(), [
    'index_asset', 'reframe', 'scene_detect', 'thumbnail', 'vision_color',
  ]);
  for (const jobType of cache.CACHEABLE_JOB_TYPES) assert.equal(cache.isCacheableJobType(jobType), true);
  for (const jobType of ['parse_command', 'chat', 'refine', 'transcribe', 'ocr', 'translate', 'moderation', 'tts']) {
    assert.equal(cache.isCacheableJobType(jobType), false, jobType);
  }
  assert.equal(cache.isCacheableJobType(null), false);
  assert.equal(cache.isCacheableJobType(42), false);
});

test('paritas registry backend: 13 id, host, defaultModel & harga', () => {
  assert.deepEqual([...backendRegistry.PROVIDER_IDS], [...sharedRegistry.PROVIDER_IDS]);
  assert.equal(backendRegistry.PROVIDER_IDS.length, 13);
  assert.equal(backendRegistry.DEFAULT_PROVIDER, sharedRegistry.DEFAULT_PROVIDER);

  for (const id of sharedRegistry.PROVIDER_IDS) {
    const shared = sharedRegistry.PROVIDERS[id];
    const backend = backendRegistry.PROVIDERS[id];
    assert.ok(backend, `provider ${id} hilang di backend`);
    assert.equal(backend.id, id);
    assert.equal(backend.supported, true, `${id} wajib supported`);
    assert.equal(backend.defaultModel, shared.defaultModel, `defaultModel ${id}`);
    assert.deepEqual([...backend.hosts], shared.host ? [shared.host] : [], `hosts ${id}`);
    assert.equal(
      backend.clientBaseUrl,
      sharedRegistry.CLIENT_BASE_URL_PROVIDER_IDS.includes(id),
      `clientBaseUrl ${id}`,
    );
    if (shared.pricePer1M === null) {
      assert.equal(backend.pricePer1M, null, `price ${id}`);
    } else {
      assert.deepEqual({ ...backend.pricePer1M }, { ...shared.pricePer1M }, `price ${id}`);
    }
  }
});

test('TTL cache dijepit ≤ 5 menit & default sesuai shared', () => {
  assert.equal(config.cacheTtlMsMax, sharedConstants.CACHE_TTL_MS_MAX);
  assert.equal(sharedConstants.CACHE_TTL_MS_MAX, 300000);
  assert.ok(config.cacheTtlMs > 0);
  assert.ok(config.cacheTtlMs <= config.cacheTtlMsMax);
  assert.equal(config.cacheTtlMs, sharedConstants.CACHE_TTL_MS_DEFAULT);
});

test('jobType berkonten tidak pernah ditulis/dibaca dari cache', () => {
  cache.__resetStatsForTest();
  const key = 'unit:content:1';
  assert.equal(cache.set(key, { result: 'rahasia' }, 'parse_command'), false);
  assert.equal(cache.get(key, 'parse_command'), undefined);
  assert.equal(cache.get(key), undefined, 'tidak ada entri yang bocor dari jalur tanpa jobType');

  assert.equal(cache.set(key, { result: 'struktural' }, 'scene_detect'), true);
  const value = cache.get(key, 'scene_detect');
  assert.deepEqual(value, { result: 'struktural' });
  // JobType berkonten tetap tidak boleh MENYAJIKAN entri struktur yang kebetulan ada.
  assert.equal(cache.get(key, 'chat'), undefined);

  const stats = cache.stats();
  assert.ok(stats.blockedWrites >= 1);
  assert.deepEqual([...stats.cacheableJobTypes], [...cache.CACHEABLE_JOB_TYPES]);
  assert.equal(stats.ttlMs, config.cacheTtlMs);
});

test('membaca cache tidak memperpanjang TTL (updateAgeOnGet:false)', async () => {
  const key = 'unit:ttl:1';
  assert.equal(cache.set(key, { ok: true }, 'vision_color'), true);
  const before = cache.remainingTtlMs(key);
  assert.ok(before > 0, 'entri harus punya TTL');

  await sleep(60);
  assert.deepEqual(cache.get(key, 'vision_color'), { ok: true });

  const after = cache.remainingTtlMs(key);
  assert.ok(after > 0, 'entri belum kedaluwarsa');
  // Bila `updateAgeOnGet:true`, TTL akan kembali mendekati maksimum (after ≈ before).
  assert.ok(after < before, `TTL tidak boleh diperpanjang (before=${before}, after=${after})`);
  assert.ok(before - after >= 20, `TTL harus berkurang karena waktu berjalan (Δ=${before - after}ms)`);
});

test('remainingTtlMs = 0 untuk entri yang tidak ada', () => {
  assert.equal(cache.remainingTtlMs('unit:tidak-ada'), 0);
});

test('stats & clear tetap konsisten setelah reset', () => {
  cache.__resetStatsForTest();
  const key = 'unit:stats:1';
  cache.set(key, { n: 1 }, 'thumbnail');
  cache.get(key, 'thumbnail');
  cache.get('unit:stats:missing', 'thumbnail');
  const stats = cache.stats();
  assert.equal(stats.hits, 1);
  assert.equal(stats.misses, 1);
  assert.equal(stats.hitRate, 0.5);
  assert.ok(stats.entries >= 1);
  assert.equal(typeof stats.blockedWrites, 'number');

  cache.del(key);
  assert.equal(cache.get(key, 'thumbnail'), undefined);
});

test('kode error v1.2 terdaftar di backend (§5.2.1)', () => {
  const { ErrorCodes } = require('../../backend/src/errors');
  assert.equal(ErrorCodes.PROVIDER_INCOMPATIBLE, 'ERR_PROVIDER_INCOMPATIBLE');
  assert.equal(ErrorCodes.PROVIDER_MODEL_UNSUPPORTED, 'ERR_PROVIDER_MODEL_UNSUPPORTED');
  assert.equal(ErrorCodes.PROVIDER_BASE_URL_NOT_ALLOWED, 'ERR_PROVIDER_BASE_URL_NOT_ALLOWED');
  assert.equal(ErrorCodes.PRIVACY_CONSENT_REQUIRED, 'ERR_PRIVACY_CONSENT_REQUIRED');
  assert.equal(ErrorCodes.PRIVACY_LOCAL_ONLY_BLOCKED, 'ERR_PRIVACY_LOCAL_ONLY_BLOCKED');
});

test('rentang usage backend selaras dengan skema shared §2.16', () => {
  assert.deepEqual([...usageSchema.USAGE_RANGES], ['today', '7d', '30d', 'all']);
  const usage = require('../../backend/src/services/usage');
  assert.equal(usage.estimateCostUsd('gemini', 1e6, 1e6), 2.8);
  assert.equal(usage.estimateCostUsd('openrouter', 10, 10), null);
  assert.equal(usage.estimateCostUsd('cohere', 10, 10), null);
});
