'use strict';

/**
 * Penyimpanan rahasia BYOK (main process saja).
 *
 * Sumber: `api-contract.md` v1.1 §2.12 (invarian #2: key hanya dibaca/ditulis di
 * main via `safeStorage` → `app.getPath('userData')/secure/settings.enc`),
 * `byok-api-key.md` §3 (format JSON terenkripsi `{ provider, apiKey, model, baseUrl }`),
 * §6.2 (`{ backendBaseUrl, userToken, deviceId, provider, apiKey, model, baseUrl }`).
 *
 * Modul murni Node + DI (`safeStorage` disuntik) sehingga bisa diuji unit tanpa
 * Electron. TIDAK ADA nilai key yang pernah dituliskan ke log.
 *
 * Renderer HANYA boleh menerima `{ hasKey, masked, model }` — tidak pernah `apiKey`.
 */

const nodeFs = require('fs');
const nodePath = require('path');
const crypto = require('crypto');

const { KeyloxError } = require('./errors');
const { maskSecret, createLogger } = require('./redact');
const {
  validateProvider,
  validateApiKey,
  validateProviderBaseUrl,
  validateBackendBaseUrl,
  resolveModel,
} = require('./providerPolicy');

const STORE_VERSION = 1;
const SECURE_DIR_NAME = 'secure';
const SECURE_FILE_NAME = 'settings.enc';
const MAX_PREF_VALUE_LEN = 2048;

// Nama field preference non-rahasia yang boleh lewat settings:get/set (§2.7).
const ALLOWED_PREF_KEYS = Object.freeze(['backendBaseUrl', 'mode', 'provider', 'model', 'deviceId']);

function emptyState() {
  return {
    version: STORE_VERSION,
    updatedAt: null,
    provider: null,
    apiKey: null,
    model: null,
    baseUrl: null,
    backendBaseUrl: '',
    mode: 'direct',
    deviceId: null,
    prefs: {},
  };
}

function normalizeState(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== 'object') return base;
  const state = { ...base, ...raw };
  state.prefs = raw.prefs && typeof raw.prefs === 'object' ? { ...raw.prefs } : {};
  if (state.apiKey !== null && typeof state.apiKey !== 'string') state.apiKey = null;
  if (state.provider !== null) state.provider = String(state.provider);
  if (state.model !== null) state.model = String(state.model);
  if (state.baseUrl !== null) state.baseUrl = String(state.baseUrl);
  state.backendBaseUrl = typeof state.backendBaseUrl === 'string' ? state.backendBaseUrl : '';
  state.mode = state.backendBaseUrl ? 'proxy' : 'direct';
  return state;
}

/**
 * @param {object} deps
 * @param {{isEncryptionAvailable: Function, encryptString: Function, decryptString: Function}} deps.safeStorage
 * @param {string} deps.filePath Path absolut `…/secure/settings.enc`
 * @param {object} [deps.fsImpl] Override fs (test)
 * @param {object} [deps.logger] Logger ter-redaksi
 * @param {boolean} [deps.allowLocalhostDev]
 */
