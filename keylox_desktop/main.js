'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, session, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);

const {
  isPlainString,
  safeResolve,
  safeMediaFile,
  safeDirectory,
  safeOutputPath,
  safeFilter,
  safeNumber,
} = require('./src/main/securityGuards');

/* ------------------------------------------------------------------ *
 * BYOK (api-contract v1.1 §2.12) — rahasia HANYA hidup di main process.
 * Redaksi console dipasang PALING AWAL: sebelum key pertama kali dibaca (§8).
 * ------------------------------------------------------------------ */
const { createLogger, installConsoleRedaction } = require('./src/main/redact');
const { KeyloxError, toErrorShape } = require('./src/main/errors');
const { createSecretStore, defaultSecureFilePath, STORE_VERSION } = require('./src/main/secretStore');
const { createAiClient } = require('./src/main/aiClient');
const { createPrivacyService } = require('./src/main/privacyService');
const { createUsageService } = require('./src/main/usageService');
const { createExternalLinks } = require('./src/main/externalLinks');
const { buildExportPayload, writeExportFile } = require('./src/main/localDataExport');
const { USAGE_RANGES } = require('./src/shared/usage.schema');
const { DataWipeLocalSchema, DataExportLocalSchema } = require('./src/shared/privacy.schema');

installConsoleRedaction(console);
const logger = createLogger(console);

let mainWindow;

/** Test/E2E gate untuk channel seeding `project:createWithMedia` (§2.11.2). */
const TEST_MODE = process.env.NODE_ENV === 'test' || process.env.KEYLOX_E2E === '1';

/* ------------------------------------------------------------------ *
 * Penyimpanan rahasia + klien AI (lazy: butuh app.getPath('userData'))
 * ------------------------------------------------------------------ */

let secretStore = null;
let aiClient = null;
let privacyService = null;
let usageService = null;
let externalLinks = null;

function getSecretStore() {
  if (!secretStore) {
    if (!safeStorage || typeof safeStorage.isEncryptionAvailable !== 'function') {
      throw new KeyloxError(
        'ERR_SECURE_STORAGE_UNAVAILABLE',
        'Penyimpanan aman OS (safeStorage) tidak tersedia — key tidak dapat disimpan.'
      );
    }
    secretStore = createSecretStore({
      safeStorage,
      filePath: defaultSecureFilePath(app),
      logger,
      // localhost dev diizinkan untuk backend/provider lokal (§3.7 butir 3).
      allowLocalhostDev: process.env.NODE_ENV !== 'production',
    });
  }
  return secretStore;
}

/** §2.15 — mode privasi & konfirmasi (persisten lewat `settings.enc` sampai DB ada). */
function getPrivacyService() {
  if (!privacyService) privacyService = createPrivacyService({ store: getSecretStore() });
  return privacyService;
}

/** §2.16 — transparansi token/biaya (in-memory di main sampai `ai_usage_records` ada). */
function getUsageService() {
  if (!usageService) usageService = createUsageService();
  return usageService;
}

/** §2.12.7 — allowlist URL eksternal (https + host `docsUrl` registry). */
function getExternalLinks() {
  if (!externalLinks) {
    externalLinks = createExternalLinks({ openExternal: (url) => shell.openExternal(url) });
  }
  return externalLinks;
}

function getAiClient() {
  if (!aiClient) {
    aiClient = createAiClient({
      getConfig: () => getSecretStore().getRuntimeConfig(),
      logger,
      allowLocalhostDev: process.env.NODE_ENV !== 'production',
      // Gate privasi (§2.15) & pencatat usage (§2.16) aktif di aplikasi nyata.
      privacyService: { assertCanInvoke: (provider, options) => getPrivacyService().assertCanInvoke(provider, options) },
      usageService: { record: (entry) => getUsageService().record(entry) },
    });
  }
  return aiClient;
}

