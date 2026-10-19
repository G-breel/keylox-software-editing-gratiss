'use strict';

/**
 * Presets Ekspor Kanonik untuk Keylox Desktop (Export Pipeline v1 / U6).
 *
 * Modul data murni (CommonJS) tanpa dependensi eksternal.
 * Menjamin konsistensi konfigurasi resolusi, framerate, bitrate, dan codec
 * untuk berbagai platform target (TikTok, Reels, Shorts, Square, YouTube, dsb).
 */

/**
 * @typedef {Object} ExportPreset
 * @property {string} id
 * @property {string} label
 * @property {number} width
 * @property {number} height
 * @property {number} fps
 * @property {number} crf
 * @property {number} videoBitrateKbps
 * @property {number} audioBitrateKbps
 * @property {'mp4'} container
 * @property {'libx264'} videoCodec
 * @property {'aac'} audioCodec
 */

/**
 * Membekukan object secara rekursif agar tidak bisa dimutasi secara tak sengaja.
 * @template T
 * @param {T} value
 * @returns {T}
 */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) {
      deepFreeze(value[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/**
 * 7 Preset Platform Utama
 * @type {Readonly<Record<string, Readonly<ExportPreset>>>}
 */
const EXPORT_PRESETS = deepFreeze({
  'tiktok-1080x1920': {
    id: 'tiktok-1080x1920',
    label: 'TikTok (9:16, 1080x1920)',
    width: 1080,
    height: 1920,
    fps: 30,
    crf: 23,
    videoBitrateKbps: 8000,
    audioBitrateKbps: 192,
    container: 'mp4',
    videoCodec: 'libx264',
    audioCodec: 'aac',
  },
  'reels-1080x1920': {
    id: 'reels-1080x1920',
    label: 'Instagram Reels (9:16, 1080x1920)',
    width: 1080,
    height: 1920,
    fps: 30,
    crf: 23,
    videoBitrateKbps: 8000,
    audioBitrateKbps: 192,
    container: 'mp4',
    videoCodec: 'libx264',
    audioCodec: 'aac',
  },
  'shorts-1080x1920': {
    id: 'shorts-1080x1920',
    label: 'YouTube Shorts (9:16, 1080x1920)',
    width: 1080,
    height: 1920,
    fps: 30,
    crf: 23,
    videoBitrateKbps: 8000,
    audioBitrateKbps: 192,
    container: 'mp4',
    videoCodec: 'libx264',
    audioCodec: 'aac',
  },
  'square-1080': {
    id: 'square-1080',
    label: 'Square (1:1, 1080x1080)',
    width: 1080,
    height: 1080,
    fps: 30,
    crf: 23,
    videoBitrateKbps: 6000,
    audioBitrateKbps: 192,
    container: 'mp4',
    videoCodec: 'libx264',
    audioCodec: 'aac',
  },
  'youtube-1080p': {
    id: 'youtube-1080p',
    label: 'YouTube 1080p (16:9, 1920x1080)',
    width: 1920,
    height: 1080,
    fps: 30,
    crf: 21,
    videoBitrateKbps: 10000,
    audioBitrateKbps: 320,
    container: 'mp4',
    videoCodec: 'libx264',
    audioCodec: 'aac',
  },
  'youtube-4k': {
    id: 'youtube-4k',
    label: 'YouTube 4K (16:9, 3840x2160)',
    width: 3840,
    height: 2160,
    fps: 60,
    crf: 18,
    videoBitrateKbps: 40000,
    audioBitrateKbps: 320,
    container: 'mp4',
    videoCodec: 'libx264',
    audioCodec: 'aac',
  },
  'custom': {
    id: 'custom',
    label: 'Custom Preset',
    width: 1920,
    height: 1080,
    fps: 30,
    crf: 23,
    videoBitrateKbps: 8000,
    audioBitrateKbps: 192,
    container: 'mp4',
    videoCodec: 'libx264',
    audioCodec: 'aac',
  },
});

const DEFAULT_PRESET_ID = 'youtube-1080p';

/**
 * Mendapatkan preset ekspor berdasarkan ID dengan fallback ke youtube-1080p.
 * @param {string} [id]
 * @returns {Readonly<ExportPreset>}
 */
function getExportPreset(id) {
  if (typeof id === 'string' && Object.prototype.hasOwnProperty.call(EXPORT_PRESETS, id)) {
    return EXPORT_PRESETS[id];
  }
  return EXPORT_PRESETS[DEFAULT_PRESET_ID];
}

/**
 * Mengembalikan daftar semua preset ekspor yang tersedia.
 * @returns {ReadonlyArray<Readonly<ExportPreset>>}
 */
function listExportPresets() {
  return Object.values(EXPORT_PRESETS);
}

module.exports = {
  EXPORT_PRESETS,
  DEFAULT_PRESET_ID,
  getExportPreset,
  listExportPresets,
  deepFreeze,
};
