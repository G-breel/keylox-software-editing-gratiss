'use strict';

/**
 * Registry provider + allowlist host + pertahanan anti-SSRF (BACKEND).
 *
 * Sumber aturan: `api-contract.md` v1.2 §2.13 (registry 13 provider, ADR-03),
 * §3.7 butir 3 (`X-Provider` enum registry, `X-Provider-Base-Url` hanya untuk
 * `custom`/lokal), `06-security.md` §5.3.
 *
 * Salinan tersinkron dari `src/shared/providerRegistry.js` (backend tidak
 * `require()` lintas-paket). Paritas `id`, `hosts`, `defaultModel`, `keyPattern`,
 * dan `pricePer1M` dijaga `tests/backend/cachePolicy.unit.test.js`.
 *
 * Kontrak perilaku:
 *  - `X-Provider` menerima **enum id registry** (13). Di luar itu →
 *    `ERR_PROVIDER_UNSUPPORTED` (400).
 *  - `X-Provider-Base-Url` dari klien TIDAK PERNAH dipercaya apa adanya: skema
 *    harus HTTPS (kecuali localhost dev eksplisit), tanpa kredensial, host tidak
 *    boleh di rentang privat/link-local/cloud-metadata, dan untuk provider
 *    registry host WAJIB ada di allowlist + port default + tanpa path.
 *    Untuk `custom`/lokal, host/port bebas (divalidasi anti-SSRF saja).
 *  - Semua penolakan hanya memuat KONSTANTA alasan (`reason`) — tidak pernah nilai
 *    header mentah (`SEC-ERR-01`).
 */

const net = require('node:net');
const config = require('../config');
const { makeError, ErrorCodes } = require('../errors');

// Format key per provider (`api-contract.md` §2.12.1). Regex-literal sengaja:
// tidak ada nilai key yang muncul di source.
const GEMINI_KEY_RES = Object.freeze([/^AIza[0-9A-Za-z_-]{35}$/, /^AQ\.[A-Za-z0-9_-]{25,}$/]);
const OPENAI_KEY_RE = /^sk-[A-Za-z0-9-]{20,}$/;
const ANTHROPIC_KEY_RE = /^sk-ant-[A-Za-z0-9_-]{20,}$/;
const OPENROUTER_KEY_RE = /^sk-or-[A-Za-z0-9-]{20,}$/;
const GROQ_KEY_RE = /^gsk_[A-Za-z0-9]{20,}$/;
const DEEPSEEK_KEY_RE = /^sk-[A-Za-z0-9]{20,}$/;
const MISTRAL_KEY_RE = /^[A-Za-z0-9]{32}$/;
const XAI_KEY_RE = /^xai-[A-Za-z0-9]{20,}$/;
const TOGETHER_KEY_RE = /^[A-Za-z0-9_-]{20,}$/;
const CEREBRAS_KEY_RE = /^csk-[A-Za-z0-9]{20,}$/;

const KEY_MIN_LEN = 8;
const KEY_MAX_LEN = 512;

/**
 * 13 provider (§2.13.1). `clientBaseUrl: true` = `baseUrl` boleh ditentukan klien
 * (`custom` + lokal) → §3.7 butir 3. `pricePer1M` = harga indikatif (estimasi biaya).
 */