/**
 * Handler channel BYOK: kegagalan dikembalikan sebagai NILAI
 * `{ ok:false, error: ErrorShape }` (bukan throw) supaya `code` tidak hilang saat
 * serialisasi IPC — preload mengubahnya menjadi rejection ber-`.code` (§5.2.1).
 * TIDAK ADA nilai rahasia di dalam error shape.
 */
function secretHandle(channel, fn) {
  handle(channel, async (event, ...args) => {
    try {
      return await fn(event, ...args);
    } catch (error) {
      if (error instanceof KeyloxError) {
        logger.warn(`[ipc] ${channel} gagal code=${error.code}`);
        return { ok: false, error: toErrorShape(error) };
      }
      logger.error(`[ipc] ${channel} gagal tak terduga`, error);
      return {
        ok: false,
        error: {
          code: 'ERR_SYSTEM_UNEXPECTED',
          message: 'Kesalahan internal saat memproses permintaan.',
          retryable: false,
          timestamp: new Date().toISOString(),
        },
      };
    }
  });
}

/* ------------------------------------------------------------------ *
 * SECURITY (Stage 8 hardening — lihat docs/superapp/06-security.md)
 * Semua input dari renderer diperlakukan UNTRUSTED. Guard validasi ada di
 * src/main/securityGuards.js (diuji unit test).
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * Pengerasan proses: hanya frame utama yang boleh memanggil IPC
 * ------------------------------------------------------------------ */

function fromMainFrame(event) {
  return Boolean(
    mainWindow
    && !mainWindow.isDestroyed()
    && event.sender === mainWindow.webContents
    && event.senderFrame === mainWindow.webContents.mainFrame
  );
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!fromMainFrame(event)) {
      throw new Error(`IPC channel '${channel}' ditolak: pengirim tidak dikenal.`);
    }
    return fn(event, ...args);
  });
}

/* ------------------------------------------------------------------ *
 * Pengerasan webContents & window creation
 * ------------------------------------------------------------------ */

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: file:",
  "media-src 'self' blob: file:",
  "font-src 'self' data:",
  // Backend proxy Keylox + dev lokal. Origin backend produksi dapat dikunci
  // dengan KEYLOX_BACKEND_ORIGIN (lihat docs/superapp/06-security.md).
  `connect-src 'self' ${process.env.KEYLOX_BACKEND_ORIGIN || ''} http://localhost:* http://127.0.0.1:* https:`.replace(/\s+/g, ' ').trim(),
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

function installSessionHardening() {
  const defaultSession = session.defaultSession;

  defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP],
        'X-Content-Type-Options': ['nosniff'],
      },
    });
  });

  // Tidak ada permission browser yang dibutuhkan aplikasi saat ini.
  defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  defaultSession.setPermissionCheckHandler(() => false);
}

function hardenWebContents(contents) {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    // Hanya izinkan navigasi internal ke bundle aplikasi sendiri.
    const appUrl = mainWindow ? mainWindow.webContents.getURL() : '';
    const allowedOrigin = appUrl ? appUrl.split('#')[0].split('?')[0] : '';
    if (!url.startsWith('file://') || (allowedOrigin && !url.startsWith(allowedOrigin.split('/').slice(0, -1).join('/')))) {
      event.preventDefault();
    }
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.on('will-redirect', (event) => event.preventDefault());
}

app.on('web-contents-created', (_event, contents) => hardenWebContents(contents));

/* ------------------------------------------------------------------ *
 * Window
 * ------------------------------------------------------------------ */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Keylox — AI Video Editor',
    backgroundColor: '#0d0d0d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,
      enableRemoteModule: false,
      spellcheck: false,
    },
  });
  // Tidak ada anchor target=_blank / window.open yang boleh membuka window baru.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const rendererIndex = path.join(__dirname, 'dist', 'renderer', 'index.html');
  if (fs.existsSync(rendererIndex)) {
    mainWindow.loadFile(rendererIndex);
  } else {
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
  }
  if (process.argv.includes('--dev')) mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  installSessionHardening();
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

