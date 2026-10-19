'use strict';

/**
 * Format proyek `.keylox` (api-contract.md §4) — ZIP + `manifest.json`.
 *
 * Modul murni Node (+ `fflate`) agar dapat diuji tanpa Electron. Media TIDAK
 * disalin secara default (`mediaMode: 'reference'`): manifest menyimpan path
 * absolut + hash SHA-256 untuk deteksi perubahan/relink.
 *
 * Keamanan (06-security.md §5.4):
 *  - nama entri ZIP divalidasi (zip-slip / absolute / drive-letter / `..`);
 *  - ukuran manifest & total dekompresi dibatasi;
 *  - pola API key di dalam manifest ditolak;
 *  - key tidak pernah ditulis ke proyek, bahkan lewat field `apiKey`.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { zipSync, unzipSync, strToU8, strFromU8 } = require('fflate');
const { KeyloxError } = require('./errors');

const PROJECT_FORMAT = 'keylox.project';
const PROJECT_FORMAT_VERSION = 1;
const MANIFEST_FORMAT_VERSION = '1.0';
const SCHEMA_VERSION = 3;
const PROJECT_EXT = '.keylox';
const AUTOSAVE_FILENAME = 'autosave.keylox';
const RECENT_FILENAME = 'recent-projects.json';
const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 5000;
const MAX_TOTAL_UNCOMPRESSED = 512 * 1024 * 1024;
const RECENT_LIMIT = 10;

const SECRET_PATTERNS = [
  /AIza[0-9A-Za-z_-]{35}/,
  /AQ\.[A-Za-z0-9_-]{25,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];
const SECRET_KEY_NAMES = /^(api[_-]?key|apikey|secret|password|passwd|access[_-]?token|refresh[_-]?token)$/i;

/* ------------------------------------------------------------------ *
 * Path
 * ------------------------------------------------------------------ */

function ensureProjectExtension(p) {
  if (typeof p !== 'string' || !p.trim()) return p;
  return p.toLowerCase().endsWith(PROJECT_EXT) ? p : `${p}${PROJECT_EXT}`;
}

/**
 * Validasi path proyek dari renderer. Hanya absolut, `.keylox`, bukan
 * device/UNC. Penulisan tetap hanya ke path yang dipilih user lewat dialog.
 */
function validateProjectPath(p) {
  if (typeof p !== 'string' || p.length === 0 || p.length > 4096 || p.includes('\0')) {
    throw new KeyloxError('ERR_VALIDATION_PAYLOAD', 'Path proyek tidak valid.');
  }
  if (p.startsWith('\\\\') || p.startsWith('//') || !path.isAbsolute(p)) {
    throw new KeyloxError('ERR_VALIDATION_PAYLOAD', 'Path proyek harus absolut dan bukan UNC/device.');
  }
  if (path.extname(p).toLowerCase() !== PROJECT_EXT) {
    throw new KeyloxError('ERR_VALIDATION_PAYLOAD', 'Berkas proyek harus berekstensi .keylox.');
  }
  return path.normalize(p);
}

function autosavePathFor(userData) {
  return path.join(userData, AUTOSAVE_FILENAME);
}

function recentPathFor(userData) {
  return path.join(userData, RECENT_FILENAME);
}

/* ------------------------------------------------------------------ *
 * Sanitasi & manifest
 * ------------------------------------------------------------------ */

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nonNegative(value, fallback = 0) {
  return Math.max(0, num(value, fallback));
}

function stripSecretKeys(value) {
  if (Array.isArray(value)) return value.map(stripSecretKeys);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (SECRET_KEY_NAMES.test(key)) continue;
    out[key] = stripSecretKeys(val);
  }
  return out;
}

function assertNoSecrets(text) {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      throw new KeyloxError(
        'ERR_VALIDATION_SECRET_IN_PLAIN_SETTING',
        'Proyek mengandung pola rahasia dan tidak dapat disimpan. Hapus data rahasia dari proyek.',
      );
    }
  }
}

