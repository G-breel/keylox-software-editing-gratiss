'use strict';

const crypto = require('crypto');

function sha256(input) {
  return crypto.createHash('sha256').update(typeof input === 'string' ? input : JSON.stringify(input)).digest('hex');
}

function normalizeInput(obj) {
  // deterministic key ordering
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(normalizeInput);
  const out = {};
  for (const k of Object.keys(obj).sort()) {
    out[k] = normalizeInput(obj[k]);
  }
  return out;
}

function cacheKey(parts) {
  return sha256(normalizeInput(parts));
}

/**
 * Hash penuh sebuah provider key (BYOK). Dipakai HANYA untuk:
 *  - turunan kunci cache (`api-contract.md` §3.7 butir 4: `hash(key)[8]`),
 *  - rate limit per key (§3.7 butir 5).
 * Nilai key sendiri tidak pernah disimpan bersama hash ini.
 */
function keyHash(key) {
  return sha256(String(key == null ? '' : key));
}

/** 8 karakter heksadesimal pertama dari `sha256(key)` — kontrak §3.7 butir 4. */
function keyFingerprint(key) {
  return keyHash(key).slice(0, 8);
}

module.exports = { sha256, normalizeInput, cacheKey, keyHash, keyFingerprint };
