'use strict';

/**
 * Redaksi rahasia (BYOK) — dipasang SEBELUM key pertama kali dibaca.
 *
 * Sumber: `api-contract.md` v1.1 §2.12 invarian #4 ("Key tidak masuk log/telemetri/
 * crash report; redaksi pola `AIza[a-zA-Z0-9_-]{20,}` & `sk-[A-Za-z0-9]{20,}`") dan
 * §8 ("redact() wajib dipasang di logger sebelum key pernah dibaca").
 *
 * Modul murni Node (tanpa Electron) supaya bisa diuji unit-test.
 *
 * Aturan: `redact()` TIDAK boleh bergantung pada nilai key yang di-hold di memori —
 * ia harus jalan sejak proses start (key belum ada). Karena itu hanya pola generik.
 */

const REDACTED = '[REDACTED_KEY]';

// Pola rahasia yang dikenal (provider AI + kredensial umum yang tidak boleh bocor).
const SECRET_PATTERNS = [
  /AIza[0-9A-Za-z_-]{20,}/g, // Google API key
  /AQ\.[A-Za-z0-9_-]{20,}/g, // Google OAuth-ish key (kontrak §2.12.1)
  /sk-[A-Za-z0-9_-]{20,}/g, // OpenAI / compatible
  /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, // Authorization header
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

const MAX_DEPTH = 6;

/** Ganti semua pola rahasia pada sebuah string. */
function redactText(value) {
  let out = String(value);
  for (const re of SECRET_PATTERNS) {
    re.lastIndex = 0;
    out = out.replace(re, REDACTED);
  }
  return out;
}

/**
 * Redaksi rekursif untuk nilai apa pun (string, Error, array, objek).
 * Nilai non-string dikembalikan sebagai representasi redaksi yang aman.
 */
function redact(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return redactText(String(value));
  if (typeof value === 'function') return '[Function]';
  if (value instanceof Error) {
    return { name: value.name, message: redactText(value.message), code: value.code };
  }
  if (depth >= MAX_DEPTH) return '[Object]';
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      // Header/field yang membawa kredensial selalu disensor utuh.
      if (isSecretField(k)) out[k] = REDACTED;
      else out[k] = redact(v, depth + 1);
    }
    return out;
  }
  return redactText(String(value));
}

// Nama field yang selalu disensor utuh. Normalisasi membuang pemisah & besar-kecil
// huruf supaya `X-Provider-Key`, `x_provider_key`, dan `XProviderKey` sama-sama
// tertangkap (kontrak §2.12: key tidak boleh masuk log dalam bentuk apa pun).
const SECRET_FIELD_NAMES = new Set([
  'apikey', 'providerkey', 'xproviderkey', 'authorization', 'auth', 'bearer',
  'token', 'accesstoken', 'refreshtoken', 'password', 'passwd', 'secret',
  'credential', 'credentials', 'privatekey', 'accesskey', 'clientsecret',
]);

function normalizeFieldName(name) {
  return String(name).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isSecretField(name) {
  const normalized = normalizeFieldName(name);
  if (!normalized) return false;
  if (SECRET_FIELD_NAMES.has(normalized)) return true;
  // `geminiKey`, `provider_key`, … — sebagian besar field berkunci = kredensial.
  // Salah sensor di log jauh lebih murah daripada key bocor.
  return normalized.length > 3 && normalized.endsWith('key');
}

/**
 * Logger dengan redaksi terpasang. `console.*` global TIDAK ditimpa di sini —
 * main.js memanggil `installConsoleRedaction()` saat bootstrap (sebelum IPC/key).
 */
function createLogger(sink = console) {
  const emit = (level, ...args) => {
    const safe = args.map((a) => redact(a));
    const fn = typeof sink[level] === 'function' ? sink[level] : sink.log;
    fn.apply(sink, safe);
  };
  return {
    info: (...args) => emit('info', ...args),
    warn: (...args) => emit('warn', ...args),
    error: (...args) => emit('error', ...args),
    debug: (...args) => emit('debug', ...args),
  };
}

/**
 * Timpa console.* agar tidak ada jalur log (termasuk stack trace provider) yang
 * bisa membocorkan key. Dipanggil di awal `main.js`.
 */
function installConsoleRedaction(target = console) {
  if (target.__keyloxRedacted) return target;
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    const original = target[level];
    if (typeof original !== 'function') continue;
    target[level] = (...args) => original.apply(target, args.map((a) => redact(a)));
  }
  Object.defineProperty(target, '__keyloxRedacted', { value: true, enumerable: false });
  return target;
}

/**
 * Mask key untuk ditampilkan ke user (contract §2.12 invarian #6):
 * 4 char pertama + `••••••••` + 4 char terakhir; key < 12 char → `••••••••`.
 * TIDAK PERNAH mengembalikan key utuh.
 */
const MASK_DOTS = '\u2022'.repeat(8);

function maskSecret(apiKey, dots = MASK_DOTS) {
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!key || key.length < 12) return dots;
  return `${key.slice(0, 4)}${dots}${key.slice(-4)}`;
}

module.exports = {
  REDACTED,
  redact,
  redactText,
  isSecretField,
  createLogger,
  installConsoleRedaction,
  maskSecret,
  MASK_DOTS,
};