function normalizeClip(clip, trackId) {
  if (!clip || typeof clip !== 'object') return null;
  const start = nonNegative(clip.start);
  const end = Math.max(start + 0.1, nonNegative(clip.end));
  const inPoint = nonNegative(clip.in);
  return {
    ...stripSecretKeys(clip),
    id: String(clip.id || ''),
    mediaId: String(clip.mediaId || ''),
    name: String(clip.name || ''),
    path: String(clip.path || ''),
    trackId: String(clip.trackId || trackId || ''),
    start,
    end,
    in: inPoint,
    out: Math.max(inPoint, num(clip.out, inPoint + (end - start))),
    speed: Math.max(0.01, num(clip.speed, 1)),
    volume: nonNegative(clip.volume, 1),
    muted: clip.muted === true,
    filters: clip.filters && typeof clip.filters === 'object' ? { ...clip.filters } : {},
    transform: clip.transform && typeof clip.transform === 'object' ? { ...clip.transform } : {},
    textOverlays: Array.isArray(clip.textOverlays) ? JSON.parse(JSON.stringify(clip.textOverlays)) : [],
    fadeIn: nonNegative(clip.fadeIn),
    fadeOut: nonNegative(clip.fadeOut),
    removeAudio: clip.removeAudio === true,
    chroma: clip.chroma === true,
    chromaSim: nonNegative(clip.chromaSim, 0.3),
  };
}

function normalizeTrack(track) {
  if (!track || typeof track !== 'object') return null;
  const id = String(track.id || '');
  if (!id) return null;
  const type = ['video', 'overlay', 'text', 'audio'].includes(track.type) ? track.type : 'video';
  const clips = (Array.isArray(track.clips) ? track.clips : [])
    .map((clip) => normalizeClip(clip, id))
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
  return {
    id,
    name: String(track.name || id),
    type,
    clips,
    muted: track.muted === true,
    locked: track.locked === true,
    visible: track.visible !== false,
  };
}

function normalizeMedia(media, hashes) {
  if (!Array.isArray(media)) return [];
  return media
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const p = typeof item.path === 'string' ? item.path : '';
      return {
        id: String(item.id || ''),
        name: String(item.name || (p ? path.basename(p) : '')),
        path: p,
        duration: item.duration === undefined ? undefined : nonNegative(item.duration),
        size: item.size === undefined ? undefined : nonNegative(item.size),
        hash: hashes && typeof hashes[p] === 'string' ? hashes[p] : (item.hash || null),
      };
    });
}

function normalizeProject(manifest) {
  const meta = manifest && typeof manifest.project === 'object' && manifest.project ? manifest.project : {};
  const tracks = (Array.isArray(manifest.tracks) ? manifest.tracks : [])
    .map(normalizeTrack)
    .filter(Boolean);
  return {
    name: String(meta.name || 'Untitled'),
    aspectRatio: String(meta.aspectRatio || '16:9'),
    width: Math.max(1, Math.round(num(meta.width, 1920))),
    height: Math.max(1, Math.round(num(meta.height, 1080))),
    fps: Math.max(1, num(meta.fps, 30)),
    playhead: nonNegative(meta.playhead),
    selectedClipId: typeof meta.selectedClipId === 'string' ? meta.selectedClipId : null,
    lastExport: meta.lastExport && typeof meta.lastExport === 'object'
      ? meta.lastExport
      : (manifest.settings && manifest.settings.lastExport && typeof manifest.settings.lastExport === 'object'
        ? manifest.settings.lastExport
        : null),
    tracks,
    media: normalizeMedia(manifest.media),
  };
}

/**
 * Bangun manifest proyek dari snapshot renderer.
 * @param {{project: object, appVersion?: string, platform?: string, now?: string,
 *          projectId?: string, createdAt?: string, mediaHashes?: Record<string,string>,
 *          lastExport?: object|null}} input
 */
