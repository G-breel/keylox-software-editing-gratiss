'use strict';

/**
 * Kebijakan provider BYOK di MAIN process — generalisasi 2 provider → **13 provider**
 * (`api-contract.md` v1.2 §2.13, ADR-03). Data provider dibaca dari
 * `src/shared/providerRegistry.js` (sumber kebenaran tunggal), sehingga menambah
 * provider = menambah data, bukan kode.
 *
 * Sumber aturan: §2.12.1 (regex key), §2.13.2 (fallback model), §3.7 (anti-SSRF:
 * allowlist host, tolak skema selain HTTPS kecuali localhost dev), §3.8 butir 5.
 *
 * API publik dipertahankan agar `aiClient.js` & 250 tes lama tidak berubah:
 * `validateProvider`, `validateApiKey`, `validateProviderBaseUrl`,
 * `validateBackendBaseUrl`, `isLocalHost`, `resolveModel`.
 *
 * Tidak ada nilai rahasia di berkas ini — hanya pola & URL publik provider.
 */

const {
  PROVIDERS: REGISTRY,
  PROVIDER_IDS,
  DEFAULT_PROVIDER,
  LOCAL_PROVIDER_IDS,
  CLIENT_BASE_URL_PROVIDER_IDS,
  getProvider,
  hasProvider,
} = require('../shared/providerRegistry');
const { KeyloxError } = require('./errors');

const GEMINI_HOST = 'generativelanguage.googleapis.com';
const OPENAI_HOST = 'api.openai.com';

