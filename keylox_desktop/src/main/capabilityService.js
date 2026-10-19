'use strict';

/**
 * Gate kapabilitas provider — `api-contract.md` v1.2 §2.14.3 (ADR-04).
 *
 * Dipanggil `aiClient.js` SEBELUM request keluar jaringan. Aturan:
 *  - kapabilitas provider **eksplisit `false`** → tolak `ERR_PROVIDER_INCOMPATIBLE`;
 *  - kapabilitas **`null`** (belum diketahui) → **izinkan** + tandai "belum diverifikasi";
 *  - `capabilitiesOverride` (hasil `settings:testProvider` v2) boleh mempersempit registry.
 *
 * Modul murni Node (tanpa Electron) → dapat diuji unit tanpa jaringan.
 */

const { getProvider } = require('../shared/providerRegistry');
const { capabilityFor, canonicalJobType, isKnownJobType } = require('../shared/capabilityMatrix');
const { KeyloxError } = require('./errors');

/**
 * @param {string} providerId
 * @param {string} jobType
 * @param {object} [capabilitiesOverride] Kapabilitas hasil uji (boleh mempersempit registry)
 * @returns {{ok:true, provider:string, jobType:string, capability:string|null, verified:boolean}}
 */
function check(providerId, jobType, capabilitiesOverride) {
  const provider = getProvider(providerId);
  if (!provider) {
    throw new KeyloxError(
      'ERR_PROVIDER_UNSUPPORTED',
      `Provider '${String(providerId).slice(0, 40)}' belum didukung.`
    );
  }
  const canonical = canonicalJobType(jobType);
  if (!isKnownJobType(canonical)) {
    // jobType tak dikenal bukan urusan gate kapabilitas — validator jobType menanganinya.
    return { ok: true, provider: providerId, jobType: canonical, capability: null, verified: false };
  }

  const capability = capabilityFor(canonical);
  const source = capabilitiesOverride && typeof capabilitiesOverride === 'object'
    ? capabilitiesOverride
    : provider.capabilities;
  const value = source ? source[capability] : null;

  if (value === false) {
    throw new KeyloxError(
      'ERR_PROVIDER_INCOMPATIBLE',
      `Provider '${providerId}' tidak mendukung ${jobType} (butuh kapabilitas '${capability}').`,
      { details: { provider: providerId, jobType: canonical, capability, verdict: 'incompatible' } }
    );
  }

  // `null`/undefined = belum diketahui → izinkan, tandai belum diverifikasi (§2.14.3).
  return {
    ok: true,
    provider: providerId,
    jobType: canonical,
    capability,
    verified: value === true,
  };
}

module.exports = { check, capabilityFor, canonicalJobType };