function buildManifest(input) {
  const project = stripSecretKeys(JSON.parse(JSON.stringify(input.project || {})));
  const now = input.now || new Date().toISOString();
  const tracks = (Array.isArray(project.tracks) ? project.tracks : [])
    .map((track) => {
      const normalized = normalizeTrack(track);
      if (!normalized) return null;
      return {
        ...normalized,
        clips: (Array.isArray(track.clips) ? track.clips : [])
          .map((clip) => normalizeClip(clip, normalized.id))
          .filter(Boolean),
      };
    })
    .filter(Boolean);
  const manifest = {
    format: PROJECT_FORMAT,
    formatVersion: PROJECT_FORMAT_VERSION,
    manifestVersion: MANIFEST_FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    projectId: input.projectId || crypto.randomUUID(),
    appVersion: input.appVersion ? String(input.appVersion) : null,
    createdAt: input.createdAt || now,
    updatedAt: now,
    mediaMode: 'reference',
    platform: input.platform || process.platform,
    project: {
      name: String(project.name || 'Untitled'),
      aspectRatio: String(project.aspectRatio || '16:9'),
      width: Math.max(1, Math.round(num(project.width, 1920))),
      height: Math.max(1, Math.round(num(project.height, 1080))),
      fps: Math.max(1, num(project.fps, 30)),
      playhead: nonNegative(project.playhead),
      selectedClipId: typeof project.selectedClipId === 'string' ? project.selectedClipId : null,
      lastExport: (input.lastExport !== undefined ? input.lastExport : project.lastExport) || null,
    },
    tracks,
    media: normalizeMedia(project.media, input.mediaHashes || {}),
    settings: {
      lastExport: (input.lastExport !== undefined ? input.lastExport : project.lastExport) || null,
    },
  };
  const text = JSON.stringify(manifest);
  assertNoSecrets(text);
  return manifest;
}

/** Parse teks manifest → `{ manifest, project }` dengan validasi versi. */
function parseManifestText(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new KeyloxError('ERR_VALIDATION_PAYLOAD', 'manifest.json kosong atau tidak valid.');
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_MANIFEST_BYTES) {
    throw new KeyloxError('ERR_VALIDATION_PAYLOAD', 'manifest.json terlalu besar.');
  }
  assertNoSecrets(text);
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    throw new KeyloxError('ERR_VALIDATION_PAYLOAD', 'manifest.json bukan JSON yang valid.');
  }
  if (!manifest || manifest.format !== PROJECT_FORMAT) {
    throw new KeyloxError('ERR_VALIDATION_PAYLOAD', 'Bukan berkas proyek Keylox yang valid.');
  }
  const version = num(manifest.formatVersion, 0);
  if (!Number.isInteger(version) || version < 1) {
    throw new KeyloxError('ERR_VALIDATION_PAYLOAD', 'formatVersion proyek tidak valid.');
  }
  if (version > PROJECT_FORMAT_VERSION) {
    throw new KeyloxError(
      'ERR_VALIDATION_SCHEMA',
      'Versi proyek lebih baru dari aplikasi ini. Perbarui Keylox untuk membukanya.',
    );
  }
  if (!Array.isArray(manifest.tracks)) {
    throw new KeyloxError('ERR_VALIDATION_PAYLOAD', 'Manifest proyek tidak memuat tracks.');
  }
  return { manifest, project: normalizeProject(manifest) };
}

/* ------------------------------------------------------------------ *
 * ZIP
 * ------------------------------------------------------------------ */

function isSafeEntryName(name) {
  if (typeof name !== 'string' || !name || name.includes('\0')) return false;
  if (name.startsWith('/') || name.startsWith('\\')) return false;
  if (/^[A-Za-z]:/.test(name)) return false;
  if (name.includes('\\')) return false;
  const parts = name.split('/').filter((part) => part !== '');
  return parts.every((part) => part !== '.' && part !== '..');
}

function safeBaseName(p) {
  return path.basename(p).replace(/[^A-Za-z0-9._-]/g, '_') || 'media';
}

/**
 * Buat buffer ZIP proyek. Media hanya disalin bila `includeMedia`.
 * @param {object} manifest
 * @param {{includeMedia?: boolean, fsImpl?: object}} [options]
 */