/* ------------------------------------------------------------------ *
 * IPC: file system (input renderer = untrusted)
 * ------------------------------------------------------------------ */

handle('dialog:openFiles', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Media', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'mp3', 'wav', 'aac', 'png', 'jpg', 'jpeg', 'gif'] }],
  });
  return r.canceled ? [] : r.filePaths;
});

handle('dialog:openFolder', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

handle('dialog:saveFile', async (_event, defaultName) => {
  // Hanya nama berkas, tanpa komponen path tambahan dari renderer.
  const proposed = isPlainString(defaultName, 255) ? path.basename(defaultName) : 'export.mp4';
  const safeName = /^[A-Za-z0-9._ -]+$/.test(proposed) ? proposed : 'export.mp4';
  const r = await dialog.showSaveDialog(mainWindow, {
    defaultPath: safeName,
    filters: [{ name: 'Video', extensions: ['mp4', 'webm', 'mov'] }],
  });
  return r.canceled ? null : r.filePath;
});

handle('fs:readDir', async (_event, dir) => {
  const resolved = safeDirectory(dir);
  if (!resolved) return [];
  try {
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    return entries
      .filter((e) => !e.isSymbolicLink())
      .map((e) => ({ name: e.name, path: path.join(resolved, e.name), isDir: e.isDirectory() }));
  } catch {
    return [];
  }
});

handle('fs:stat', async (_event, p) => {
  const resolved = safeResolve(p);
  if (!resolved) return null;
  try {
    const s = fs.statSync(resolved);
    return { size: s.size, mtime: s.mtimeMs };
  } catch {
    return null;
  }
});

handle('shell:openPath', async (_event, p) => {
  const resolved = safeResolve(p);
  if (!resolved) return;
  shell.showItemInFolder(resolved);
});

/* ------------------------------------------------------------------ *
 * IPC: FFmpeg
 * ------------------------------------------------------------------ */

handle('ffmpeg:probe', async (_event, filePath) => {
  const resolved = safeMediaFile(filePath);
  if (!resolved) return { error: 'Path media tidak valid atau tidak diizinkan.' };
  return new Promise((resolve) => {
    ffmpeg.ffprobe(resolved, (err, data) => {
      if (err) resolve({ error: err.message });
      else resolve(data);
    });
  });
});

handle('ffmpeg:export', async (event, opts) => {
  const payload = opts && typeof opts === 'object' ? opts : {};
  const input = safeMediaFile(payload.inputPath);
  const output = safeOutputPath(payload.outputPath);
  const vf = safeFilter(payload.vf);
  const af = safeFilter(payload.af);

  if (!input) return { success: false, error: 'Input media tidak valid.' };
  if (!output) return { success: false, error: 'Output path tidak valid.' };
  if (vf === null || af === null) return { success: false, error: 'Filter video/audio ditolak oleh validasi keamanan.' };

  const speed = safeNumber(payload.speed, { min: 0.1, max: 100, fallback: 1 });
  const bitrate = safeNumber(payload.bitrate, { min: 100, max: 200000, fallback: 2000 });
  const trimStart = safeNumber(payload.trimStart, { min: 0, max: 86400, fallback: 0 });
  const trimEnd = safeNumber(payload.trimEnd, { min: 0, max: 86400, fallback: 0 });
  const resolution = payload.resolution === 'original' || /^\d{2,5}$/.test(String(payload.resolution || ''))
    ? payload.resolution
    : 'original';
  const fps = payload.fps === 'original' || /^\d{1,3}$/.test(String(payload.fps || ''))
    ? payload.fps
    : 'original';
  const removeAudio = payload.removeAudio === true;

  let cmd = ffmpeg(input);
  // Jangan pernah biarkan FFmpeg menimpa berkas input.
  if (path.resolve(output) === input) return { success: false, error: 'Output tidak boleh sama dengan input.' };

  return new Promise((resolve) => {
    if (trimStart > 0) cmd = cmd.seekInput(trimStart);
    if (trimEnd > 0) cmd = cmd.duration(Math.max(0, trimEnd - trimStart));
    const filters = [];
    if (vf) filters.push(vf);
    if (speed && speed !== 1) filters.push(`setpts=PTS/${speed}`);
    if (filters.length) cmd = cmd.videoFilters(filters.join(','));
    if (af) cmd = cmd.audioFilters(af);
    if (removeAudio) cmd = cmd.noAudio();
    else cmd = cmd.audioCodec('aac').audioBitrate('128k');
    if (resolution && resolution !== 'original') cmd = cmd.size(`?x${resolution}`);
    if (fps && fps !== 'original') cmd = cmd.fps(+fps);
    cmd = cmd.videoBitrate(bitrate + 'k').format(output.endsWith('.webm') ? 'webm' : 'mp4');
    cmd.on('progress', (p) => {
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('ffmpeg:progress', p.percent || 0);
      }
    })
      .on('end', () => resolve({ success: true, path: output }))
      .on('error', (e) => resolve({ success: false, error: e.message }))
      .save(output);
  });
});

