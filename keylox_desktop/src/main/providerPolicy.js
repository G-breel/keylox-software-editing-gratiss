'use strict';

/**
 * Kebijakan provider BYOK (allowlist host, regex key, model default).
 *
 * Sumber: `api-contract.md` v1.1 §2.12.1 (regex key + `baseUrl` divalidasi
 * allowlist), §3.7 (anti-SSRF: allowlist host, tolak skema selain HTTPS kecuali
 * localhost dev), `byok-api-key.md` §2.
 *
 * Dipakai bersama oleh `main.js` (tulis key + panggil provider) dan unit test.
 * Tidak ada nilai rahasia di berkas ini — hanya pola & URL publik provider.
 */

const { KeyloxError } = require('./errors');

const GEMINI_HOST = 'generativelanguage.googleapis.com';
const OPENAI_HOST = 'api.openai.com';

const PROVIDERS = Object.freeze({
  gemini: Object.freeze({
    id: 'gemini',
    label: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    defaultBaseUrl: `https://${GEMINI_HOST}`,
    allowedHosts: Object.freeze([GEMINI_HOST]),
    keyPatterns: Object.freeze([/^AIza[0-9A-Za-z_-]{35}$/, /^AQ\.[A-Za-z0-9_-]{25,}$/]),
    // Model yang dianggap milik provider ini (untuk mendeteksi model "stale"
    // dari provider lain — §2.12.1). Nama di luar pola → jatuh ke defaultModel.
    modelPatterns: Object.freeze([/^gemini-/i, /^models\/gemini-/i, /^gemma-/i, /^imagen-/i, /^text-embedding-/i]),
    keyHint: 'Format: AIza… (36 karakter)',
  }),
  openai: Object.freeze({
    id: 'openai',
    label: 'OpenAI-compatible',
    defaultModel: 'gpt-4o-mini',
    defaultBaseUrl: `https://${OPENAI_HOST}/v1`,
    allowedHosts: Object.freeze([OPENAI_HOST]),
    keyPatterns: Object.freeze([/^sk-[A-Za-z0-9-]{20,}$/]),
    // Pola model milik provider ini (lihat catatan di atas).
    modelPatterns: Object.freeze([/^gpt-/i, /^o[1-9]/i, /^chatgpt-/i, /^text-embedding-/i, /^dall-e-/i]),
    keyHint: 'Format: sk-… (min. 20 karakter)',
  }),
});

const SUPPORTED_PROVIDERS = Object.freeze(Object.keys(PROVIDERS));
const DEFAULT_PROVIDER = 'gemini';