function packProject(manifest, options = {}) {
  const fsImpl = options.fsImpl || fs;
  const manifestCopy = JSON.parse(JSON.stringify(manifest));
  const entries = {};

  if (options.includeMedia) {
    manifestCopy.media = Array.isArray(manifestCopy.media) ? manifestCopy.media : [];
    manifestCopy.mediaMode = 'bundled';
    manifestCopy.media.forEach((item, index) => {
      if (!item || typeof item.path !== 'string' || !item.path) return;
      try {
        if (!fsImpl.existsSync(item.path) || !fsImpl.statSync(item.path).isFile()) return;
        const entry = `media/${String(index).padStart(3, '0')}-${safeBaseName(item.path)}`;
        entries[entry] = new Uint8Array(fsImpl.readFileSync(item.path));
        item.bundledPath = entry;
      } catch {
        /* media tidak terbaca: tetap referensi path */
      }
    });
  }

  entries['manifest.json'] = strToU8(JSON.stringify(manifestCopy, null, 2));
  return Buffer.from(zipSync(entries, { level: 6 }));
}

/**
 * Baca buffer ZIP proyek. Hanya `manifest.json` yang dipakai; entri media
 * (bila ada) tidak diekstrak ke disk.
 */
function readProjectArchive(buffer) {
  if (!buffer || buffer.length === 0) {
    throw new KeyloxError('ERR_VALIDATION_PAYLOAD', 'Berkas proyek kosong.');
  }
  let files;
  try {
    files = unzipSync(buffer, {
      filter(file) {
        if (!isSafeEntryName(file.name)) {
          throw new KeyloxError('ERR_VALIDATION_PAYLOAD', 'Arsip proyek memuat entri berbahaya (zip-slip).');
        }
        if (Number(file.originalSize) > MAX_TOTAL_UNCOMPRESSED) {
          throw new KeyloxError('ERR_VALIDATION_PAYLOAD', 'Arsip proyek terlalu besar.');
        }
        return true;
      },
    });
  } catch (error) {
    if (error instanceof KeyloxError) throw error;
    throw new KeyloxError('ERR_VALIDATION_PAYLOAD', 'Berkas bukan arsip .keylox yang valid.');
  }

  const names = Object.keys(files);
  if (names.length > MAX_ARCHIVE_ENTRIES) {
    throw new KeyloxError('ERR_VALIDATION_PAYLOAD', 'Arsip proyek memuat terlalu banyak entri.');
  }
  const total = names.reduce((sum, name) => sum + files[name].length, 0);
  if (total > MAX_TOTAL_UNCOMPRESSED) {
    throw new KeyloxError('ERR_VALIDATION_PAYLOAD', 'Arsip proyek terlalu besar.');
  }
  const manifestEntry = files['manifest.json'];
  if (!manifestEntry) {
    throw new KeyloxError('ERR_VALIDATION_PAYLOAD', 'Arsip proyek tidak memuat manifest.json.');
  }
  if (manifestEntry.length > MAX_MANIFEST_BYTES) {
    throw new KeyloxError('ERR_VALIDATION_PAYLOAD', 'manifest.json terlalu besar.');
  }
  const parsed = parseManifestText(strFromU8(manifestEntry));
  return { ...parsed, entryNames: names };
}

function readProjectFile(filePath) {
  let buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch {
    throw new KeyloxError('ERR_FS_PERMISSION', 'Berkas proyek tidak dapat dibaca.', {
      details: { reason: 'read_failed' },
    });
  }
  return readProjectArchive(buffer);
}

/** Tulis proyek secara atomik (tulis `.tmp` lalu rename). */
function writeProjectFile(filePath, buffer, fsImpl = fs) {
  const target = validateProjectPath(filePath);
  const tmp = `${target}.tmp`;
  try {
    fsImpl.mkdirSync(path.dirname(target), { recursive: true });
    fsImpl.writeFileSync(tmp, buffer);
    fsImpl.renameSync(tmp, target);
  } catch {
    try { fsImpl.rmSync(tmp, { force: true }); } catch { /* ignore */ }
    throw new KeyloxError('ERR_FS_PERMISSION', 'Berkas proyek tidak dapat ditulis.', {
      details: { reason: 'write_failed' },
    });
  }
  return { filePath: target, size: buffer.length };
}

