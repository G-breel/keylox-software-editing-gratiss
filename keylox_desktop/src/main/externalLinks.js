'use strict';

/**
 * `shell:openExternal` — allowlist URL eksternal (`api-contract.md` v1.2 §2.12.7).
 *
 * Aturan keamanan (pelanggaran = bug keamanan):
 *  1. HANYA skema `https:` (tolak `http:`, `file:`, `javascript:`, `data:`, `mailto:`);
 *  2. host WAJIB ada di allowlist = host `docsUrl` semua provider (registry §2.13)
 *     + host onboarding resmi;
 *  3. url TIDAK boleh memuat kredensial;
 *  4. pesan error TIDAK memantulkan URL mentah (boleh memuat host ternormalisasi) —
 *     konsisten `SEC-ERR-01`.
 *
 * Bukan pembungkus `shell.openExternal` bebas. Modul murni Node (DI `openExternal`)
 * → dapat diuji unit tanpa Electron.
 */

const { KeyloxError } = require('./errors');
const { docsHosts } = require('../shared/providerRegistry');
const { EXTERNAL_URL_NOT_ALLOWED } = require('../shared/constants');

/** Host onboarding resmi tambahan (§2.12.7 butir 2). */
const ONBOARDING_HOSTS = Object.freeze([
  'aistudio.google.com',
  'platform.openai.com',
  'console.anthropic.com',
  'openrouter.ai',
  'console.groq.com',
  'platform.deepseek.com',
  'console.mistral.ai',
  'console.x.ai',
  'api.together.xyz',
  'cloud.cerebras.ai',
]);

/** Allowlist gabungan (di-dedupe, lowercase). */
function buildAllowlist(extra = []) {
  const set = new Set();
  for (const h of [...docsHosts(), ...ONBOARDING_HOSTS, ...extra]) {
    if (typeof h === 'string' && h) set.add(h.toLowerCase().replace(/\.$/, ''));
  }
  return set;
}

function normalizeHostname(hostname) {
  return String(hostname || '').toLowerCase().replace(/\.$/, '');
}

/**
 * @param {object} [deps]
 * @param {(url:string) => Promise<void>} [deps.openExternal]
 * @param {string[]} [deps.extraHosts]
 */
function createExternalLinks(deps = {}) {
  const { openExternal, extraHosts = [] } = deps;
  const allowlist = buildAllowlist(extraHosts);

  /**
   * Validasi URL eksternal tanpa membuka. Melempar `ERR_VALIDATION_PAYLOAD`
   * (`reason: 'external_url_not_allowed'`) bila tidak sesuai allowlist.
   * @param {unknown} url
   * @returns {string} URL ternormalisasi
   */
  function validate(url) {
    const notAllowed = (hostForMessage) => new KeyloxError(
      'ERR_VALIDATION_PAYLOAD',
      hostForMessage
        ? `URL eksternal tidak diizinkan (host: ${hostForMessage}).`
        : 'URL eksternal tidak diizinkan.',
      { details: { reason: EXTERNAL_URL_NOT_ALLOWED, ...(hostForMessage ? { host: hostForMessage } : {}) } }
    );

    if (typeof url !== 'string' || url.length === 0 || url.length > 2048) {
      throw notAllowed(null);
    }
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw notAllowed(null);
    }
    if (parsed.protocol !== 'https:') throw notAllowed(null);
    if (parsed.username || parsed.password) throw notAllowed(null);

    const host = normalizeHostname(parsed.hostname);
    if (!allowlist.has(host)) {
      // Boleh memuat HOST ternormalisasi (bukan URL mentah) — §2.12.7 butir 5.
      throw notAllowed(host ? host.slice(0, 64) : null);
    }
    // Buang komponen yang tidak perlu; kembalikan bentuk https://host/path yang bersih.
    return `https://${host}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  }

  async function open(input) {
    const url = typeof input === 'string' ? input : input && input.url;
    const safeUrl = validate(url);
    if (typeof openExternal === 'function') {
      await openExternal(safeUrl);
    }
    return { ok: true };
  }

  return { open, validate, allowlist: () => [...allowlist].sort() };
}

module.exports = { createExternalLinks, buildAllowlist, ONBOARDING_HOSTS };