handle('ffmpeg:thumbnail', async (_event, filePath, timeSec) => {
  const input = safeMediaFile(filePath);
  if (!input) return null;
  const at = safeNumber(timeSec, { min: 0, max: 86400, fallback: 0 });
  const out = path.join(app.getPath('temp'), `thumb_${Date.now()}_${path.basename(input).replace(/[^A-Za-z0-9._-]/g, '_')}.jpg`);
  return new Promise((resolve) => {
    ffmpeg(input)
      .screenshots({
        timestamps: [at],
        filename: path.basename(out),
        folder: path.dirname(out),
        size: '320x?',
      })
      .on('end', () => resolve(out))
      .on('error', () => resolve(null));
  });
});

/* ------------------------------------------------------------------ *
 * IPC: BYOK — secret & AI (api-contract v1.1 §2.12)
 *
 * INVERSE RULE: renderer tidak pernah menerima key penuh. Satu-satunya bentuk
 * yang keluar dari main: `hasKey`, `masked`, `model` (§2.12 invarian #1).
 * ------------------------------------------------------------------ */

/** §2.12.1 — simpan key terenkripsi (safeStorage → userData/secure/settings.enc). */
secretHandle('settings:setSecret', async (_event, input) => {
  const payload = input && typeof input === 'object' ? input : {};
  const store = getSecretStore();
  const result = store.setSecret({
    provider: payload.provider,
    apiKey: payload.apiKey,
    model: payload.model,
    baseUrl: payload.baseUrl,
  });
  logger.info(`[byok] secret disimpan provider=${result.provider} model=${result.model}`);

  // Beri tahu window lain bahwa status key berubah (tanpa nilai key).
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('settings:secretChanged', {
      provider: result.provider,
      hasKey: true,
    });
  }
  return result; // { ok, hasKey, masked, model, provider }
});

/** §2.12.2 — `{ hasKey, masked, model }` (TIDAK pernah berisi apiKey). */
secretHandle('settings:hasSecret', async (_event, input) => {
  const payload = input && typeof input === 'object' ? input : {};
  const store = getSecretStore();
  return store.hasSecret(payload.provider);
});

