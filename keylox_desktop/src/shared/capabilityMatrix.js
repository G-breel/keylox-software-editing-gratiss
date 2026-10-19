'use strict';

/**
 * Matriks `jobType` → kapabilitas provider yang WAJIB ada — `api-contract.md`
 * v1.2 §2.14.3 (gate kapabilitas, ADR-04). Menutup REJ-05 (drift `transcribe`/`asr`).
 *
 * Data murni (CJS) — aman dibaca renderer (badge/disable) maupun main/backend.
 *
 * Aturan gate (§2.14.3):
 *  - kapabilitas provider **eksplisit `false`** → tolak `ERR_PROVIDER_INCOMPATIBLE`;
 *  - kapabilitas **`null`** (belum diketahui, mis. `custom`) → **izinkan** + tandai
 *    "belum diverifikasi" (`null` TIDAK PERNAH diperlakukan sebagai `false`).
 */

/** Kapabilitas yang dikenal (§2.13 bentuk record `capabilities`). */
const CAPABILITIES = Object.freeze(['json', 'vision', 'audioIn', 'audioOut', 'tools']);

/**
 * Peta kanonik `jobType` → kapabilitas wajib (§2.14.3, termasuk alias `asr`).
 * @type {Record<string, 'json'|'vision'|'audioIn'|'audioOut'|'tools'>}
 */
const JOB_CAPABILITY_MATRIX = Object.freeze({
  // DIRECT/PROXY — JSON terstruktur
  parse_command: 'json',
  chat: 'json',
  refine: 'json',
  metadata: 'json',
  translate: 'json',
  moderation: 'json',
  highlight: 'json',        // PROXY
  montage: 'json',          // PROXY
  search: 'json',           // PROXY
  index_asset: 'json',      // PROXY
  script: 'json',           // PROXY
  reframe: 'json',          // PROXY
  // Audio
  transcribe: 'audioIn',    // KANONIK (drift `asr` ditutup §2.14.3)
  asr: 'audioIn',           // alias lama — dipertahankan
  tts: 'audioOut',
  // Vision
  scene_detect: 'vision',
  ocr: 'vision',
  thumbnail: 'vision',
  vision_color: 'vision',
});

/** Semua `jobType` kanonik (§2.14.3) + alias `asr`. */
const MATRIX_JOB_TYPES = Object.freeze(Object.keys(JOB_CAPABILITY_MATRIX));

/** Alias `jobType` lama → kanonik (§2.14.3 "Resolusi drift"). */
const JOB_TYPE_ALIASES = Object.freeze({ asr: 'transcribe' });

/**
 * Kapabilitas wajib untuk sebuah `jobType` (alias `asr` diperlakukan sama).
 * @param {string} jobType
 * @returns {'json'|'vision'|'audioIn'|'audioOut'|'tools'|null} `null` bila jobType tak dikenal
 */
function capabilityFor(jobType) {
  if (typeof jobType !== 'string') return null;
  return JOB_CAPABILITY_MATRIX[jobType] || null;
}

/**
 * Normalisasi alias ke nama kanonik (`asr` → `transcribe`).
 * @param {string} jobType
 * @returns {string}
 */
function canonicalJobType(jobType) {
  if (typeof jobType !== 'string') return '';
  return JOB_TYPE_ALIASES[jobType] || jobType;
}

/** `true` bila `jobType` (atau aliasnya) punya pemetaan kapabilitas. */
function isKnownJobType(jobType) {
  return capabilityFor(jobType) !== null;
}

module.exports = {
  CAPABILITIES,
  JOB_CAPABILITY_MATRIX,
  MATRIX_JOB_TYPES,
  JOB_TYPE_ALIASES,
  capabilityFor,
  canonicalJobType,
  isKnownJobType,
};