const LOCAL_HOSTS = Object.freeze(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Petunjuk format key per provider (pesan UI; TIDAK memuat nilai key). */
const KEY_HINTS = Object.freeze({
  gemini: 'Format: AIza… (36 karakter) atau AQ.…',
  openai: 'Format: sk-… (min. 20 karakter)',
  anthropic: 'Format: sk-ant-… (min. 20 karakter)',
  openrouter: 'Format: sk-or-… (min. 20 karakter)',
  groq: 'Format: gsk_… (min. 20 karakter)',
  deepseek: 'Format: sk-… (min. 20 karakter)',
  mistral: 'Format: 32 karakter alfanumerik',
  xai: 'Format: xai-… (min. 20 karakter)',
  together: 'Format: token Together (min. 20 karakter)',
  cerebras: 'Format: csk-… (min. 20 karakter)',
  ollama: 'Tanpa API key (server lokal)',
  lmstudio: 'Tanpa API key (server lokal)',
  custom: 'Panjang 8..512 karakter',
});

function compile(patterns, flags = 'i') {
  return Object.freeze((patterns || []).map((src) => new RegExp(src, flags)));
}

/**
 * Proyeksi internal dari registry bersama: menambahkan bentuk yang dipakai
 * validasi (RegExp ter-compile, `allowedHosts`, `isLocal`).
 */
const PROVIDERS = Object.freeze(
  PROVIDER_IDS.reduce((acc, id) => {
    const record = REGISTRY[id];
    const isLocal = LOCAL_PROVIDER_IDS.includes(id);
    const clientBaseUrl = CLIENT_BASE_URL_PROVIDER_IDS.includes(id);
    acc[id] = Object.freeze({
      id,
      label: record.label,
      adapter: record.adapter,
      defaultModel: record.defaultModel,
      defaultBaseUrl: record.baseUrl,
      allowedHosts: Object.freeze(record.host ? [record.host] : []),
      keyPattern: record.keyPattern,
      keyPatterns: record.keyPattern ? compile([record.keyPattern], '') : Object.freeze([]),
      modelPatterns: compile(record.modelPatterns),
      keyHint: KEY_HINTS[id] || 'Format kunci tidak diketahui',
      isLocal,
      clientBaseUrl,
    });
    return acc;
  }, {})
);

const SUPPORTED_PROVIDERS = Object.freeze(PROVIDER_IDS.slice());

/** Provider yang didukung? Selain itu → ERR_PROVIDER_UNSUPPORTED. */
function validateProvider(provider) {
  if (typeof provider !== 'string' || !hasProvider(provider)) {
    throw new KeyloxError(
      'ERR_PROVIDER_UNSUPPORTED',
      `Provider '${provider === undefined ? '' : String(provider).slice(0, 40)}' belum didukung. Didukung: ${SUPPORTED_PROVIDERS.join(', ')}.`,
      { details: { supported: SUPPORTED_PROVIDERS.slice() } }
    );
  }
  return provider;
}

/**
 * Validasi format key per provider (§2.12.1, §2.13.2).
 *  - provider ber-`keyPattern` → regex wajib cocok;
 *  - `ollama`/`lmstudio` → tanpa key boleh (`''`);
 *  - `custom` → hanya batas panjang 8..512.
 * @returns {string} key ter-trim (boleh `''` untuk provider lokal)
 */
function validateApiKey(provider, apiKey) {
  validateProvider(provider);
  const record = PROVIDERS[provider];
  const optionalKey = record.isLocal;

  if (apiKey === null || apiKey === undefined) {
    if (optionalKey) return '';
    throw new KeyloxError('ERR_PROVIDER_KEY_INVALID', 'API key harus berupa teks.');
  }
  if (typeof apiKey !== 'string') {
    throw new KeyloxError('ERR_PROVIDER_KEY_INVALID', 'API key harus berupa teks.');
  }
  const key = apiKey.trim();
  if (key === '' && optionalKey) return '';
  if (key.length < 8 || key.length > 512) {
    throw new KeyloxError('ERR_PROVIDER_KEY_INVALID', 'Panjang API key di luar rentang 8..512 karakter.');
  }
  if (record.keyPatterns.length > 0) {
    const ok = record.keyPatterns.some((re) => re.test(key));
    if (!ok) {
      // Pesan TIDAK memuat nilai key — hanya petunjuk format.
      throw new KeyloxError(
        'ERR_PROVIDER_KEY_INVALID',
        `API key tidak valid untuk '${provider}'. ${record.keyHint}`
      );
    }
  }
  return key;
}

function isLocalHost(hostname) {
  return LOCAL_HOSTS.includes(String(hostname).toLowerCase());
}

/**
 * Validasi `baseUrl` provider (anti-SSRF, §3.7 butir 3).
 * Kode error dipertahankan `ERR_PROVIDER_UNSUPPORTED` demi kompatibilitas tes lama
 * (lihat catatan deviasi laporan; `ERR_PROVIDER_BASE_URL_NOT_ALLOWED` tetap terdaftar
 * di tabel error §5.2 untuk jalur yang lebih sempit).
 * @returns {string} base URL ternormalisasi (tanpa trailing slash)
 */
function validateProviderBaseUrl(provider, baseUrl, options = {}) {
  validateProvider(provider);
  const record = PROVIDERS[provider];
  const { allowLocalhostDev = true, extraHosts = [] } = options;
  const raw = typeof baseUrl === 'string' ? baseUrl.trim() : '';
  if (!raw) {
    if (!record.defaultBaseUrl) {
      throw new KeyloxError(
        'ERR_VALIDATION_PAYLOAD',
        `Provider '${provider}' mewajibkan Base URL diisi pengguna.`
      );
    }
    return record.defaultBaseUrl;
  }

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

  // `custom` boleh memakai host apa pun (divalidasi anti-SSRF backend §3.7 butir 3);
  // provider registry lain wajib berada di allowlist host kanonik.
  if (record.clientBaseUrl) {
    return raw.replace(/\/+$/, '');
  }

  const allowed = [...record.allowedHosts, ...extraHosts];
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
  const record = PROVIDERS[provider];
  const trimmed = typeof model === 'string' ? model.trim() : '';
  const fallback = record.defaultModel;
  if (!trimmed) {
    if (!fallback) {
      throw new KeyloxError(
        'ERR_VALIDATION_PAYLOAD',
        `Nama model wajib diisi untuk provider '${provider}'.`
      );
    }
    return fallback;
  }
  if (trimmed.length > 120 || !/^[A-Za-z0-9._:/-]+$/.test(trimmed)) {
    throw new KeyloxError('ERR_VALIDATION_PAYLOAD', 'Nama model mengandung karakter yang tidak diizinkan.');
  }
  // Model milik provider lain (mis. sisa pilihan sebelumnya) TIDAK dipakai →
  // jatuh ke defaultModel provider yang sedang dipakai (§2.13.2).
  if (record.modelPatterns.length > 0 && !record.modelPatterns.some((re) => re.test(trimmed))) {
    if (!fallback) {
      throw new KeyloxError(
        'ERR_PROVIDER_MODEL_UNSUPPORTED',
        `Model '${trimmed}' tidak dikenali provider '${provider}'.`
      );
    }
    return fallback;
  }
  return trimmed;
}

module.exports = {
  PROVIDERS,
  SUPPORTED_PROVIDERS,
  DEFAULT_PROVIDER,
  GEMINI_HOST,
  OPENAI_HOST,
  LOCAL_HOSTS,
  LOCAL_PROVIDER_IDS,
  getProvider,
  validateProvider,
  validateApiKey,
  validateProviderBaseUrl,
  validateBackendBaseUrl,
  isLocalHost,
  resolveModel,
};
