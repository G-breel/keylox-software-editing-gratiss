'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Preload Keylox — permukaan resmi renderer: **`window.keylox.*`** (bernama-spasi).
 *
 * Kontrak: `keylox/docs/superapp/api-contract.md` v1.1
 *  - §2.11.1 keputusan `window.keylox.*` + alias `window.api` deprecated
 *  - §2.11.2 daftar method final (permukaan = allowlist channel, objek di-freeze)
 *  - §2.11.3 tabel migrasi + perilaku alias (1 log deprecation per method)
 *  - §2.12   5 channel BYOK (`settings:setSecret|hasSecret|clearSecret|testProvider`, `ai:invoke`)
 *  - §2.12.7 `shell:openExternal` (allowlist https + host resmi) [BARU v1.2]
 *  - §2.15   5 channel privasi/data (`privacy:getMode|setMode|confirmExternal`, `data:wipeLocal|exportLocal`) [BARU v1.2]
 *  - §2.16   `usage:get` (transparansi token/biaya) [BARU v1.2]
 *  - §2.7    `settings:get|set` (non-rahasia; rahasia lewat setSecret)
 *  - §5.2.1  `ERR_IPC_CHANNEL_DENIED` untuk channel di luar allowlist
 *
 * Pengerasan Stage 8 yang DIPERTAHANKAN:
 *  - `contextIsolation: true` + `sandbox: true` (di main.js), tanpa `nodeIntegration`.
 *  - Semua channel lewat allowlist `INVOKE_CHANNELS`; channel lain → `ERR_IPC_CHANNEL_DENIED`.
 *  - Argument divalidasi di sini (defense-in-depth) lalu divalidasi ulang di main.
 *  - Verifikasi pengirim (frame utama) dilakukan di main.js (`fromMainFrame`).
 *  - `onProgress` mengembalikan fungsi unsubscribe sinkron (anti listener leak).
 *  - Renderer TIDAK pernah menerima key: hanya `{ hasKey, masked, model }`.
 */

/* ------------------------------------------------------------------ *
 * Allowlist channel (satu-satunya sumber kebenaran di sisi preload)
 * ------------------------------------------------------------------ */

const INVOKE_CHANNELS = Object.freeze({
  // §2.11.2 — dialog / fs / shell / ffmpeg
  'dialog:openFiles': true,
  'dialog:openFolder': true,
  'dialog:saveFile': true,
  'fs:readDir': true,
  'fs:stat': true,
  'shell:openPath': true,
  'ffmpeg:probe': true,
  'ffmpeg:export': true,
  'ffmpeg:thumbnail': true,
  // §2.11.2 — seeding E2E (di-gate di MAIN: NODE_ENV=test | KEYLOX_E2E=1)
  'project:createWithMedia': true,
  // §2.7 — preferensi NON-rahasia (backendBaseUrl, mode, …). Rahasia ditolak di main.
  'settings:get': true,
  'settings:set': true,
  // §2.12 — BYOK
  'settings:setSecret': true,
  'settings:hasSecret': true,
  'settings:clearSecret': true,
  'settings:testProvider': true,
  'ai:invoke': true,
  // §2.12.7 — onboarding "Dapatkan API Key Gratis" [BARU v1.2]
  'shell:openExternal': true,
  // §2.16 — transparansi token/biaya [BARU v1.2]
  'usage:get': true,
  // §2.15 — privasi & data [BARU v1.2]
  'privacy:getMode': true,
  'privacy:setMode': true,
  'privacy:confirmExternal': true,
  'data:wipeLocal': true,
  'data:exportLocal': true,
});

const EVENT_CHANNELS = Object.freeze({
  'ffmpeg:progress': true,
});

function deniedError(channel) {
  const err = new Error(`IPC channel tidak diizinkan: ${channel} (ERR_IPC_CHANNEL_DENIED)`);
  err.code = 'ERR_IPC_CHANNEL_DENIED';
  err.retryable = false;
  return err;
}

/**
 * Error validasi payload (bukan pelanggaran allowlist channel). Dipakai channel
 * v1.2 agar kode error yang dilihat renderer sesuai `api-contract.md` §5.2
 * (`ERR_VALIDATION_PAYLOAD`), bukan `ERR_IPC_CHANNEL_DENIED`.
 */
function validationError(message) {
  const err = new Error(message);
  err.code = 'ERR_VALIDATION_PAYLOAD';
  err.retryable = false;
  return err;
}

