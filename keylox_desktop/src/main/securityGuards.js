'use strict';

/**
 * Guard validasi input untuk IPC main process (Stage 8).
 * Modul murni Node (tanpa dependensi Electron) agar dapat diuji unit-test.
 * Semua input dari renderer diperlakukan sebagai UNTRUSTED.
 */

const path = require('path');
const fs = require('fs');

const MEDIA_EXT = new Set([
  '.mp4', '.mov', '.mkv', '.avi', '.webm',
  '.mp3', '.wav', '.aac',
  '.png', '.jpg', '.jpeg', '.gif',
]);
const CONTAINER_EXT = new Set(['.mp4', '.webm', '.mov']);
const MAX_PATH_LEN = 4096;
const MAX_FILTER_LEN = 4096;

// Lokasi penyimpanan kredensial yang tidak boleh diakses lewat IPC fs:*
// (defense-in-depth: membatasi blast radius bila renderer dikompromikan).
const DENY_PATH_SEGMENTS = [
  `${path.sep}.ssh${path.sep}`,
  `${path.sep}.aws${path.sep}`,
  `${path.sep}.gnupg${path.sep}`,
  `${path.sep}.docker${path.sep}`,
  `${path.sep}.kube${path.sep}`,
  `${path.sep}.config${path.sep}gcloud${path.sep}`,
  `${path.sep}appdata${path.sep}roaming${path.sep}microsoft${path.sep}credentials${path.sep}`,
  `${path.sep}appdata${path.sep}roaming${path.sep}microsoft${path.sep}protect${path.sep}`,
];

// Token filter FFmpeg yang dapat membaca berkas/URL eksternal
// (filter injection → local file disclosure / SSRF via filter graph).
const DANGEROUS_FILTER_TOKENS = [
  'movie=', 'amovie=', 'textfile=', 'subtitles=', 'fontfile=', 'file=',
  'http:', 'https:', 'ftp:', 'file:', 'concat:', 'cachefile=',
];

function isPlainString(v, max = MAX_PATH_LEN) {
  return typeof v === 'string' && v.length > 0 && v.length <= max && !v.includes('\0');
}

function looksLikeDevicePath(p) {
  // \\?\C:\..., \\.\PIPE\..., UNC \\server\share, serta pseudo-fs POSIX
  return p.startsWith('\\\\') || p.startsWith('//') || p.startsWith('/dev/') || p.startsWith('/proc/');
}

function isDeniedPath(resolved) {
  const lower = resolved.toLowerCase() + path.sep;
  return DENY_PATH_SEGMENTS.some((seg) => lower.includes(seg.toLowerCase()));
}

/** Path umum: string, absolut, bukan device/UNC, bukan lokasi kredensial. */
function safeResolve(p) {
  if (!isPlainString(p)) return null;
  if (looksLikeDevicePath(p)) return null;
  if (!path.isAbsolute(p)) return null;
  let resolved;
  try {
    resolved = fs.realpathSync(p);
  } catch {
    return null;
  }
  if (isDeniedPath(resolved)) return null;
  return resolved;
}

/** Harus menunjuk berkas media dengan ekstensi di allowlist. */
function safeMediaFile(p) {
  const resolved = safeResolve(p);
  if (!resolved) return null;
  if (!MEDIA_EXT.has(path.extname(resolved).toLowerCase())) return null;
  try {
    if (!fs.statSync(resolved).isFile()) return null;
  } catch {
    return null;
  }
  return resolved;
}

/** Harus direktori valid untuk enumerasi. */
function safeDirectory(p) {
  const resolved = safeResolve(p);
  if (!resolved) return null;
  try {
    if (!fs.statSync(resolved).isDirectory()) return null;
  } catch {
    return null;
  }
  return resolved;
}

/** Output export: absolut, ekstensi container diizinkan, direktori induk ada. */
function safeOutputPath(p) {
  if (!isPlainString(p)) return null;
  if (looksLikeDevicePath(p)) return null;
  if (!path.isAbsolute(p)) return null;
  if (!CONTAINER_EXT.has(path.extname(p).toLowerCase())) return null;
  let resolved;
  try {
    resolved = path.resolve(p);
    if (!fs.statSync(path.dirname(resolved)).isDirectory()) return null;
  } catch {
    return null;
  }
  if (isDeniedPath(resolved)) return null;
  return resolved;
}

/** Filter FFmpeg: tolak karakter kontrol & filter pembaca berkas/URL. */
function safeFilter(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > MAX_FILTER_LEN) return null;
  if (/[\0\r\n]/.test(value)) return null;
  const lower = value.toLowerCase();
  for (const token of DANGEROUS_FILTER_TOKENS) {
    if (lower.includes(token)) return null;
  }
  return value;
}

function safeNumber(value, { min, max, fallback }) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < min || n > max) return fallback;
  return n;
}

module.exports = {
  MEDIA_EXT,
  CONTAINER_EXT,
  MAX_PATH_LEN,
  MAX_FILTER_LEN,
  DENY_PATH_SEGMENTS,
  DANGEROUS_FILTER_TOKENS,
  isPlainString,
  looksLikeDevicePath,
  isDeniedPath,
  safeResolve,
  safeMediaFile,
  safeDirectory,
  safeOutputPath,
  safeFilter,
  safeNumber,
};