const PROVIDERS = Object.freeze({
  gemini: Object.freeze({
    id: 'gemini', supported: true, clientBaseUrl: false,
    hosts: Object.freeze(['generativelanguage.googleapis.com']),
    defaultModel: 'gemini-2.5-flash',
    keyPatterns: GEMINI_KEY_RES,
    pricePer1M: Object.freeze({ in: 0.3, out: 2.5 }),
  }),
  openai: Object.freeze({
    id: 'openai', supported: true, clientBaseUrl: false,
    hosts: Object.freeze(['api.openai.com']),
    defaultModel: 'gpt-4o-mini',
    keyPatterns: Object.freeze([OPENAI_KEY_RE]),
    pricePer1M: Object.freeze({ in: 0.15, out: 0.6 }),
  }),
  anthropic: Object.freeze({
    id: 'anthropic', supported: true, clientBaseUrl: false,
    hosts: Object.freeze(['api.anthropic.com']),
    defaultModel: 'claude-3-5-haiku-latest',
    keyPatterns: Object.freeze([ANTHROPIC_KEY_RE]),
    pricePer1M: Object.freeze({ in: 0.8, out: 4.0 }),
  }),
  openrouter: Object.freeze({
    id: 'openrouter', supported: true, clientBaseUrl: false,
    hosts: Object.freeze(['openrouter.ai']),
    defaultModel: 'google/gemini-2.5-flash',
    keyPatterns: Object.freeze([OPENROUTER_KEY_RE]),
    pricePer1M: null,
  }),
  groq: Object.freeze({
    id: 'groq', supported: true, clientBaseUrl: false,
    hosts: Object.freeze(['api.groq.com']),
    defaultModel: 'llama-3.3-70b-versatile',
    keyPatterns: Object.freeze([GROQ_KEY_RE]),
    pricePer1M: Object.freeze({ in: 0.59, out: 0.79 }),
  }),
  deepseek: Object.freeze({
    id: 'deepseek', supported: true, clientBaseUrl: false,
    hosts: Object.freeze(['api.deepseek.com']),
    defaultModel: 'deepseek-chat',
    keyPatterns: Object.freeze([DEEPSEEK_KEY_RE]),
    pricePer1M: Object.freeze({ in: 0.27, out: 1.1 }),
  }),
  mistral: Object.freeze({
    id: 'mistral', supported: true, clientBaseUrl: false,
    hosts: Object.freeze(['api.mistral.ai']),
    defaultModel: 'mistral-small-latest',
    keyPatterns: Object.freeze([MISTRAL_KEY_RE]),
    pricePer1M: Object.freeze({ in: 0.2, out: 0.6 }),
  }),
  xai: Object.freeze({
    id: 'xai', supported: true, clientBaseUrl: false,
    hosts: Object.freeze(['api.x.ai']),
    defaultModel: 'grok-2-latest',
    keyPatterns: Object.freeze([XAI_KEY_RE]),
    pricePer1M: Object.freeze({ in: 2.0, out: 10.0 }),
  }),
  together: Object.freeze({
    id: 'together', supported: true, clientBaseUrl: false,
    hosts: Object.freeze(['api.together.xyz']),
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    keyPatterns: Object.freeze([TOGETHER_KEY_RE]),
    pricePer1M: Object.freeze({ in: 0.88, out: 0.88 }),
  }),
  cerebras: Object.freeze({
    id: 'cerebras', supported: true, clientBaseUrl: false,
    hosts: Object.freeze(['api.cerebras.ai']),
    defaultModel: 'llama3.1-8b',
    keyPatterns: Object.freeze([CEREBRAS_KEY_RE]),
    pricePer1M: Object.freeze({ in: 0.1, out: 0.1 }),
  }),
  ollama: Object.freeze({
    id: 'ollama', supported: true, clientBaseUrl: true,
    hosts: Object.freeze(['localhost']),
    defaultModel: 'llama3.2',
    keyPatterns: Object.freeze([]),
    pricePer1M: Object.freeze({ in: 0, out: 0 }),
  }),
  lmstudio: Object.freeze({
    id: 'lmstudio', supported: true, clientBaseUrl: true,
    hosts: Object.freeze(['localhost']),
    defaultModel: 'qwen2.5-7b-instruct',
    keyPatterns: Object.freeze([]),
    pricePer1M: Object.freeze({ in: 0, out: 0 }),
  }),
  custom: Object.freeze({
    id: 'custom', supported: true, clientBaseUrl: true,
    hosts: Object.freeze([]),
    defaultModel: null,
    keyPatterns: Object.freeze([]),
    pricePer1M: null,
  }),
});

const PROVIDER_IDS = Object.freeze(Object.keys(PROVIDERS));

const DEFAULT_PROVIDER = 'openrouter';

// Host endpoint metadata cloud / nama internal (SSRF → eskalasi kredensial).
const METADATA_HOSTS = new Set([
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  '169.254.169.254', // AWS/GCP/Azure IMDS
  '169.254.170.2',   // AWS ECS task metadata
  '100.100.100.200', // Alibaba Cloud
  'fd00:ec2::254',   // AWS IMDS IPv6
]);

function validationError(message, reason, extra = {}) {
  // api-contract v1.2 §3.7: pelanggaran `X-Provider-Base-Url` memakai kode
  // khusus `ERR_PROVIDER_BASE_URL_NOT_ALLOWED` (bukan VALIDATION_PAYLOAD umum).
  return makeError(ErrorCodes.PROVIDER_BASE_URL_NOT_ALLOWED, message, {
    httpStatus: 400,
    retryable: false,
    details: { reason, ...extra },
  });
}

/**
 * Host mentah (sebelum normalisasi WHATWG URL). Dipakai untuk menangkap bentuk IP
 * ter-obfuskasi (desimal `2130706433`, heksa `0x7f000001`, oktal `0177.0.0.1`) yang
 * oleh parser URL dinormalisasi menjadi `127.0.0.1` — sehingga pemeriksaan
 * "loopback" bisa tertipu bila hanya melihat hasil normalisasi.
 */