function invoke(channel, ...args) {
  if (INVOKE_CHANNELS[channel] !== true) {
    return Promise.reject(deniedError(channel));
  }
  return ipcRenderer.invoke(channel, ...args);
}

/* ------------------------------------------------------------------ *
 * Utilitas validasi argumen (defense-in-depth)
 * ------------------------------------------------------------------ */

function isPathArg(v) {
  return typeof v === 'string' && v.length > 0 && v.length <= 4096 && !v.includes('\0');
}

// 13 provider kanonik (api-contract v1.2 §2.13.1). Daftar ini SENGAJA di-inline:
// `sandbox: true` membuat preload tidak boleh `require()` berkas `src/shared/**`.
// Sumber kebenaran tetap registry; kesamaan dijaga oleh tests/unit/preloadChannels.test.ts.
const PROVIDERS = Object.freeze([
  'gemini', 'openai', 'anthropic', 'openrouter', 'groq', 'deepseek', 'mistral',
  'xai', 'together', 'cerebras', 'ollama', 'lmstudio', 'custom',
]);

const JOB_TYPES = Object.freeze([
  'parse_command', 'chat', 'refine', 'transcribe', 'scene_detect',
  'ocr', 'metadata', 'thumbnail', 'vision_color', 'tts', 'translate', 'moderation',
]);

const PRIVACY_MODES = Object.freeze(['local-only', 'standard', 'cloud']);
const CONFIRM_SCOPES = Object.freeze(['once', 'session', 'always']);
const WIPE_SCOPES = Object.freeze(['cache', 'usage', 'all']);
const USAGE_RANGES = Object.freeze(['today', '7d', '30d', 'all']);

function isProvider(v) {
  return typeof v === 'string' && PROVIDERS.includes(v);
}

function isJobType(v) {
  return typeof v === 'string' && JOB_TYPES.includes(v);
}

function isPlainObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Channel BYOK mengembalikan `{ ok:false, error: ErrorShape }` sebagai nilai (bukan
 * throw) supaya `code` tetap utuh melewati serialisasi IPC. Di sini nilai itu
 * diubah menjadi rejection yang membawa `.code`/`.retryable` agar renderer bisa
 * membedakan `ERR_AI_NO_KEY` (→ CTA "Atur API Key") dari error lain (§5.2.1).
 */
function unwrap(channel, result) {
  if (isPlainObject(result) && result.ok === false && isPlainObject(result.error)) {
    const err = new Error(result.error.message || `Gagal memanggil ${channel}.`);
    err.code = result.error.code || 'ERR_VALIDATION_PAYLOAD';
    err.retryable = result.error.retryable === true;
    if (result.error.details !== undefined) err.details = result.error.details;
    throw err;
  }
  return result;
}

/* ------------------------------------------------------------------ *
 * Permukaan resmi: window.keylox.*  (§2.11.2)
 * ------------------------------------------------------------------ */

