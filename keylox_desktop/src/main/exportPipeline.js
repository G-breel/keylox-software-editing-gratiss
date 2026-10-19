'use strict';

/**
 * Export Pipeline v1 (U6 — Export MP4 Andal).
 *
 * Modul fungsi murni (CommonJS) tanpa dependensi eksternal dan tanpa I/O.
 * Bertanggung jawab menyusun filtergraph dan array argv FFmpeg untuk:
 * - Trim, Speed, Concat, Scale/Pad, Transform (rotate, flip)
 * - Color grading (brightness, contrast, saturation, hue, blur, grayscale, sepia)
 * - Audio processing (atrim, chained atempo, volume, afade, anullsrc)
 *
 * Menjamin keamanan tingkat tinggi: menolak injeksi filter/SSRF dan payload tidak valid.
 */

const { getExportPreset } = require('../shared/exportPresets');

// Token filter berbahaya yang dapat mengekspos file lokal atau SSRF
const DANGEROUS_FILTER_TOKENS = [
  'movie=',
  'amovie=',
  'subtitles=',
  'subtitles',
  'frei0r',
  'lavfi',
  'concat:',
  'http://',
  'https://',
  'file:',
  'data:',
  'textfile=',
  'fontfile=',
  'cachefile=',
];

/**
 * Membuat instance Error dengan kode ERR_VALIDATION_PAYLOAD.
 * @param {string} message
 * @returns {Error & { code: string }}
 */
function createValidationError(message) {
  const err = new Error(message);
  err.code = 'ERR_VALIDATION_PAYLOAD';
  return err;
}

/**
 * Memeriksa apakah sebuah string memuat karakter kontrol atau token filter berbahaya.
 * @param {string} str
 * @returns {boolean}
 */
function containsDangerousTokens(str) {
  if (typeof str !== 'string') return false;
  if (/[\0\r\n]/.test(str)) return true;
  const lower = str.toLowerCase();
  return DANGEROUS_FILTER_TOKENS.some((token) => lower.includes(token));
}

/**
 * Validasi angka finite dalam rentang yang diizinkan.
 * @param {unknown} value
 * @param {string} fieldName
 * @param {number} min
 * @param {number} max
 * @param {number} [fallback]
 * @returns {number}
 */
function validateNumber(value, fieldName, min, max, fallback) {
  if (value === undefined || value === null) {
    if (fallback !== undefined) return fallback;
    throw createValidationError(`Field '${fieldName}' harus diisi.`);
  }
  const n = Number(value);
  if (!Number.isFinite(n) || Number.isNaN(n)) {
    throw createValidationError(`Field '${fieldName}' bernilai bukan angka yang valid: ${value}`);
  }
  if (n < min || n > max) {
    throw createValidationError(`Field '${fieldName}' berada di luar batas (${min} - ${max}): ${n}`);
  }
  return n;
}

/**
 * Menghitung rantai filter `atempo` untuk nilai speed di luar rentang 0.5 - 2.0.
 * FFmpeg membatasi atempo antara 0.5 dan 2.0.
 * @param {number} speed
 * @returns {string[]}
 */
function buildAtempoFilters(speed) {
  if (speed === 1) return [];
  const filters = [];
  let s = speed;

  while (s < 0.5) {
    filters.push('atempo=0.5');
    s /= 0.5;
  }
  while (s > 2.0) {
    filters.push('atempo=2.0');
    s /= 2.0;
  }

  if (Math.abs(s - 1.0) > 0.001) {
    // Format angka tanpa eksponensial dan presisi wajar
    const rounded = Number(s.toFixed(4));
    filters.push(`atempo=${rounded}`);
  }
  return filters;
}

/**
 * Format detik dari milidetik.
 * @param {number} ms
 * @returns {string}
 */
function msToSec(ms) {
  const sec = ms / 1000;
  return Number(sec.toFixed(4)).toString();
}

/**
 * Validasi payload ekspor input.
 * @param {any} input
 */
