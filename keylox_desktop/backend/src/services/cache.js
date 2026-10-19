'use strict';

const { LRUCache } = require('lru-cache');
const config = require('../config');
const logger = require('../logger');

/**
 * Cache hasil AI backend — `api-contract.md` v1.2 §3.5/§3.8 (ADR-05), perubahan perilaku.
 *
 * Aturan v1.2:
 *  1. `updateAgeOnGet: false` — membaca cache **tidak** memperpanjang masa hidup entri
 *     (dulu `true` → entri hidup selamanya selama terus dibaca).
 *  2. Hanya `jobType` STRUKTURAL/NUMERIK yang boleh masuk cache (`CACHEABLE_JOB_TYPES`).
 *     `jobType` berkonten (mis. `parse_command`, `chat`, `refine`, `transcribe`, `ocr`,
 *     `translate`, …) **tidak pernah** menghasilkan baris cache.
 *  3. TTL ≤ 5 menit (`config.cacheTtlMs`, dijepit di `config.js`).
 *  4. **In-memory only** — tidak ada prompt/respons yang ditulis ke disk (§3.8).
 *
 * Nilai yang disimpan hanya `{ result, tokens }` (tanpa key). Kunci cache =
 * `sha256(jobType + input + modelVersion + hash(key)[8])` (`gemini.cachedGenerate`).
 */

/**
 * `jobType` yang boleh di-cache (salinan tersinkron dari
 * `src/shared/constants.js#CACHEABLE_JOB_TYPES`; paritas dijaga
 * `tests/backend/cachePolicy.unit.test.js`).
 */
const CACHEABLE_JOB_TYPES = Object.freeze([
  'scene_detect', 'thumbnail', 'vision_color', 'reframe', 'index_asset',
]);

/** `true` bila hasil `jobType` boleh disimpan/dibaca dari cache (§3.5). */
function isCacheableJobType(jobType) {
  return typeof jobType === 'string' && CACHEABLE_JOB_TYPES.includes(jobType);
}

const cache = new LRUCache({
  max: config.cacheMaxEntries,
  ttl: config.cacheTtlMs,
  // §3.5 butir: membaca entri tidak memperpanjang `expires_at`.
  updateAgeOnGet: false,
});

let hits = 0;
let misses = 0;
let blockedWrites = 0;

/**
 * @param {string} key Kunci cache (hash, tanpa rahasia)
 * @param {string} [jobType] Bila diberikan dan tidak cacheable → selalu miss
 */
function get(key, jobType) {
  if (jobType !== undefined && !isCacheableJobType(jobType)) {
    // jobType berkonten: jangan pernah menyajikan hasil lama untuk konten baru.
    return undefined;
  }
  const v = cache.get(key);
  if (v !== undefined) {
    hits++;
    logger.debug({ key, hit: true }, 'cache hit');
    return v;
  }
  misses++;
  logger.debug({ key, hit: false }, 'cache miss');
  return undefined;
}

/**
 * @param {string} key
 * @param {unknown} value
 * @param {string} [jobType] Bila diberikan dan tidak cacheable → TIDAK ditulis
 * @returns {boolean} `true` bila benar-benar tersimpan
 */
function set(key, value, jobType) {
  if (jobType !== undefined && !isCacheableJobType(jobType)) {
    blockedWrites++;
    logger.debug({ key, jobType }, 'cache write diblokir (jobType berkonten)');
    return false;
  }
  cache.set(key, value);
  return true;
}

/**
 * Hapus satu entri. Dipakai untuk menjamin output AI yang GAGAL validasi tidak
 * pernah tersimpan (SEC-PROMPT-01 / api-contract §3.3 butir 4: tolak, jangan
 * sanitasi diam-diam — termasuk jangan menyajikan ulang hasil tidak valid dari cache).
 */
function del(key) {
  return cache.delete(key);
}

function stats() {
  const total = hits + misses;
  return {
    entries: cache.size,
    hits,
    misses,
    hitRate: total === 0 ? 0 : hits / total,
    ttlMs: config.cacheTtlMs,
    cacheableJobTypes: CACHEABLE_JOB_TYPES.slice(),
    blockedWrites,
  };
}

function clear(scope = 'all') {
  if (scope === 'all') cache.clear();
  // 'expired' handled by ttl automatically
  return { freedEntries: cache.size };
}

function __resetStatsForTest() {
  hits = 0;
  misses = 0;
  blockedWrites = 0;
}

/**
 * Sisa TTL entri (ms). Dipakai tes untuk membuktikan membaca cache TIDAK
 * memperpanjang `expires_at` (`updateAgeOnGet: false`, §3.5 v1.2).
 * @param {string} key
 * @returns {number} 0 bila entri tidak ada
 */
function remainingTtlMs(key) {
  if (!cache.has(key)) return 0;
  return cache.getRemainingTTL(key);
}

module.exports = {
  get,
  set,
  del,
  stats,
  clear,
  remainingTtlMs,
  CACHEABLE_JOB_TYPES,
  isCacheableJobType,
  __resetStatsForTest,
};
