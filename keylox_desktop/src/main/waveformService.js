'use strict';

/**
 * Waveform peaks generator (M2-B, DoU U5).
 *
 * Memakai FFmpeg yang sudah terbundel (@ffmpeg-installer/ffmpeg + fluent-ffmpeg)
 * untuk mendekode audio ke PCM mono 8000 Hz s16le di memori (tanpa file temp,
 * tanpa menulis ke folder proyek). Hasil: array peaks ternormalisasi 0..1 +
 * durasi + sample rate. Di-cache di memori dengan kunci path+size+mtime.
 *
 * Tidak ada I/O ke disk selain membaca file input. Tidak ada shell string.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const SAMPLE_RATE = 8000;
const SAMPLES_PER_PEAK = 400; // ~50 ms per peak
const MAX_PEAKS = 4000;
const CACHE_MAX = 200;
const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

const ALLOWED_EXT = new Set([
  '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.opus',
  '.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v',
]);

const cache = new Map(); // key -> { peaks, durationMs, sampleRate }

function validatePath(filePath) {
  if (typeof filePath !== 'string' || filePath.trim() === '') return null;
  const resolved = path.resolve(filePath.trim());
  if (/[\r\n\0]/.test(resolved)) return null;
  let stat;
  try { stat = fs.statSync(resolved); } catch (e) { return null; }
  if (!stat.isFile()) return null;
  if (stat.size <= 0 || stat.size > MAX_FILE_BYTES) return null;
  const ext = path.extname(resolved).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return null;
  return { resolved, stat };
}

function cacheKey(info) {
  return `${info.resolved}|${info.stat.size}|${info.stat.mtimeMs}`;
}

function extractPcm(info) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let settled = false;
    const cmd = ffmpeg(info.resolved)
      .noVideo()
      .audioChannels(1)
      .audioFrequency(SAMPLE_RATE)
      .format('s16le')
      .on('error', (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      });
    const stream = cmd.pipe();
    stream.on('data', (chunk) => { chunks.push(chunk); });
    stream.on('end', () => {
      if (settled) return;
      settled = true;
      try { resolve(Buffer.concat(chunks)); }
      catch (e) { reject(e); }
    });
    stream.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

function computePeaks(pcm) {
  const totalSamples = Math.floor(pcm.length / 2);
  const peaks = [];
  for (let i = 0; i < totalSamples && peaks.length < MAX_PEAKS; i += SAMPLES_PER_PEAK) {
    let max = 0;
    const end = Math.min(i + SAMPLES_PER_PEAK, totalSamples);
    for (let j = i; j < end; j++) {
      const v = pcm.readInt16LE(j * 2);
      const a = v < 0 ? -v : v;
      if (a > max) max = a;
    }
    peaks.push(Number((max / 32768).toFixed(4)));
  }
  const durationMs = Math.round((totalSamples / SAMPLE_RATE) * 1000);
  return { peaks, durationMs, sampleRate: SAMPLE_RATE };
}

async function generateWaveform(filePath) {
  const info = validatePath(filePath);
  if (!info) {
    const err = new Error('Path media tidak valid, tidak ditemukan, atau tidak didukung.');
    err.code = 'ERR_MEDIA_UNREADABLE';
    throw err;
  }
  const key = cacheKey(info);
  const cached = cache.get(key);
  if (cached) return cached;

  let pcm;
  try {
    pcm = await extractPcm(info);
  } catch (e) {
    const err = new Error('Gagal membaca audio: ' + (e && e.message ? e.message : String(e)));
    err.code = 'ERR_MEDIA_UNREADABLE';
    throw err;
  }
  if (!pcm || pcm.length < 2) {
    const err = new Error('File tidak berisi audio yang dapat dibaca.');
    err.code = 'ERR_MEDIA_UNREADABLE';
    throw err;
  }
  const result = computePeaks(pcm);

  if (cache.size >= CACHE_MAX) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, result);
  return result;
}

function clearCache() { cache.clear(); }
function cacheSize() { return cache.size; }

module.exports = {
  generateWaveform,
  clearCache,
  cacheSize,
  validatePath,
  computePeaks,
  SAMPLE_RATE,
  SAMPLES_PER_PEAK,
  MAX_FILE_BYTES,
  MAX_PEAKS,
};