function validateExportInput(input) {
  if (!input || typeof input !== 'object') {
    throw createValidationError('Payload ekspor tidak valid atau kosong.');
  }

  if (!Array.isArray(input.clips) || input.clips.length === 0) {
    throw createValidationError("Daftar 'clips' tidak boleh kosong.");
  }

  if (!input.outputPath || typeof input.outputPath !== 'string') {
    throw createValidationError("Field 'outputPath' wajib diisi berupa string path.");
  }

  if (/[\0\r\n]/.test(input.outputPath)) {
    throw createValidationError("Field 'outputPath' memuat karakter kontrol terlarang.");
  }

  if (!/\.mp4$/i.test(input.outputPath)) {
    throw createValidationError("Ekstensi 'outputPath' harus berakhiran .mp4.");
  }

  if (containsDangerousTokens(input.outputPath)) {
    throw createValidationError("Field 'outputPath' memuat token berbahaya.");
  }

  // Validasi setiap clip
  for (let i = 0; i < input.clips.length; i++) {
    const clip = input.clips[i];
    if (!clip || typeof clip !== 'object') {
      throw createValidationError(`Klip #${i + 1} tidak valid.`);
    }

    if (!clip.path || typeof clip.path !== 'string') {
      throw createValidationError(`Klip #${i + 1} tidak memiliki path yang valid.`);
    }

    if (containsDangerousTokens(clip.path)) {
      throw createValidationError(`Klip #${i + 1} memuat path atau token berbahaya.`);
    }

    if (clip.speed !== undefined && clip.speed !== null) {
      validateNumber(clip.speed, `clips[${i}].speed`, 0.01, 100);
    }

    if (clip.volume !== undefined && clip.volume !== null) {
      validateNumber(clip.volume, `clips[${i}].volume`, 0, 10);
    }

    if (clip.inMs !== undefined && clip.inMs !== null) {
      validateNumber(clip.inMs, `clips[${i}].inMs`, 0, 86_400_000);
    }

    if (clip.outMs !== undefined && clip.outMs !== null) {
      validateNumber(clip.outMs, `clips[${i}].outMs`, 0, 86_400_000);
    }

    if (clip.startMs !== undefined && clip.startMs !== null) {
      validateNumber(clip.startMs, `clips[${i}].startMs`, 0, 86_400_000);
    }

    if (clip.fadeInMs !== undefined && clip.fadeInMs !== null) {
      validateNumber(clip.fadeInMs, `clips[${i}].fadeInMs`, 0, 60_000);
    }

    if (clip.fadeOutMs !== undefined && clip.fadeOutMs !== null) {
      validateNumber(clip.fadeOutMs, `clips[${i}].fadeOutMs`, 0, 60_000);
    }

    // Validasi filters jika ada
    if (clip.filters && typeof clip.filters === 'object') {
      for (const [key, val] of Object.entries(clip.filters)) {
        if (typeof val === 'string' && containsDangerousTokens(val)) {
          throw createValidationError(`Filter '${key}' pada klip #${i + 1} memuat token berbahaya.`);
        }
        if (typeof val === 'number') {
          validateNumber(val, `clips[${i}].filters.${key}`, -1000, 1000);
        }
      }
    }

    // Validasi transform jika ada
    if (clip.transform && typeof clip.transform === 'object') {
      for (const [key, val] of Object.entries(clip.transform)) {
        if (typeof val === 'number') {
          validateNumber(val, `clips[${i}].transform.${key}`, -360, 360);
        }
      }
    }
  }

  // Validasi preset jika disediakan
  if (input.preset && typeof input.preset === 'object') {
    if (input.preset.width !== undefined) {
      validateNumber(input.preset.width, 'preset.width', 16, 7680);
    }
    if (input.preset.height !== undefined) {
      validateNumber(input.preset.height, 'preset.height', 16, 4320);
    }
    if (input.preset.fps !== undefined) {
      validateNumber(input.preset.fps, 'preset.fps', 1, 240);
    }
    if (input.preset.crf !== undefined) {
      validateNumber(input.preset.crf, 'preset.crf', 0, 51);
    }
  }
}

/**
 * Menyusun rencana ekspor video (filtergraph, durasi total, warning, dan argumen argv).
 * @param {Object} input
 * @returns {{ args: string[], filterGraph: string, durationMs: number, warnings: string[] }}
 */