const keylox = {
  dialog: {
    openFiles: () => invoke('dialog:openFiles'),
    openFolder: () => invoke('dialog:openFolder'),
    saveFile: (name) => invoke('dialog:saveFile', typeof name === 'string' ? name : ''),
  },

  fs: {
    readDir: (dir) => (isPathArg(dir) ? invoke('fs:readDir', dir) : Promise.resolve([])),
    stat: (p) => (isPathArg(p) ? invoke('fs:stat', p) : Promise.resolve(null)),
  },

  shell: {
    openPath: (p) => (isPathArg(p) ? invoke('shell:openPath', p) : Promise.resolve()),
    /**
     * §2.12.7 [BARU v1.2] — buka dokumentasi/akun provider di browser OS.
     * Allowlist (https + host resmi) ditegakkan di MAIN; di sini hanya bentuk arg.
     */
    openExternal: (input) => {
      const url = typeof input === 'string' ? input : (isPlainObject(input) ? input.url : undefined);
      if (typeof url !== 'string' || url.length === 0) {
        return Promise.reject(validationError('URL eksternal tidak valid.'));
      }
      // Skema/host/panjang divalidasi ulang di MAIN (allowlist `docsUrl`); error-nya
      // `ERR_VALIDATION_PAYLOAD` dengan reason `external_url_not_allowed` (§2.12.7).
      return invoke('shell:openExternal', { url }).then((r) => unwrap('shell:openExternal', r));
    },
  },

  ffmpeg: {
    probe: (p) => (isPathArg(p) ? invoke('ffmpeg:probe', p) : Promise.resolve({ error: 'invalid path' })),
    export: (opts) => (isPlainObject(opts) ? invoke('ffmpeg:export', opts) : Promise.resolve({ success: false, error: 'invalid options' })),
    thumbnail: (p, t) => (isPathArg(p) ? invoke('ffmpeg:thumbnail', p, Number(t) || 0) : Promise.resolve(null)),
    /**
     * Langganan progress export. Mengembalikan fungsi unsubscribe (sinkron) agar
     * listener tidak menumpuk di renderer.
     */
    onProgress: (cb) => {
      if (typeof cb !== 'function') return () => {};
      const listener = (_event, value) => {
        if (typeof value === 'number' && Number.isFinite(value)) cb(value);
      };
      ipcRenderer.on('ffmpeg:progress', listener);
      return () => ipcRenderer.removeListener('ffmpeg:progress', listener);
    },
  },

  project: {
    /**
     * Seeding test/E2E (BUG-04). Gate sebenarnya ada di MAIN: di production
     * channel ini tidak terdaftar → `ERR_IPC_CHANNEL_DENIED`.
     */
    createWithMedia: (spec) => (isPlainObject(spec) ? invoke('project:createWithMedia', spec) : Promise.reject(deniedError('project:createWithMedia'))),
  },

  settings: {
    /** Preferensi NON-rahasia (tema, bahasa, backendBaseUrl, mode). */
    get: (input) => {
      const payload = isPlainObject(input) ? input : {};
      if (typeof payload.key !== 'string') return Promise.reject(deniedError('settings:get'));
      return invoke('settings:get', payload).then((r) => unwrap('settings:get', r)).then((r) => (isPlainObject(r) ? r.value ?? null : null));
    },
    set: (input) => {
      const payload = isPlainObject(input) ? input : {};
      if (typeof payload.key !== 'string') return Promise.reject(deniedError('settings:set'));
      return invoke('settings:set', payload).then((r) => unwrap('settings:set', r));
    },

    /* ---- §2.12 */ 

    setSecret: (input) => {
      const payload = isPlainObject(input) ? input : {};
      if (!isProvider(payload.provider) || typeof payload.apiKey !== 'string') {
        return Promise.reject(deniedError('settings:setSecret'));
      }
      const safe = {
        provider: payload.provider,
        apiKey: payload.apiKey,
        model: typeof payload.model === 'string' ? payload.model : undefined,
        baseUrl: typeof payload.baseUrl === 'string' ? payload.baseUrl : undefined,
      };
      return invoke('settings:setSecret', safe).then((r) => unwrap('settings:setSecret', r));
    },

    /**
     * → `{ hasKey, masked, model }` (+ `error` opsional bila safeStorage tidak
     * tersedia). TIDAK PERNAH memuat `apiKey`; tidak melempar agar UI dapat
     * menampilkan CTA "Atur API Key" (§5.2.1).
     */
    hasSecret: (input) => {
      const payload = isPlainObject(input) ? input : {};
      if (!isProvider(payload.provider)) return Promise.reject(deniedError('settings:hasSecret'));
      return invoke('settings:hasSecret', { provider: payload.provider }).then((r) => {
        if (!isPlainObject(r)) return { hasKey: false, masked: null, model: null };
        return {
          hasKey: r.hasKey === true,
          masked: typeof r.masked === 'string' ? r.masked : null,
          model: typeof r.model === 'string' ? r.model : null,
          ...(isPlainObject(r.error) ? { error: r.error } : {}),
        };
      });
    },

    clearSecret: (input) => {
      const payload = isPlainObject(input) ? input : {};
      if (!isProvider(payload.provider)) return Promise.reject(deniedError('settings:clearSecret'));
      return invoke('settings:clearSecret', { provider: payload.provider }).then((r) => unwrap('settings:clearSecret', r));
    },

    /**
     * → `{ ok, latencyMs, error? }`. `ok:false` BUKAN error IPC (§2.12.4):
     * kegagalan provider dilaporkan di `error`, jadi nilai ini diteruskan apa adanya.
     */
    testProvider: (input) => {
      const payload = isPlainObject(input) ? input : {};
      if (!isProvider(payload.provider)) {
        return Promise.resolve({ ok: false, latencyMs: null, error: { code: 'ERR_PROVIDER_UNSUPPORTED', message: 'Provider tidak dikenal.' } });
      }
      return invoke('settings:testProvider', {
        provider: payload.provider,
        ...(typeof payload.model === 'string' && payload.model ? { model: payload.model } : {}),
      }).then((r) =>
        isPlainObject(r) ? r : { ok: false, latencyMs: null, error: { code: 'ERR_PROVIDER_UNREACHABLE', message: 'Respons tidak dikenal.' } }
      );
    },
  },

  ai: {
    /**
     * SATU-SATUNYA jalur AI. Renderer dilarang `fetch` ke provider.
     * → `{ result, tokens, cacheHit, latencyMs, provider, model, capability, jobType }`;
     * `result` untuk `parse_command|chat|refine` sudah lolos `EditPlanOutputSchema` di MAIN.
     */
    invoke: (input) => {
      const payload = isPlainObject(input) ? input : {};
      if (!isProvider(payload.provider) || !isJobType(payload.jobType) || !isPlainObject(payload.payload)) {
        return Promise.reject(deniedError('ai:invoke'));
      }
      return invoke('ai:invoke', {
        provider: payload.provider,
        jobType: payload.jobType,
        payload: payload.payload,
      }).then((r) => unwrap('ai:invoke', r));
    },
  },

  /** §2.16 [BARU v1.2] — ringkasan token/biaya; tidak pernah memicu jaringan. */
  usage: {
    get: (input) => {
      const payload = isPlainObject(input) ? input : {};
      if (payload.range !== undefined && !USAGE_RANGES.includes(payload.range)) {
        return Promise.reject(validationError('Range usage tidak valid.'));
      }
      return invoke('usage:get', payload).then((r) => unwrap('usage:get', r));
    },
  },

  /** §2.15 [BARU v1.2] — mode privasi & konfirmasi kirim konten ke cloud. */
  privacy: {
    getMode: () => invoke('privacy:getMode').then((r) => unwrap('privacy:getMode', r)),
    setMode: (input) => {
      const payload = isPlainObject(input) ? input : {};
      if (!PRIVACY_MODES.includes(payload.mode)) {
        return Promise.reject(validationError('Mode privasi tidak valid.'));
      }
      return invoke('privacy:setMode', { mode: payload.mode }).then((r) => unwrap('privacy:setMode', r));
    },
    confirmExternal: (input) => {
      const payload = isPlainObject(input) ? input : {};
      if (!isProvider(payload.provider) || !CONFIRM_SCOPES.includes(payload.scope)) {
        return Promise.reject(validationError('Payload privacy:confirmExternal tidak valid.'));
      }
      const safe = { provider: payload.provider, scope: payload.scope };
      if (typeof payload.purpose === 'string') safe.purpose = payload.purpose.slice(0, 280);
      return invoke('privacy:confirmExternal', safe).then((r) => unwrap('privacy:confirmExternal', r));
    },
  },

  /** §2.15.4–§2.15.5 [BARU v1.2] — data lokal. */
  data: {
    wipeLocal: (input) => {
      const payload = isPlainObject(input) ? input : {};
      if (!WIPE_SCOPES.includes(payload.scope) || payload.confirm !== true) {
        return Promise.reject(validationError('Payload data:wipeLocal tidak valid (butuh { scope, confirm: true }).'));
      }
      return invoke('data:wipeLocal', { scope: payload.scope, confirm: true }).then((r) => unwrap('data:wipeLocal', r));
    },
    exportLocal: (input) => {
      const payload = isPlainObject(input) ? input : {};
      const safe = {};
      if (payload.includeSecrets === true) safe.includeSecrets = true;
      return invoke('data:exportLocal', safe).then((r) => unwrap('data:exportLocal', r));
    },
  },
};

