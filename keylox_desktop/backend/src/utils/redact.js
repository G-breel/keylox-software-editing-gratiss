'use strict';

/**
 * Redaksi rahasia — lapisan WAJIB sebelum nilai apa pun masuk log/telemetri.
 *
 * Sumber aturan:
 *  - `byok-api-key.md` §3 & §8 ("Key dilarang masuk log/telemetri/crash report;
 *    redact pola `AIza[a-zA-Z0-9_-]{20,}` dan `sk-[...]`").
 *  - `api-contract.md` §2.12 invarian 4 & §3.7 header (`X-Provider-Key` **dilarang
 *    di-log**, respons tidak boleh menggemakan key — `SEC-ERR-01`).
 *  - `06-security.md` §5.3 butir 6.
 *
 * Dua lapis, sengaja:
 *  1. POLA NILAI  — memindai string apa pun (pesan error provider, URL, stack trace)
 *     dan mengganti pola key provider dengan bentuk termask kontrak §2.12 invarian 6.
 *  2. NAMA FIELD  — kunci objek yang jelas rahasia (`X-Provider-Key`, `apiKey`, …)
 *     diganti tanpa memedulikan isinya (menangkap format key yang belum kita kenali).
 *
 * Catatan: modul ini TIDAK pernah menulis/mencatat nilai asli. Dipakai `logger.js`
 * (hook pino) dan service provider (saat melog pesan error upstream).
 */

// Pola rahasia yang dikenal (byok-api-key.md §3 + scripts/secret-scan.mjs RULES).
// Ditulis sebagai regex-literal (bukan string) agar tidak ikut terbaca sebagai
// nilai rahasia oleh pemindai pola (lihat scripts/secret-scan.mjs).
const SECRET_PATTERNS = [
  { name: 'gemini_key_aiza', re: /AIza[0-9A-Za-z_-]{20,}/g },
  { name: 'gemini_key_aq', re: /AQ\.[A-Za-z0-9_-]{25,}/g },
  { name: 'openai_key_sk', re: /sk-[A-Za-z0-9]{20,}/g },
  { name: 'aws_access_key_id', re: /AKIA[0-9A-Z]{16}/g },
  { name: 'bearer_token', re: /Bearer\s+[A-Za-z0-9._~+/=-]{20,}/gi },
  { name: 'secret_in_query', re: /[?&](key|api_key|apikey|access_token|token|provider_key|x-provider-key)=[A-Za-z0-9_\-.]{16,}/gi },
];

// Nama field/kunci yang isinya rahasia (header Node selalu lowercase).
const SECRET_FIELD_RE = /^(x-provider-key|x-provider|provider[_-]?key|api[_-]?key|apikey|authorization|cookie|set-cookie|password|passwd|secret|client[_-]?secret|token|access[_-]?token|refresh[_-]?token)$/i;

const MASK = '\u2022'.repeat(8); // ••••••••
const MAX_DEPTH = 6;
const MAX_STRING = 4000;
const MAX_ARRAY = 50;
const MAX_FIELDS = 60;

/** Bentuk mask kontrak §2.12 invarian 6: 4 char pertama + •••••••• + 4 char terakhir. */
function maskSecret(value) {
  const v = String(value == null ? '' : value);
  if (v.length < 12) return MASK;
  return `${v.slice(0, 4)}${MASK}${v.slice(-4)}`;
}

/** Ganti setiap pola rahasia di dalam string. Aman untuk string non-rahasia. */
function redactString(value) {
  let out = String(value == null ? '' : value);
  if (out.length > MAX_STRING) out = `${out.slice(0, MAX_STRING)}…[truncated]`;
  for (const { re } of SECRET_PATTERNS) {
    re.lastIndex = 0;
    out = out.replace(re, (m) => maskSecret(m));
  }
  return out;
}

/** Salin-ter-redaksi untuk objek/array/Error (tidak memutasi input). */
function redactDeep(value, depth = 0, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === 'string') return redactString(value);
  if (t === 'number' || t === 'boolean' || t === 'bigint') return value;
  if (t === 'function' || t === 'symbol') return '[unloggable]';
  if (value instanceof Error) {
    return redactDeep(
      { name: value.name, message: value.message, code: value.code, stack: value.stack },
      depth,
      seen,
    );
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return '[Buffer]';
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (t !== 'object') return String(value);
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map((v) => redactDeep(v, depth + 1, seen));
  if (value instanceof Map) {
    const out = {};
    let i = 0;
    for (const [k, v] of value.entries()) {
      if (i++ >= MAX_FIELDS) break;
      out[String(k)] = redactDeep(v, depth + 1, seen);
    }
    return out;
  }
  if (value instanceof Set) return redactDeep([...value].slice(0, MAX_ARRAY), depth + 1, seen);

  const out = {};
  let i = 0;
  for (const [k, v] of Object.entries(value)) {
    if (i++ >= MAX_FIELDS) break;
    if (SECRET_FIELD_RE.test(k)) {
      out[k] = typeof v === 'string' ? maskSecret(v) : '[REDACTED]';
      continue;
    }
    out[k] = redactDeep(v, depth + 1, seen);
  }
  return out;
}

module.exports = { maskSecret, redactString, redactDeep, SECRET_PATTERNS, SECRET_FIELD_RE, MASK };