function buildExportPlan(input) {
  validateExportInput(input);

  const warnings = [];
  const preset = Object.assign({}, getExportPreset(), input.preset || {});
  const width = preset.width;
  const height = preset.height;
  const fps = preset.fps;
  const globalHasAudio = input.hasAudio !== false;

  const numClips = input.clips.length;
  let totalDurationMs = 0;

  const videoFilterChains = [];
  const audioFilterChains = [];

  for (let i = 0; i < numClips; i++) {
    const clip = input.clips[i];
    const speed = typeof clip.speed === 'number' && clip.speed > 0 ? clip.speed : 1;
    const inMs = typeof clip.inMs === 'number' && clip.inMs >= 0 ? clip.inMs : 0;
    const outMs = typeof clip.outMs === 'number' && clip.outMs > inMs ? clip.outMs : null;

    // Evaluasi peringatan
    if (clip.isImage) {
      warnings.push(`Klip #${i + 1} adalah gambar statis.`);
    }
    if (speed < 0.2 || speed > 5.0) {
      warnings.push(`Klip #${i + 1} memiliki playback speed tidak lazim (${speed}x).`);
    }

    // Hitung durasi klip
    let rawDurationMs;
    if (outMs !== null) {
      rawDurationMs = outMs - inMs;
    } else if (clip.durationMs && typeof clip.durationMs === 'number') {
      rawDurationMs = clip.durationMs;
    } else {
      rawDurationMs = clip.isImage ? 5000 : 10000; // default fallback 5s image, 10s video
    }
    const effectiveClipDurationMs = rawDurationMs / speed;
    totalDurationMs += effectiveClipDurationMs;

    // 1. FILTER VIDEO
    const vFilters = [];

    // Trim video
    if (inMs > 0 && outMs !== null) {
      vFilters.push(`trim=start=${msToSec(inMs)}:end=${msToSec(outMs)}`);
    } else if (inMs > 0) {
      vFilters.push(`trim=start=${msToSec(inMs)}`);
    } else if (outMs !== null) {
      vFilters.push(`trim=start=0:end=${msToSec(outMs)}`);
    }

    // Speed video / PTS
    if (speed !== 1) {
      vFilters.push(`setpts=(PTS-STARTPTS)/${speed}`);
    } else if (vFilters.length > 0) {
      // Jika ada trim dan speed 1, reset PTS
      vFilters.push('setpts=PTS-STARTPTS');
    }

    // Transform (flip, rotate)
    const transform = clip.transform || {};
    if (transform.flipH) {
      vFilters.push('hflip');
    }
    if (transform.flipV) {
      vFilters.push('vflip');
    }
    if (typeof transform.rotation === 'number' && transform.rotation !== 0) {
      vFilters.push(`rotate=${transform.rotation}`);
    }

    // Filter warna & efek
    const filters = clip.filters || {};
    const eqParts = [];
    if (filters.brightness !== undefined && filters.brightness !== 0) {
      eqParts.push(`brightness=${filters.brightness}`);
    }
    if (filters.contrast !== undefined && filters.contrast !== 1) {
      eqParts.push(`contrast=${filters.contrast}`);
    }
    if (filters.saturation !== undefined && filters.saturation !== 1) {
      eqParts.push(`saturation=${filters.saturation}`);
    }
    if (eqParts.length > 0) {
      vFilters.push(`eq=${eqParts.join(':')}`);
    }

    if (filters.hue !== undefined && filters.hue !== 0) {
      vFilters.push(`hue=h=${filters.hue}`);
    }

    if (filters.blur !== undefined && filters.blur > 0) {
      vFilters.push(`gblur=sigma=${filters.blur}`);
    }

    if (filters.grayscale) {
      vFilters.push('format=gray');
    }

    if (filters.sepia) {
      vFilters.push('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131');
    }

    // Scale dan pad ke preset target
    vFilters.push(
      `scale=w=${width}:h=${height}:force_original_aspect_ratio=decrease`,
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
      'setsar=1',
      `fps=${fps}`
    );

    // 2. FILTER AUDIO
    const aFilters = [];
    const clipHasNoAudio = !globalHasAudio || clip.hasAudio === false || clip.isImage;

    if (clipHasNoAudio) {
      warnings.push(`Klip #${i + 1} tidak memiliki audio atau audio dinonaktifkan; menggunakan anullsrc.`);
      // Buat stream audio hening sesuai durasi klip
      const durationSec = msToSec(effectiveClipDurationMs);
      const audioChain = `anullsrc=channel_layout=stereo:sample_rate=44100,atrim=end=${durationSec},asetpts=PTS-STARTPTS`;
      audioFilterChains.push({
        isSource: true,
        filter: audioChain,
      });
    } else {
      // Trim audio
      if (inMs > 0 && outMs !== null) {
        aFilters.push(`atrim=start=${msToSec(inMs)}:end=${msToSec(outMs)}`);
      } else if (inMs > 0) {
        aFilters.push(`atrim=start=${msToSec(inMs)}`);
      } else if (outMs !== null) {
        aFilters.push(`atrim=start=0:end=${msToSec(outMs)}`);
      }

      // Reset audio PTS
      if (aFilters.length > 0) {
        aFilters.push('asetpts=PTS-STARTPTS');
      }

      // Speed audio via atempo chaining
      if (speed !== 1) {
        const atempoFilters = buildAtempoFilters(speed);
        for (const f of atempoFilters) {
          aFilters.push(f);
        }
      }

      // Volume & Mute
      if (clip.muted || clip.volume === 0) {
        aFilters.push('volume=0');
      } else if (typeof clip.volume === 'number' && clip.volume !== 1) {
        aFilters.push(`volume=${clip.volume}`);
      }

      // Fade In / Out
      if (clip.fadeInMs && clip.fadeInMs > 0) {
        aFilters.push(`afade=t=in:st=0:d=${msToSec(clip.fadeInMs)}`);
      }
      if (clip.fadeOutMs && clip.fadeOutMs > 0) {
        const clipSec = effectiveClipDurationMs / 1000;
        const fadeOutSec = clip.fadeOutMs / 1000;
        const fadeOutStart = Math.max(0, clipSec - fadeOutSec);
        aFilters.push(`afade=t=out:st=${Number(fadeOutStart.toFixed(4))}:d=${msToSec(clip.fadeOutMs)}`);
      }

      audioFilterChains.push({
        isSource: false,
        filter: aFilters.length > 0 ? aFilters.join(',') : null,
      });
    }

    videoFilterChains.push(vFilters.join(','));
  }

  // Susun filtergraph
  const graphParts = [];

  if (numClips === 1) {
    // Fast path 1 clip tanpa concat
    const vChain = `[0:v]${videoFilterChains[0]}[v]`;
    graphParts.push(vChain);

    const aChainInfo = audioFilterChains[0];
    if (aChainInfo.isSource) {
      graphParts.push(`${aChainInfo.filter}[a]`);
    } else if (aChainInfo.filter) {
      graphParts.push(`[0:a]${aChainInfo.filter}[a]`);
    } else {
      graphParts.push('[0:a]anull[a]');
    }
  } else {
    // Multi-clip: buat label per klip lalu concat
    const concatInputs = [];

    for (let i = 0; i < numClips; i++) {
      graphParts.push(`[${i}:v]${videoFilterChains[i]}[v${i}]`);

      const aChainInfo = audioFilterChains[i];
      if (aChainInfo.isSource) {
        graphParts.push(`${aChainInfo.filter}[a${i}]`);
      } else if (aChainInfo.filter) {
        graphParts.push(`[${i}:a]${aChainInfo.filter}[a${i}]`);
      } else {
        graphParts.push(`[${i}:a]anull[a${i}]`);
      }

      concatInputs.push(`[v${i}][a${i}]`);
    }

    graphParts.push(`${concatInputs.join('')}concat=n=${numClips}:v=1:a=1[v][a]`);
  }

  const filterGraph = graphParts.join(';');

  const plan = {
    filterGraph,
    durationMs: Math.round(totalDurationMs),
    warnings,
    preset,
  };

  const args = buildExportArgs(plan, input);
  plan.args = args;

  return plan;
}

