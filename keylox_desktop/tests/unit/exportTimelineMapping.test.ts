import { describe, it, expect } from 'vitest';
import { mapClipToPipeline, mapClipsToPipeline, isImageFile } from '../../src/renderer/lib/exportMapping';
import type { Clip } from '../../src/renderer/lib/types';

function baseClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'c1',
    mediaId: 'm1',
    name: 'clip',
    path: 'C:/media/a.mp4',
    trackId: 'v1',
    start: 0,
    end: 5,
    speed: 1,
    volume: 1,
    muted: false,
    filters: { brightness: 1, contrast: 1, saturation: 1, hue: 0, blur: 0, sharpen: 0, grayscale: false, sepia: false },
    transform: { rotate: 0, flipH: false, flipV: false, crop: null, scale: null, reverse: false },
    textOverlays: [],
    fadeIn: 0,
    fadeOut: 0,
    removeAudio: false,
    chroma: false,
    chromaSim: 0.3,
    ...overrides,
  } as Clip;
}

describe('exportMapping — isImageFile', () => {
  it('deteksi ekstensi gambar', () => {
    expect(isImageFile('a.PNG')).toBe(true);
    expect(isImageFile('a.jpg')).toBe(true);
    expect(isImageFile('a.mp4')).toBe(false);
  });
});

describe('exportMapping — mapClipToPipeline', () => {
  it('mapping 1 clip benar (inMs/outMs, brightness offset, volume muted=0)', () => {
    const clip = baseClip({ muted: true, filters: { brightness: 1.5, contrast: 1, saturation: 1, hue: 0, blur: 0, sharpen: 0, grayscale: false, sepia: false } });
    const m = mapClipToPipeline(clip);
    expect(m.inMs).toBe(0);
    expect(m.outMs).toBe(5000);
    expect(m.volume).toBe(0);
    expect(m.muted).toBe(true);
    expect(m.filters.brightness).toBeCloseTo(0.5);
    expect(m.hasAudio).toBe(true);
  });

  it('mapping textOverlay → extraVf drawtext', () => {
    const clip = baseClip({ textOverlays: [{ id: 't1', text: 'hi', start: 0, end: 2, size: 24, color: '#fff', x: 50, y: 50 }] });
    const m = mapClipToPipeline(clip);
    expect(m.extraVf).toContain('drawtext=text=');
  });

  it('mapping crop → extraVf', () => {
    const clip = baseClip({ transform: { rotate: 0, flipH: false, flipV: false, crop: { x: 10, y: 20, w: 100, h: 50 }, scale: null, reverse: false } });
    const m = mapClipToPipeline(clip);
    expect(m.extraVf).toContain('crop=100:50:10:20');
  });

  it('mapping isImage deteksi ekstensi', () => {
    const clip = baseClip({ path: 'C:/media/pic.PNG' });
    const m = mapClipToPipeline(clip);
    expect(m.isImage).toBe(true);
    expect(m.hasAudio).toBe(false);
  });

  it('mapping multi-clip urut by start', () => {
    const c1 = baseClip({ id: 'c1', start: 5, end: 10, path: 'C:/media/b.mp4' });
    const c2 = baseClip({ id: 'c2', start: 0, end: 5, path: 'C:/media/a.mp4' });
    const mapped = mapClipsToPipeline([c1, c2]);
    expect(mapped[0].path).toBe('C:/media/a.mp4');
    expect(mapped[1].path).toBe('C:/media/b.mp4');
  });

  it('mapping speed & fade', () => {
    const clip = baseClip({ speed: 2, fadeIn: 0.5, fadeOut: 0.3 });
    const m = mapClipToPipeline(clip);
    expect(m.speed).toBe(2);
    expect(m.fadeInMs).toBe(500);
    expect(m.fadeOutMs).toBe(300);
  });
});

describe('exportPipeline throw via empty clips (sanity)', () => {
  it('clips kosong → pipeline throw', () => {
    const { buildExportPlan } = require('../../src/main/exportPipeline');
    expect(() => buildExportPlan({ clips: [], outputPath: 'x.mp4' })).toThrow();
  });
});