function createSecretStore(deps) {
  const {
    safeStorage,
    filePath,
    fsImpl = nodeFs,
    logger = createLogger(console),
    allowLocalhostDev = true,
  } = deps || {};

  if (!filePath) throw new Error('createSecretStore: filePath wajib.');
  const pathImpl = deps.pathImpl || nodePath;

  let cache = null;

  function storageAvailable() {
    try {
      return Boolean(safeStorage && safeStorage.isEncryptionAvailable());
    } catch {
      return false;
    }
  }

  function unavailable(detail) {
    return new KeyloxError(
      'ERR_SECURE_STORAGE_UNAVAILABLE',
      'Penyimpanan aman OS (safeStorage) tidak tersedia — key tidak dapat disimpan/dibaca.',
      { details: detail ? { reason: detail } : undefined }
    );
  }

  function readState() {
    if (cache) return cache;
    if (!storageAvailable()) throw unavailable('not-available');
    let buffer;
    try {
      buffer = fsImpl.readFileSync(filePath);
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        // Belum ada key tersimpan: state kosong, bukan error.
        cache = emptyState();
        return cache;
      }
      throw unavailable('read-failed');
    }
    try {
      const json = safeStorage.decryptString(buffer);
      cache = normalizeState(JSON.parse(json));
      return cache;
    } catch {
      // Kunci OS berubah / berkas rusak. Jangan menebak isinya.
      logger.warn('[byok] store tidak dapat didekripsi; dianggap belum ada key.');
      throw unavailable('decrypt-failed');
    }
  }

  function writeState(state) {
    if (!storageAvailable()) throw unavailable('not-available');
    const next = normalizeState(state);
    next.version = STORE_VERSION;
    next.updatedAt = new Date().toISOString();
    if (!next.deviceId) next.deviceId = crypto.randomUUID();

    let encrypted;
    try {
      encrypted = safeStorage.encryptString(JSON.stringify(next));
    } catch {
      throw unavailable('encrypt-failed');
    }

    const dir = pathImpl.dirname(filePath);
    try {
      fsImpl.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const tmp = `${filePath}.tmp`;
      fsImpl.writeFileSync(tmp, encrypted, { mode: 0o600 });
      fsImpl.renameSync(tmp, filePath);
      try {
        fsImpl.chmodSync(filePath, 0o600);
      } catch {
        /* Windows: chmod tidak berlaku penuh — diabaikan. */
      }
    } catch {
      logger.error('[byok] gagal menulis secure store.');
      throw unavailable('write-failed');
    }

    cache = next;
    return next;
  }

  /** State runtime untuk main process (memuat key!). JANGAN kirim ke renderer. */
  function getRuntimeConfig() {
    const state = readState();
    return {
      provider: state.provider,
      apiKey: state.apiKey,
      model: state.model,
      baseUrl: state.baseUrl,
      backendBaseUrl: state.backendBaseUrl,
      mode: state.backendBaseUrl ? 'proxy' : 'direct',
      deviceId: state.deviceId || null,
    };
  }

  /** §2.12.2 — satu-satunya permukaan yang boleh keluar ke renderer. */
  function hasSecret(provider) {
    validateProvider(provider);
    let state;
    try {
      state = readState();
    } catch (error) {
      if (error instanceof KeyloxError && error.code === 'ERR_SECURE_STORAGE_UNAVAILABLE') {
        return { hasKey: false, masked: null, model: null, error: { code: error.code, message: error.message, retryable: error.retryable } };
      }
      throw error;
    }
    const hasKey = Boolean(state.apiKey) && state.provider === provider;
    return {
      hasKey,
      masked: hasKey ? maskSecret(state.apiKey) : null,
      model: hasKey ? state.model || null : null,
    };
  }

  /** §2.12.1 */
  function setSecret(input) {
    const payload = input && typeof input === 'object' ? input : {};
    const provider = validateProvider(payload.provider);
    const apiKey = validateApiKey(provider, payload.apiKey);
    const model = resolveModel(provider, payload.model);
    const baseUrl = validateProviderBaseUrl(provider, payload.baseUrl, { allowLocalhostDev });

    const state = readState();
    state.provider = provider;
    state.apiKey = apiKey;
    state.model = model;
    state.baseUrl = baseUrl;
    writeState(state);

    return { ok: true, hasKey: true, masked: maskSecret(apiKey), model, provider };
  }

  /** §2.12.3 — timpa dengan state kosong; berkas & safeStorage tetap ada. */
  function clearSecret(provider) {
    validateProvider(provider);
    const state = readState();
    if (state.apiKey) {
      state.provider = provider;
      state.apiKey = null;
      state.model = null;
      state.baseUrl = null;
    }
    writeState(state);
    return { ok: true };
  }

  /* ---------------- Preferences non-rahasia (§2.7) ---------------- */

  function getPreference(key) {
    if (typeof key !== 'string' || !key) {
      throw new KeyloxError('ERR_VALIDATION_PAYLOAD', 'Key setting wajib berupa teks.');
    }
    if (isSecretKeyName(key)) {
      throw new KeyloxError(
        'ERR_VALIDATION_SECRET_IN_PLAIN_SETTING',
        'Rahasia tidak boleh dibaca lewat settings:get.'
      );
    }
    let state;
    try {
      state = readState();
    } catch (error) {
      if (error instanceof KeyloxError && error.code === 'ERR_SECURE_STORAGE_UNAVAILABLE') {
        return { value: null, error: { code: error.code, message: error.message, retryable: error.retryable } };
      }
      throw error;
    }
    if (ALLOWED_PREF_KEYS.includes(key)) return { value: state[key] ?? null };
    return { value: Object.prototype.hasOwnProperty.call(state.prefs, key) ? state.prefs[key] : null };
  }

  function setPreference(key, value) {
    if (typeof key !== 'string' || !key || key.length > 64) {
      throw new KeyloxError('ERR_VALIDATION_PAYLOAD', 'Key setting tidak valid.');
    }
    if (isSecretKeyName(key)) {
      // §2.7: settings:set DILARANG untuk rahasia.
      throw new KeyloxError(
        'ERR_VALIDATION_SECRET_IN_PLAIN_SETTING',
        'Rahasia (API key) tidak boleh disimpan lewat settings:set — gunakan settings:setSecret.'
      );
    }

    if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
      throw new KeyloxError('ERR_VALIDATION_PAYLOAD', 'Nilai setting harus primitif.');
    }
    if (typeof value === 'string' && value.length > MAX_PREF_VALUE_LEN) {
      throw new KeyloxError('ERR_VALIDATION_PAYLOAD', 'Nilai setting terlalu panjang.');
    }

    const state = readState();

    if (key === 'backendBaseUrl') {
      state.backendBaseUrl = validateBackendBaseUrl(typeof value === 'string' ? value : '', { allowLocalhostDev });
      state.mode = state.backendBaseUrl ? 'proxy' : 'direct';
    } else if (key === 'mode') {
      // Mode diturunkan dari backendBaseUrl (§6.4). 'proxy' tanpa URL → tolak.
      if (value === 'direct') {
        state.backendBaseUrl = '';
        state.mode = 'direct';
      } else if (value === 'proxy') {
        if (!state.backendBaseUrl) {
          throw new KeyloxError('ERR_VALIDATION_PAYLOAD', 'Mode Proxy membutuhkan Backend Base URL.');
        }
        state.mode = 'proxy';
      } else {
        throw new KeyloxError('ERR_VALIDATION_PAYLOAD', "Mode harus 'direct' atau 'proxy'.");
      }
    } else if (ALLOWED_PREF_KEYS.includes(key)) {
      state[key] = value;
    } else {
      state.prefs[key] = value;
    }

    writeState(state);
    return { ok: true };
  }

  return {
    filePath,
    isStorageAvailable: storageAvailable,
    getRuntimeConfig,
    hasSecret,
    setSecret,
    clearSecret,
    getPreference,
    setPreference,
    _readState: readState, // untuk test (main process only)
    _resetCache: () => {
      cache = null;
    },
  };
}

const SECRET_KEY_RE = /(api[_-]?key|apikey|secret|password|passwd|token|credential|private[_-]?key)/i;

/**
 * Nama setting yang menandakan rahasia (§2.7). Selain pola eksplisit, apa pun yang
 * berakhiran `key` diperlakukan sebagai rahasia — `settings:set` bukan jalur yang
 * benar untuk menyimpan kredensial (harus `settings:setSecret`).
 */
function isSecretKeyName(key) {
  const name = String(key).trim();
  if (!name) return false;
  return SECRET_KEY_RE.test(name) || /key$/i.test(name);
}

function defaultSecureFilePath(app) {
  return nodePath.join(app.getPath('userData'), SECURE_DIR_NAME, SECURE_FILE_NAME);
}

module.exports = {
  createSecretStore,
  defaultSecureFilePath,
  emptyState,
  normalizeState,
  isSecretKeyName,
  STORE_VERSION,
  SECURE_DIR_NAME,
  SECURE_FILE_NAME,
  ALLOWED_PREF_KEYS,
};