/* Objek beku: renderer tidak bisa menambah/menimpa method (§2.11.1). */
function deepFreeze(obj) {
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') deepFreeze(value);
  }
  return Object.freeze(obj);
}

// `contextBridge` menyalin nilai; freeze dilakukan sebelum expose.
deepFreeze(keylox);

contextBridge.exposeInMainWorld('keylox', keylox);

/* ------------------------------------------------------------------ *
 * Alias deprecated: window.api  (§2.11.1 / §2.11.3)
 * ------------------------------------------------------------------ */

const DEPRECATIONS = Object.freeze({
  openFiles: 'window.keylox.dialog.openFiles',
  openFolder: 'window.keylox.dialog.openFolder',
  saveFile: 'window.keylox.dialog.saveFile',
  readDir: 'window.keylox.fs.readDir',
  stat: 'window.keylox.fs.stat',
  openInFolder: 'window.keylox.shell.openPath',
  probe: 'window.keylox.ffmpeg.probe',
  exportVideo: 'window.keylox.ffmpeg.export',
  thumbnail: 'window.keylox.ffmpeg.thumbnail',
  onProgress: 'window.keylox.ffmpeg.onProgress',
  createProjectWithMedia: 'window.keylox.project.createWithMedia',
  settingsGet: 'window.keylox.settings.get',
  settingsSet: 'window.keylox.settings.set',
  setSecret: 'window.keylox.settings.setSecret',
  hasSecret: 'window.keylox.settings.hasSecret',
  clearSecret: 'window.keylox.settings.clearSecret',
  testProvider: 'window.keylox.settings.testProvider',
  aiInvoke: 'window.keylox.ai.invoke',
  // [v1.2]
  openExternal: 'window.keylox.shell.openExternal',
  usageGet: 'window.keylox.usage.get',
  privacyGetMode: 'window.keylox.privacy.getMode',
  privacySetMode: 'window.keylox.privacy.setMode',
  privacyConfirmExternal: 'window.keylox.privacy.confirmExternal',
  wipeLocal: 'window.keylox.data.wipeLocal',
  exportLocal: 'window.keylox.data.exportLocal',
});