/** §2.12.3 — timpa dengan state kosong (berkas & safeStorage tetap ada). */
secretHandle('settings:clearSecret', async (_event, input) => {
  const payload = input && typeof input === 'object' ? input : {};
  const store = getSecretStore();
  const result = store.clearSecret(payload.provider);
  logger.info(`[byok] secret dihapus provider=${payload.provider}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('settings:secretChanged', { provider: payload.provider, hasKey: false });
  }
  return result;
});

/** §2.12.4 + §2.14 — `settings:testProvider` **v2** (bentuk v1.1 dipertahankan aditif). */
secretHandle('settings:testProvider', async (_event, input) => {
  const payload = input && typeof input === 'object' ? input : {};
  const result = await getAiClient().testProvider({
    provider: payload.provider,
    ...(typeof payload.model === 'string' && payload.model.trim() ? { model: payload.model.trim() } : {}),
  });
  return {
    ok: result.ok === true,
    latencyMs: result.latencyMs ?? null,
    // [v1.2] §2.14 — hasil uji 3 tingkat (aditif; `error` = errors[0] demi kompat v1.1).
    provider: result.provider ?? null,
    model: result.model ?? null,
    capabilities: result.capabilities ?? null,
    verdict: result.verdict ?? null,
    privacy: result.privacy ?? null,
    errors: Array.isArray(result.errors) ? result.errors : [],
    error: result.error || null,
  };
});

/**
 * §2.12.5 — satu-satunya jalur AI.
 * Routing DIRECT/PROXY ditentukan dari Settings di MAIN (§6.4), bukan dari
 * renderer. Output EditPlan divalidasi `EditPlanOutputSchema` sebelum dikembalikan
 * (§3.3 butir 2). Gate kapabilitas (§2.14.3) & privasi (§2.15) dijalankan di
 * `aiClient` SEBELUM request menyentuh jaringan. Key tidak pernah menyeberang ke renderer.
 */
secretHandle('ai:invoke', async (_event, input) => {
  const payload = input && typeof input === 'object' ? input : {};
  const result = await getAiClient().invoke({
    provider: payload.provider,
    jobType: payload.jobType,
    payload: payload.payload,
  });
  return {
    result: result.result,
    tokens: result.tokens,
    cacheHit: result.cacheHit,
    latencyMs: result.latencyMs,
    // [v1.2] aditif: identitas panggilan (untuk usage/UI badge).
    provider: result.provider ?? null,
    model: result.model ?? null,
    capability: result.capability ?? null,
    jobType: result.jobType ?? payload.jobType ?? null,
  };
});

/* ------------------------------------------------------------------ *
 * IPC v1.2: onboarding, usage, privasi & data (§2.12.7, §2.16, §2.15)
 * ------------------------------------------------------------------ */

/** §2.12.7 — buka URL onboarding (hanya https + host allowlist). */
secretHandle('shell:openExternal', async (_event, input) => {
  const url = typeof input === 'string' ? input : (input && typeof input === 'object' ? input.url : undefined);
  return getExternalLinks().open(url); // { ok: true }
});

/** §2.16 — ringkasan penggunaan/biaya; TIDAK pernah menyentuh jaringan. */
secretHandle('usage:get', async (_event, input) => {
  const payload = input && typeof input === 'object' ? input : {};
  if (payload.range !== undefined && !USAGE_RANGES.includes(payload.range)) {
    throw new KeyloxError('ERR_VALIDATION_PAYLOAD', `range harus salah satu: ${USAGE_RANGES.join(', ')}.`);
  }
  return getUsageService().summary({
    range: payload.range,
    provider: typeof payload.provider === 'string' ? payload.provider : undefined,
    model: typeof payload.model === 'string' ? payload.model : undefined,
  });
});

/** §2.15.1 — mode privasi aktif (default `standard`). */
secretHandle('privacy:getMode', async () => ({ mode: getPrivacyService().getMode() }));

/** §2.15.2 — ubah mode; berlaku tanpa restart. */
secretHandle('privacy:setMode', async (_event, input) => {
  const payload = input && typeof input === 'object' ? input : {};
  return getPrivacyService().setMode(payload.mode);
});

/** §2.15.3 — catat konfirmasi kirim konten ke provider (`once`/`session`/`always`). */
secretHandle('privacy:confirmExternal', async (_event, input) => getPrivacyService().confirmExternal(input));

/** §2.15.4 — hapus data lokal (cache/usage/keduanya). Tidak pernah menyentuh key. */
secretHandle('data:wipeLocal', async (_event, input) => {
  const payload = input && typeof input === 'object' ? input : {};
  const parsed = DataWipeLocalSchema.safeParse(payload);
  if (!parsed.success) {
    throw new KeyloxError('ERR_VALIDATION_PAYLOAD', 'Payload data:wipeLocal tidak valid (butuh { scope, confirm: true }).');
  }
  const { scope } = parsed.data;
  const deleted = {};
  let freedBytes = 0;
  if (scope === 'usage' || scope === 'all') {
    const res = getUsageService().wipe();
    deleted.usage = res.deleted;
    freedBytes += res.freedBytes;
  }
  if (scope === 'cache' || scope === 'all') {
    // Cache hasil AI hidup di BACKEND (§3.5) — main tidak menyimpan cache konten.
    deleted.cache = 0;
  }
  logger.info(`[privacy] data:wipeLocal scope=${scope}`);
  return { freedBytes, deleted };
});

/**
 * §2.15.5 — ekspor preferensi + ringkasan usage ke berkas JSON pilihan pengguna.
 * Default TIDAK menyertakan info key; `includeSecrets:true` tetap hanya `masked`.
 */
secretHandle('data:exportLocal', async (_event, input) => {
  const payload = input && typeof input === 'object' ? input : {};
  const parsed = DataExportLocalSchema.safeParse(payload);
  if (!parsed.success) {
    throw new KeyloxError('ERR_VALIDATION_PAYLOAD', 'Payload data:exportLocal tidak valid.');
  }
  const includeSecrets = parsed.data.includeSecrets === true;
  const store = getSecretStore();
  const runtime = store.getRuntimeConfig();
  const choice = await dialog.showSaveDialog(mainWindow, {
    title: 'Export data lokal Keylox',
    defaultPath: `keylox-export-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (choice.canceled || !choice.filePath) return { filePath: null, size: 0, canceled: true };

  const exportPayload = buildExportPayload({
    appVersion: app.getVersion ? app.getVersion() : null,
    settings: {
      schemaVersion: STORE_VERSION,
      provider: runtime.provider,
      model: runtime.model,
      mode: runtime.mode,
      backendBaseUrl: runtime.backendBaseUrl,
      privacyMode: getPrivacyService().getMode(),
    },
    secrets: includeSecrets ? store.listSecrets() : null,
    usage: getUsageService().summary({ range: 'all' }),
  });
  const written = writeExportFile({ filePath: choice.filePath, payload: exportPayload, fsImpl: fs });
  logger.info(`[privacy] data:exportLocal ditulis (size=${written.size})`);
  return written; // { filePath, size }
});

/** §2.7 — preferensi NON-rahasia (rahasia ditolak: ERR_VALIDATION_SECRET_IN_PLAIN_SETTING). */
secretHandle('settings:get', async (_event, input) => {
  const payload = input && typeof input === 'object' ? input : {};
  const store = getSecretStore();
  return store.getPreference(payload.key);
});

secretHandle('settings:set', async (_event, input) => {
  const payload = input && typeof input === 'object' ? input : {};
  const store = getSecretStore();
  return store.setPreference(payload.key, payload.value);
});

/* ------------------------------------------------------------------ *
 * IPC: seeding test/E2E (BUG-04) — AKTIF hanya di mode test (§2.11.2)
 * ------------------------------------------------------------------ */

if (TEST_MODE) {
  handle('project:createWithMedia', async (_event, spec) => {
    const payload = spec && typeof spec === 'object' ? spec : {};
    const mediaCount = safeNumber(payload.mediaCount, { min: 0, max: 5000, fallback: 0 });
    const fixture = isPlainString(payload.fixture, 120) ? payload.fixture : 'default';
    logger.info(`[test] project:createWithMedia mediaCount=${mediaCount} fixture=${fixture}`);
    return {
      id: `test-project-${Date.now()}`,
      name: `E2E ${fixture}`,
      aspectRatio: '16:9',
      width: 1920,
      height: 1080,
      fps: 30,
      mediaCount,
      fixture,
      createdAt: new Date().toISOString(),
    };
  });
}