const LOCAL_HOSTS = Object.freeze(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Provider yang didukung? Selain itu → ERR_PROVIDER_UNSUPPORTED. */
function validateProvider(provider) {
  if (typeof provider !== 'string' || !PROVIDERS[provider]) {
    throw new KeyloxError(
      'ERR_PROVIDER_UNSUPPORTED',
      `Provider '${provider === undefined ? '' : String(provider).slice(0, 40)}' belum didukung. Didukung: ${SUPPORTED_PROVIDERS.join(', ')}.`,
      { details: { supported: SUPPORTED_PROVIDERS.slice() } }
    );
  }
  return provider;
}

/** Validasi regex ringan key per provider (contract §2.12.1). */
function validateApiKey(provider, apiKey) {
  validateProvider(provider);
  if (typeof apiKey !== 'string') {
    throw new KeyloxError('ERR_PROVIDER_KEY_INVALID', 'API key harus berupa teks.');
  }
  const key = apiKey.trim();
  if (key.length < 8 || key.length > 512) {
    throw new KeyloxError('ERR_PROVIDER_KEY_INVALID', 'Panjang API key di luar rentang 8..512 karakter.');
  }
  const ok = PROVIDERS[provider].keyPatterns.some((re) => re.test(key));
  if (!ok) {
    // Pesan TIDAK memuat nilai key — hanya petunjuk format.
    throw new KeyloxError(
      'ERR_PROVIDER_KEY_INVALID',
      `API key tidak valid untuk '${provider}'. ${PROVIDERS[provider].keyHint}`
    );
  }
  return key;
}

function isLocalHost(hostname) {
  return LOCAL_HOSTS.includes(String(hostname).toLowerCase());
}

/**
 * Validasi `baseUrl` provider (anti-SSRF, §3.7 butir 3).
 * @returns {string} origin/base URL ternormalisasi (tanpa trailing slash)
 */
function validateProviderBaseUrl(provider, baseUrl, options = {}) {
  validateProvider(provider);
  const { allowLocalhostDev = true, extraHosts = [] } = options;
  const raw = typeof baseUrl === 'string' ? baseUrl.trim() : '';
  if (!raw) return PROVIDERS[provider].defaultBaseUrl;

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new KeyloxError('ERR_PROVIDER_UNSUPPORTED', 'Base URL provider bukan URL yang valid.');
  }

  const host = url.hostname.toLowerCase();
  const isLocal = isLocalHost(host);
  if (url.protocol !== 'https:' && !(allowLocalhostDev && isLocal && url.protocol === 'http:')) {
    throw new KeyloxError(
      'ERR_PROVIDER_UNSUPPORTED',
      'Base URL provider wajib HTTPS (kecuali localhost untuk dev).'
    );
  }

  const allowed = [...PROVIDERS[provider].allowedHosts, ...extraHosts];
  const hostAllowed = allowed.includes(host) || (allowLocalhostDev && isLocal);
  if (!hostAllowed) {
    throw new KeyloxError(
      'ERR_PROVIDER_UNSUPPORTED',
      `Host '${host}' tidak ada di allowlist provider '${provider}'.`,
      { details: { allowed: allowed.slice() } }
    );
  }

  return raw.replace(/\/+$/, '');
}

/** Validasi URL backend (mode PROXY) — §3.7 butir 3: HTTPS, atau HTTP hanya localhost dev. */
function validateBackendBaseUrl(backendBaseUrl, options = {}) {
  const { allowLocalhostDev = true } = options;
  const raw = typeof backendBaseUrl === 'string' ? backendBaseUrl.trim() : '';
  if (!raw) return ''; // kosong = MODE DIRECT (§6.4)

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new KeyloxError('ERR_VALIDATION_PAYLOAD', 'Backend Base URL bukan URL yang valid.');
  }

  const isLocal = isLocalHost(url.hostname);
  if (url.protocol !== 'https:' && !(allowLocalhostDev && isLocal && url.protocol === 'http:')) {
    throw new KeyloxError(
      'ERR_VALIDATION_PAYLOAD',
      'Backend Base URL wajib HTTPS (kecuali http://localhost untuk dev).'
    );
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new KeyloxError('ERR_VALIDATION_PAYLOAD', 'Skema URL backend tidak didukung.');
  }
  return raw.replace(/\/+$/, '');
}

function resolveModel(provider, model) {
  validateProvider(provider);
  const trimmed = typeof model === 'string' ? model.trim() : '';
  if (!trimmed) return PROVIDERS[provider].defaultModel;
  if (trimmed.length > 120 || !/^[A-Za-z0-9._:/-]+$/.test(trimmed)) {
    throw new KeyloxError('ERR_VALIDATION_PAYLOAD', 'Nama model mengandung karakter yang tidak diizinkan.');
  }
  // Model milik provider lain (mis. sisa pilihan sebelumnya) TIDAK dipakai →
  // jatuh ke defaultModel provider yang sedang dipakai (§2.12.1).
  const belongs = PROVIDERS[provider].modelPatterns.some((re) => re.test(trimmed));
  if (!belongs) return PROVIDERS[provider].defaultModel;
  return trimmed;
}

module.exports = {
  PROVIDERS,
  SUPPORTED_PROVIDERS,
  DEFAULT_PROVIDER,
  GEMINI_HOST,
  OPENAI_HOST,
  LOCAL_HOSTS,
  validateProvider,
  validateApiKey,
  validateProviderBaseUrl,
  validateBackendBaseUrl,
  isLocalHost,
  resolveModel,
};
