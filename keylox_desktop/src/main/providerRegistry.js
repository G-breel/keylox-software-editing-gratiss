'use strict';

/**
 * Wrapper MAIN untuk registry provider kanonik (`api-contract.md` v1.2 §2.13.1–§2.13.4).
 *
 * Re-export `shared/providerRegistry.js` (sumber kebenaran tunggal, data murni tanpa
 * rahasia) + helper resolusi yang dipakai main process. Penegakan allowlist/validasi
 * ada di `providerPolicy.js` (host & regex) dan `capabilityService.js` (kapabilitas).
 *
 * Renderer boleh membaca berkas SHARED langsung; wrapper ini khusus main process.
 */

const shared = require('../shared/providerRegistry');

const { PROVIDERS, PROVIDER_IDS, DEFAULT_PROVIDER, ADAPTERS, LOCAL_PROVIDER_IDS, CLIENT_BASE_URL_PROVIDER_IDS } = shared;

/**
 * @param {string} id
 * @returns {import('../shared/providerRegistry').ProviderRecord|null}
 */
function resolveProvider(id) {
  return shared.getProvider(id);
}

/**
 * Resolusi model untuk provider (fallback diam-diam ke `defaultModel` — §2.13.2).
 * TIDAK melempar untuk model di luar pola; hanya mengembalikan default provider.
 * @param {string} providerId
 * @param {string|null|undefined} model
 * @returns {string|null}
 */
function resolveModel(providerId, model) {
  const provider = shared.getProvider(providerId);
  if (!provider) return null;
  const trimmed = typeof model === 'string' ? model.trim() : '';
  if (!trimmed) return provider.defaultModel;
  // `modelPatterns: []` = provider menerima model bebas (`custom`).
  if (provider.modelPatterns.length === 0) return trimmed;
  const belongs = provider.modelPatterns.some((src) => new RegExp(src, 'i').test(trimmed));
  return belongs ? trimmed : provider.defaultModel;
}

/**
 * Daftar model yang diketahui secara statis untuk provider (saat ini: `defaultModel`).
 * Dipakai UI/label; sumber dinamis tetap uji kompatibilitas §2.14.
 * @param {string} providerId
 * @returns {string[]}
 */
function modelsFor(providerId) {
  const provider = shared.getProvider(providerId);
  if (!provider) return [];
  return provider.defaultModel ? [provider.defaultModel] : [];
}

module.exports = {
  ...shared,
  PROVIDERS,
  PROVIDER_IDS,
  DEFAULT_PROVIDER,
  ADAPTERS,
  LOCAL_PROVIDER_IDS,
  CLIENT_BASE_URL_PROVIDER_IDS,
  resolveProvider,
  resolveModel,
  modelsFor,
};
