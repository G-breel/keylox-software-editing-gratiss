// Mapping dari `Clip` (renderer store) ke bentuk klip yang dimengerti
// `src/main/exportPipeline.js` (ms + filters terstruktur + extraVf).
//
// Fungsi ini murni (tanpa Electron) agar bisa diuji unit di Vitest.
// Kontrak payload: TASKS_FOR_ANTIGRAVITY.md → Task 2.

import type { Clip, FilterState, TransformState } from './types';

export interface ClipMapped {
  path: string;
  inMs: number;
  outMs: number;
  startMs: number;
  speed: number;
  volume: number;
  muted: boolean;
  fadeInMs: number;
  fadeOutMs: number;
  transform: { rotation: number; flipH: boolean; flipV: boolean };
  filters: { brightness: number; contrast: number; saturation: number; hue: number; blur: number; grayscale: boolean; sepia: boolean };
  isImage: boolean;
  hasAudio: boolean;
  extraVf: string;
  extraAf: string;
  transition?: { type: 'crossfade' | 'fadeblack' | 'slide'; durationMs: number } | null;
}

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif']);

export function isImageFile(p: string): boolean {
  const dot = p.lastIndexOf('.');
  const ext = dot >= 0 ? p.slice(dot).toLowerCase() : '';
  return IMAGE_EXTS.has(ext);
}

export function mapClipToPipeline(clip: Clip): ClipMapped {
  const isImage = isImageFile(clip.path) || (clip as { isImage?: boolean }).isImage === true;
  const t: TransformState = clip.transform;
  const f: FilterState = clip.filters;

  const parts: string[] = [];
  if (t.crop && t.crop.w > 0 && t.crop.h > 0) {
    parts.push(`crop=${t.crop.w}:${t.crop.h}:${t.crop.x}:${t.crop.y}`);
  }
  if (t.scale && t.scale.w > 0 && t.scale.h > 0) {
    parts.push(`scale=${t.scale.w}:${t.scale.h}`);
  }
  if (clip.chroma) {
    parts.push(`chromakey=0x00ff00:${clip.chromaSim}:0.1`);
  }
  for (const o of clip.textOverlays || []) {
    parts.push(
      `drawtext=text='${String(o.text).replace(/'/g, "\\'")}':fontsize=${o.size}:fontcolor=${o.color}:x=(w*${o.x}/100-text_w/2):y=(h*${o.y}/100-text_h/2):enable='between(t,${o.start},${o.end})'`
    );
  }
  const extraVf = parts.join(',');

  return {
    path: clip.path,
    inMs: Math.round((clip.start ?? 0) * 1000),
    outMs: Math.round((clip.end ?? 0) * 1000),
    startMs: Math.round((clip.start ?? 0) * 1000),
    speed: typeof clip.speed === 'number' && clip.speed > 0 ? clip.speed : 1,
    volume: clip.muted ? 0 : (typeof clip.volume === 'number' ? clip.volume : 1),
    muted: !!clip.muted,
    fadeInMs: Math.round((clip.fadeIn ?? 0) * 1000),
    fadeOutMs: Math.round((clip.fadeOut ?? 0) * 1000),
    transform: {
      rotation: typeof t.rotate === 'number' ? t.rotate : 0,
      flipH: !!t.flipH,
      flipV: !!t.flipV,
    },
    filters: {
      brightness: (typeof f.brightness === 'number' ? f.brightness : 1) - 1,
      contrast: typeof f.contrast === 'number' ? f.contrast : 1,
      saturation: typeof f.saturation === 'number' ? f.saturation : 1,
      hue: typeof f.hue === 'number' ? f.hue : 0,
      blur: typeof f.blur === 'number' ? f.blur : 0,
      grayscale: !!f.grayscale,
      sepia: !!f.sepia,
    },
    isImage,
    hasAudio: !clip.removeAudio && !isImage,
    extraVf,
    extraAf: '',
    transition: clip.transition ?? null,
  };
}

export function mapClipsToPipeline(clips: Clip[]): ClipMapped[] {
  const arr = Array.isArray(clips) ? clips.slice() : [];
  arr.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  return arr.map(mapClipToPipeline);
}