function rawHostOf(rawUrl) {
  const m = String(rawUrl).match(/^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^/?#]*)/);
  if (!m) return '';
  const authority = m[1];
  const noCreds = authority.includes('@') ? authority.slice(authority.lastIndexOf('@') + 1) : authority;
  return noCreds.replace(/:\d*$/, '');
}

function unsupportedProvider(providerId) {
  return makeError(
    ErrorCodes.PROVIDER_UNSUPPORTED,
    `Provider '${providerId}' belum didukung backend ini.`,
    { httpStatus: 400, retryable: false, details: { provider: providerId, supported: PROVIDER_IDS.slice() } },
  );
}

/** Buang karakter yang tidak aman dari label sebelum dipantulkan ke pesan error. */
function sanitizeLabel(value) {
  return String(value == null ? '' : value).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 32);
}

function normalizeHost(host) {
  return String(host == null ? '' : host)
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^\[/, '')
    .replace(/\]$/, '');
}

function isLoopbackHost(host) {
  const h = normalizeHost(host);
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.startsWith('127.') || h.endsWith('.localhost');
}

/** Loopback berdasarkan alamat IP request (dipakai untuk pengecualian dev TLS). */
function isLoopbackAddress(ip) {
  const v = String(ip == null ? '' : ip).trim().toLowerCase().replace(/^::ffff:/, '');
  return v === '127.0.0.1' || v === '::1' || v.startsWith('127.');
}

function isPrivateIPv4(ip) {
  const parts = String(ip).split('.').map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true; // rusak → anggap tidak aman
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127) return true;              // 0/8, 10/8, 127/8
  if (a === 100 && b >= 64 && b <= 127) return true;              // 100.64/10 (CGNAT)
  if (a === 169 && b === 254) return true;                        // 169.254/16 (link-local + metadata)
  if (a === 172 && b >= 16 && b <= 31) return true;               // 172.16/12
  if (a === 192 && b === 168) return true;                        // 192.168/16
  if (a === 192 && b === 0 && c === 0) return true;               // 192.0.0/24
  if (a === 198 && (b === 18 || b === 19)) return true;           // 198.18/15 (benchmark)
  if (a >= 224) return true;                                      // multicast + reserved + broadcast
  return false;
}

function isPrivateIPv6(ip) {
  const h = String(ip).toLowerCase();
  if (h === '::' || h === '::1') return true;
  const v4mapped = h.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4mapped) return isPrivateIPv4(v4mapped[1]);
  const hexMapped = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1], 16);
    const lo = parseInt(hexMapped[2], 16);
    return isPrivateIPv4([hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.'));
  }
  if (/^f[cd][0-9a-f]{0,2}:/.test(h)) return true; // fc00::/7 (unique local)
  if (/^fe[89ab][0-9a-f]?:/.test(h)) return true;  // fe80::/10 (link-local)
  return false;
}

/**
 * @returns {string|null} konstanta alasan bila host dilarang, `null` bila bentuknya netral.
 */
function blockedHostReason(host) {
  const h = normalizeHost(host);
  if (!h) return 'empty_host';
  if (METADATA_HOSTS.has(h)) return 'cloud_metadata';
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.home.arpa')) {
    return 'internal_name';
  }
  // Bentuk IP "aneh" yang tetap resolve ke loopback pada sebagian resolver
  // (desimal 2130706433, oktal 0177.0.0.1, heksa 0x7f000001).
  if (/^\d+$/.test(h) || /^0[xX][0-9a-fA-F]+$/.test(h) || /^0[0-7]+(?:\.[0-7]+){0,3}$/.test(h)) {
    return 'obfuscated_ip_literal';
  }
  const kind = net.isIP(h);
  if (kind === 4) return isPrivateIPv4(h) ? 'private_ip' : null;
  if (kind === 6) return isPrivateIPv6(h) ? 'private_ip' : null;
  return null;
}

/** @returns {object} provider tervalidasi (melempar ERR_PROVIDER_UNSUPPORTED bila tidak ada/tidak didukung). */
function resolveProvider(headerValue) {
  const raw = String(headerValue == null ? '' : headerValue).trim().toLowerCase();
  const providerId = raw === '' ? DEFAULT_PROVIDER : sanitizeLabel(raw);
  const provider = PROVIDERS[providerId];
  if (!provider || !provider.supported) throw unsupportedProvider(providerId || 'unknown');
  return provider;
}

/**
 * Validasi format key sebelum dipakai (api-contract §2.12.1). Pesan error TIDAK
 * pernah memuat nilai key, panjangnya, atau potongannya.
 * Provider tanpa `keyPatterns` (lokal/`custom`) hanya diuji batas panjang.
 */