/**
 * Menyusun array argv lengkap untuk pemanggilan FFmpeg secara aman.
 * @param {Object} plan
 * @param {Object} input
 * @returns {string[]}
 */
function buildExportArgs(plan, input) {
  const preset = plan.preset || getExportPreset();
  const args = ['-y'];

  // Tambahkan input per clip
  for (let i = 0; i < input.clips.length; i++) {
    const clip = input.clips[i];
    if (clip.isImage) {
      args.push('-loop', '1');
    }
    args.push('-i', clip.path);
  }

  // Filter complex
  args.push('-filter_complex', plan.filterGraph);

  // Mapping stream output
  args.push('-map', '[v]', '-map', '[a]');

  // Video Codec & Encoding parameters
  args.push('-c:v', preset.videoCodec || 'libx264');
  args.push('-crf', String(preset.crf !== undefined ? preset.crf : 23));
  args.push('-preset', 'medium');
  args.push('-r', String(preset.fps || 30));

  // Audio Codec & Bitrate
  args.push('-c:a', preset.audioCodec || 'aac');
  args.push('-b:a', `${preset.audioBitrateKbps || 192}k`);

  // MP4 streaming optimization
  args.push('-movflags', '+faststart');

  // Output destination
  args.push(input.outputPath);

  return args;
}

module.exports = {
  buildExportPlan,
  buildExportArgs,
  buildAtempoFilters,
  validateExportInput,
  createValidationError,
  DANGEROUS_FILTER_TOKENS,
};
