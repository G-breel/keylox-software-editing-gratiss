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

const PROVIDERS = Object.freeze(['gemini', 'openai']);
const JOB_TYPES = Object.freeze([
  'parse_command', 'chat', 'refine', 'transcribe', 'scene_detect',
  'ocr', 'metadata', 'thumbnail', 'vision_color', 'tts', 'translate', 'moderation',
]);

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
      return invoke('settings:testProvider', { provider: payload.provider }).then((r) =>
        isPlainObject(r) ? r : { ok: false, latencyMs: null, error: { code: 'ERR_PROVIDER_UNREACHABLE', message: 'Respons tidak dikenal.' } }
      );
    },
  },

  ai: {
    /**
     * SATU-SATUNYA jalur AI. Renderer dilarang `fetch` ke provider.
     * → `{ result, tokens, cacheHit, latencyMs }`; `result` untuk
     * `parse_command|chat|refine` sudah lolos `EditPlanOutputSchema` di MAIN.
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
};

contextBridge.exposeInMainWorld('api', Object.freeze(legacyApi));

/* Sinkronisasi status key antar-window (§2.12.6, opsional, tanpa nilai key). */
ipcRenderer.on('settings:secretChanged', (_event, payload) => {
  if (!payload || typeof payload !== 'object') return;
  window.dispatchEvent(new CustomEvent('keylox:secretChanged', { detail: { provider: payload.provider, hasKey: payload.hasKey === true } }));
});