/* ------------------------------------------------------------------ *
 * Hash & media
 * ------------------------------------------------------------------ */

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function hashFileSync(filePath) {
  try {
    return hashBuffer(fs.readFileSync(filePath));
  } catch {
    return null;
  }
}

/** Hash semua media di snapshot; path tak terbaca tidak dimasukkan. */
function hashProjectMedia(project, fsImpl = fs, hasher = hashFileSync) {
  const hashes = {};
  const media = project && Array.isArray(project.media) ? project.media : [];
  for (const item of media) {
    if (!item || typeof item.path !== 'string' || !item.path) continue;
    try {
      if (!fsImpl.existsSync(item.path)) continue;
      const hash = hasher(item.path);
      if (hash) hashes[item.path] = hash;
    } catch {
      /* lewati */
    }
  }
  return hashes;
}

/**
 * Deteksi media hilang/berubah. `reason`: `missing` atau `hash_mismatch`.
 * @returns {{missing: Array<{id:string,name:string,path:string,reason:string}>}}
 */
function mediaStatus(manifest, options = {}) {
  const fsImpl = options.fsImpl || fs;
  const hasher = options.hasher || hashFileSync;
  const media = manifest && Array.isArray(manifest.media) ? manifest.media : [];
  const missing = [];
  for (const item of media) {
    const p = item && typeof item.path === 'string' ? item.path : '';
    if (!p) {
      missing.push({ id: item.id, name: item.name, path: p, reason: 'missing' });
      continue;
    }
    let exists = false;
    try {
      exists = fsImpl.existsSync(p) && fsImpl.statSync(p).isFile();
    } catch {
      exists = false;
    }
    if (!exists) {
      missing.push({ id: item.id, name: item.name, path: p, reason: 'missing' });
      continue;
    }
    if (item.hash) {
      if (options.verifyHash === false) continue;
      const actual = hasher(p);
      if (actual && actual !== item.hash) {
        missing.push({ id: item.id, name: item.name, path: p, reason: 'hash_mismatch' });
      }
    }
  }
  return { missing };
}

/* ------------------------------------------------------------------ *
 * Recent projects
 * ------------------------------------------------------------------ */

function sanitizeRecent(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && typeof item.filePath === 'string')
    .map((item) => ({
      filePath: item.filePath,
      name: typeof item.name === 'string' ? item.name : path.basename(item.filePath),
      savedAt: typeof item.savedAt === 'string' ? item.savedAt : null,
    }))
    .slice(0, RECENT_LIMIT);
}

function updateRecentList(list, entry, limit = RECENT_LIMIT) {
  const clean = sanitizeRecent(list).filter((item) => item.filePath !== entry.filePath);
  return [
    {
      filePath: entry.filePath,
      name: typeof entry.name === 'string' ? entry.name : path.basename(entry.filePath),
      savedAt: entry.savedAt || new Date().toISOString(),
    },
    ...clean,
  ].slice(0, limit);
}

function readRecent(filePath, fsImpl = fs) {
  try {
    return sanitizeRecent(JSON.parse(fsImpl.readFileSync(filePath, 'utf8')));
  } catch {
    return [];
  }
}

function writeRecent(filePath, list, fsImpl = fs) {
  try {
    fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
    fsImpl.writeFileSync(filePath, JSON.stringify(sanitizeRecent(list), null, 2), 'utf8');
  } catch {
    /* daftar recent bersifat best-effort */
  }
}

module.exports = {
  PROJECT_FORMAT,
  PROJECT_FORMAT_VERSION,
  MANIFEST_FORMAT_VERSION,
  SCHEMA_VERSION,
  PROJECT_EXT,
  AUTOSAVE_FILENAME,
  RECENT_FILENAME,
  RECENT_LIMIT,
  ensureProjectExtension,
  validateProjectPath,
  autosavePathFor,
  recentPathFor,
  isSafeEntryName,
  buildManifest,
  parseManifestText,
  normalizeProject,
  packProject,
  readProjectArchive,
  readProjectFile,
  writeProjectFile,
  hashFileSync,
  hashProjectMedia,
  mediaStatus,
  updateRecentList,
  readRecent,
  writeRecent,
};
