'use strict';

const { LRUCache } = require('lru-cache');
const config = require('../config');
const logger = require('../logger');

const cache = new LRUCache({
  max: config.cacheMaxEntries,
  ttl: config.cacheTtlMs,
  updateAgeOnGet: true,
});

let hits = 0;
let misses = 0;

function get(key) {
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

function set(key, value) {
  cache.set(key, value);
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
  };
}

function clear(scope = 'all') {
  if (scope === 'all') cache.clear();
  // 'expired' handled by ttl automatically
  return { freedEntries: cache.size };
}

module.exports = { get, set, del, stats, clear };