function assertProviderKeyFormat(providerId, key) {
  const invalid = (reason) => makeError(
    ErrorCodes.PROVIDER_KEY_INVALID,
    `API key tidak valid untuk '${sanitizeLabel(providerId) || 'provider'}'.`,
    { httpStatus: 401, retryable: false, details: { reason, provider: sanitizeLabel(providerId) } },
  );

  if (typeof key !== 'string') throw invalid('not_a_string');
  const value = key.trim();
  if (value.length < KEY_MIN_LEN) throw invalid('too_short');
  if (value.length > KEY_MAX_LEN) throw invalid('too_long');
  if (/\s/.test(value)) throw invalid('contains_whitespace');

  const provider = PROVIDERS[String(providerId || '').trim().toLowerCase()];
  const patterns = (provider && provider.keyPatterns) || [];
  if (patterns.length > 0 && !patterns.some((re) => re.test(value))) throw invalid('format_mismatch');
  return value;
}

/**
 * Validasi `baseUrl` dari klien (opsional). Mengembalikan origin ternormalisasi
 * atau `null` bila header tidak dikirim. Melempar ERR_VALIDATION_PAYLOAD (400)
 * untuk setiap pelanggaran allowlist/anti-SSRF.
 *
 * §3.7 butir 3 (v1.2): untuk provider registry host WAJIB ada di allowlist;
 * untuk `custom`/lokal host/port bebas (tetap diblokir bila privat/metadata).
 */
function assertBaseUrlAllowed(rawBaseUrl, provider) {
  if (rawBaseUrl === undefined || rawBaseUrl === null || String(rawBaseUrl).trim() === '') return null;
  const raw = String(rawBaseUrl).trim();
  if (raw.length > 2048) throw validationError('baseUrl terlalu panjang.', 'base_url_too_long', { provider: provider.id });

  let url;
  try {
    url = new URL(raw);
  } catch (e) {
    throw validationError('baseUrl tidak valid.', 'malformed_url', { provider: provider.id });
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw validationError('baseUrl harus memakai HTTPS.', 'unsupported_scheme', { provider: provider.id });
  }
  if (url.username || url.password) {
    throw validationError('baseUrl tidak boleh memuat kredensial.', 'credentials_in_url', { provider: provider.id });
  }

  const rawHost = rawHostOf(raw);
  if (/^\d+$/.test(rawHost) || /^0[xX][0-9a-fA-F]+$/.test(rawHost) || /^0[0-7]+(?:\.|$)/.test(rawHost)) {
    throw validationError('baseUrl memakai bentuk alamat IP ter-obfuskasi.', 'obfuscated_ip_literal', { provider: provider.id });
  }

  const host = normalizeHost(url.hostname);
  // Satu-satunya pengecualian non-HTTPS: localhost pada dev eksplisit (§5.3 butir 2).
  const devLocal = config.allowInsecureLocalProviderKey && isLoopbackHost(host);
  if (url.protocol === 'http:' && !devLocal) {
    throw validationError('baseUrl wajib HTTPS (kecuali localhost dev).', 'insecure_scheme', { provider: provider.id });
  }

  // Dev lokal eksplisit (loopback + flag dev) → boleh, sebelum allowlist host.
  // Flag ini default `false` di production, jadi tidak pernah aktif di sana.
  if (devLocal) return url.origin;

  const blocked = blockedHostReason(host);
  if (blocked) {
    throw validationError('baseUrl menunjuk alamat internal/terlarang.', blocked, { provider: provider.id });
  }

  // Provider `custom`/lokal: host & port ditentukan pengguna (§3.7 butir 3).
  if (provider.clientBaseUrl) return url.origin;

  if (!provider.hosts.includes(host)) {
    throw validationError('Host baseUrl tidak ada di allowlist provider.', 'host_not_allowlisted', { provider: provider.id });
  }
  const port = url.port === '' ? '443' : url.port;
  if (port !== '443') {
    throw validationError('baseUrl hanya boleh memakai port default (443).', 'port_not_allowed', { provider: provider.id });
  }
  if (url.pathname && url.pathname !== '/') {
    throw validationError('baseUrl tidak boleh memuat path.', 'path_not_allowed', { provider: provider.id });
  }
  return url.origin;
}

module.exports = {
  PROVIDERS,
  PROVIDER_IDS,
  DEFAULT_PROVIDER,
  METADATA_HOSTS,
  resolveProvider,
  assertProviderKeyFormat,
  assertBaseUrlAllowed,
  blockedHostReason,
  normalizeHost,
  isLoopbackHost,
  isLoopbackAddress,
  isPrivateIPv4,
  isPrivateIPv6,
  sanitizeLabel,
  rawHostOf,
};