const warned = new Set();

/**
 * Forwarder alias: memanggil method `window.keylox.*` yang sama dan menulis SATU
 * log deprecation per method (§2.11.3). Alias TIDAK mengembalikan ERR_DEPRECATED.
 */
function deprecated(name, fn) {
  return (...args) => {
    if (!warned.has(name)) {
      warned.add(name);
      console.warn(`DEPRECATED window.api.${name} → ${DEPRECATIONS[name]}`);
    }
    return fn(...args);
  };
}

const legacyApi = {
  openFiles: deprecated('openFiles', keylox.dialog.openFiles),
  openFolder: deprecated('openFolder', keylox.dialog.openFolder),
  saveFile: deprecated('saveFile', keylox.dialog.saveFile),
  readDir: deprecated('readDir', keylox.fs.readDir),
  stat: deprecated('stat', keylox.fs.stat),
  openInFolder: deprecated('openInFolder', keylox.shell.openPath),
  probe: deprecated('probe', keylox.ffmpeg.probe),
  exportVideo: deprecated('exportVideo', keylox.ffmpeg.export),
  thumbnail: deprecated('thumbnail', keylox.ffmpeg.thumbnail),
  onProgress: deprecated('onProgress', keylox.ffmpeg.onProgress),
  // Aksesori baru lewat alias (dipakai index.html legacy).
  createProjectWithMedia: deprecated('createProjectWithMedia', keylox.project.createWithMedia),
  settingsGet: deprecated('settingsGet', keylox.settings.get),
  settingsSet: deprecated('settingsSet', keylox.settings.set),
  setSecret: deprecated('setSecret', keylox.settings.setSecret),
  hasSecret: deprecated('hasSecret', keylox.settings.hasSecret),
  clearSecret: deprecated('clearSecret', keylox.settings.clearSecret),
  testProvider: deprecated('testProvider', keylox.settings.testProvider),
  aiInvoke: deprecated('aiInvoke', keylox.ai.invoke),
  // [v1.2] aksesori baru lewat alias.
  openExternal: deprecated('openExternal', keylox.shell.openExternal),
  usageGet: deprecated('usageGet', keylox.usage.get),
  privacyGetMode: deprecated('privacyGetMode', keylox.privacy.getMode),
  privacySetMode: deprecated('privacySetMode', keylox.privacy.setMode),
  privacyConfirmExternal: deprecated('privacyConfirmExternal', keylox.privacy.confirmExternal),
  wipeLocal: deprecated('wipeLocal', keylox.data.wipeLocal),
  exportLocal: deprecated('exportLocal', keylox.data.exportLocal),
};

contextBridge.exposeInMainWorld('api', Object.freeze(legacyApi));

/* Sinkronisasi status key antar-window (§2.12.6, opsional, tanpa nilai key). */
ipcRenderer.on('settings:secretChanged', (_event, payload) => {
  if (!payload || typeof payload !== 'object') return;
  window.dispatchEvent(new CustomEvent('keylox:secretChanged', { detail: { provider: payload.provider, hasKey: payload.hasKey === true } }));
});
