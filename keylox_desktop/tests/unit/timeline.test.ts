import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildRulerTicks,
  chooseTickStep,
  clipSourceTime,
  activeClipAt,
  duplicateClipAtEnd,
  formatRulerTime,
  moveClipStart,
  snapRange,
  splitClipAt,
  trimClip,
  trackAcceptsClip,
  MIN_CLIP_SEC,
} from '../../src/renderer/lib/timeline';
import { useEditorStore } from '../../src/renderer/stores/editorStore';
import type { Clip, Track } from '../../src/renderer/lib/types';

function makeClip(id: string, over: Partial<Clip> = {}): Clip {
  return {
    id,
    mediaId: 'm1',
    name: `${id}.mp4`,
    path: `C:/videos/${id}.mp4`,
    trackId: 'v1',
    start: 0,
    end: 10,
    in: 0,
    out: 10,
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
    chromaSim: 0,
    ...over,
  };
}

function makeTrack(clips: Clip[], over: Partial<Track> = {}): Track {
  return { id: 'v1', name: 'Video 1', type: 'video', clips, visible: true, locked: false, ...over };
}

const s = () => useEditorStore.getState();

beforeEach(() => {
  s().initProject('Timeline Test');
});

describe('ruler & time format', () => {
  it('format mm:ss dan hh:mm:ss', () => {
    expect(formatRulerTime(0)).toBe('00:00');
    expect(formatRulerTime(65)).toBe('01:05');
    expect(formatRulerTime(3661)).toBe('1:01:01');
  });

  it('memilih langkah tick agar label tidak terlalu rapat', () => {
    expect(chooseTickStep(40)).toBe(2);
    expect(chooseTickStep(12)).toBe(10);
    expect(chooseTickStep(240)).toBe(0.5);
  });

  it('tick major memiliki label yang benar dan posisi = waktu * pps', () => {
    const ticks = buildRulerTicks(25, 40);
    const labelled = ticks.filter((t) => t.label);
    expect(labelled.length).toBeGreaterThan(3);
    expect(labelled[0].label).toBe('00:00');
    expect(labelled.every((t) => Math.abs(t.x - t.time * 40) < 1e-6)).toBe(true);
    expect(labelled.some((t) => t.label === '00:10')).toBe(true);
  });
});

describe('snap', () => {
  it('snap tepi kiri ke target dalam threshold', () => {
    const result = snapRange(10.2, 14.2, [10.5], 0.5);
    expect(result.snapped).toBe(true);
    expect(result.start).toBeCloseTo(10.5);
    expect(result.end).toBeCloseTo(14.5);
  });

  it('snap tepi kanan ke tepi klip lain', () => {
    const result = snapRange(16.4, 20.4, [20], 0.5);
    expect(result.snapped).toBe(true);
    expect(result.start).toBeCloseTo(16);
    expect(result.end).toBeCloseTo(20);
  });

  it('fallback ke grid bila tidak ada target', () => {
    const result = snapRange(3.1, 8.1, [], 0.3, 1);
    expect(result.snapped).toBe(true);
    expect(result.start).toBe(3);
  });

  it('tidak mengubah apa pun di luar threshold', () => {
    const result = snapRange(3.4, 8.4, [10], 0.2, 1);
    expect(result.snapped).toBe(false);
    expect(result.start).toBe(3.4);
  });
});

describe('move & trim boundaries', () => {
  it('move menghindari tumpang tindih dan memilih celah terdekat', () => {
    const c1 = makeClip('c1');
    const c2 = makeClip('c2', { start: 20, end: 30 });
    const track = makeTrack([c1, c2]);
    const result = moveClipStart(track, c1, 15);
    expect(result.blocked).toBe(false);
    expect(result.start).toBeCloseTo(10);
    expect(result.end).toBeCloseTo(20);
  });

  it('move tidak pernah menghasilkan start negatif', () => {
    const c1 = makeClip('c1');
    const track = makeTrack([c1]);
    const result = moveClipStart(track, c1, -8);
    expect(result.start).toBe(0);
  });

  it('trim kiri menggeser in dan tidak negatif', () => {
    const clip = makeClip('c1', { start: 2, end: 10, in: 2, out: 10 });
    const track = makeTrack([clip]);
    const extend = trimClip(track, clip, 'start', 0);
    expect(extend.start).toBe(0);
    expect(extend.in).toBe(0);

    const shrink = trimClip(track, clip, 'start', 4);
    expect(shrink.start).toBe(4);
    expect(shrink.in).toBe(4);
  });

  it('trim kiri tidak melewati media (in >= 0)', () => {
    const clip = makeClip('c1', { start: 5, end: 10, in: 1, out: 6 });
    const result = trimClip(makeTrack([clip]), clip, 'start', 0);
    expect(result.start).toBe(4);
    expect(result.in).toBe(0);
  });

  it('trim kanan menggeser out dan menghormati durasi minimum', () => {
    const clip = makeClip('c1', { start: 0, end: 10, in: 2, out: 12 });
    const track = makeTrack([clip]);
    const shrink = trimClip(track, clip, 'end', 7.5);
    expect(shrink.end).toBe(7.5);
    expect(shrink.out).toBe(9.5);

    const tooSmall = trimClip(track, clip, 'end', -5);
    expect(tooSmall.end).toBe(MIN_CLIP_SEC);
    expect(tooSmall.end - tooSmall.start).toBeGreaterThanOrEqual(MIN_CLIP_SEC);
  });

  it('trim tidak menabrak tetangga', () => {
    const prev = makeClip('prev', { start: 0, end: 4 });
    const clip = makeClip('c1', { start: 10, end: 20, in: 2, out: 12 });
    const next = makeClip('next', { start: 24, end: 30 });
    const track = makeTrack([prev, clip, next]);

    const left = trimClip(track, clip, 'start', 2);
    expect(left.start).toBe(8); // in=2 → maksimal extend 2 dtk ke belakang, dan prev end=4
    const right = trimClip(track, clip, 'end', 40);
    expect(right.end).toBe(24);
  });
});

describe('split', () => {
  it('split memindahkan in/out dengan benar', () => {
    const clip = makeClip('c1', { start: 0, end: 10, in: 2, out: 12 });
    const parts = splitClipAt(clip, 4, 'right');
    expect(parts).not.toBeNull();
    const [left, right] = parts!;
    expect(left.id).toBe('c1');
    expect(left.start).toBe(0);
    expect(left.end).toBe(4);
    expect(left.in).toBe(2);
    expect(left.out).toBe(6);
    expect(right.id).toBe('right');
    expect(right.start).toBe(4);
    expect(right.end).toBe(10);
    expect(right.in).toBe(6);
    expect(right.out).toBe(12);
  });

  it('split di tepi/terlalu dekat tepi ditolak', () => {
    const clip = makeClip('c1', { start: 0, end: 10 });
    expect(splitClipAt(clip, 0, 'r')).toBeNull();
    expect(splitClipAt(clip, 0.05, 'r')).toBeNull();
    expect(splitClipAt(clip, 9.95, 'r')).toBeNull();
    expect(splitClipAt(clip, 10, 'r')).toBeNull();
  });
});

describe('duplicate', () => {
  it('duplikat ditempel tepat setelah klip dan mempertahankan in/out', () => {
    const clip = makeClip('c1', { start: 3, end: 8, in: 4, out: 9 });
    const copy = duplicateClipAtEnd(clip, 'copy');
    expect(copy.id).toBe('copy');
    expect(copy.start).toBe(8);
    expect(copy.end).toBe(13);
    expect(copy.in).toBe(4);
    expect(copy.out).toBe(9);
    expect(copy).not.toBe(clip);
  });
});

describe('preview sync & kompatibilitas track', () => {
  it('activeClipAt memilih klip pada playhead dan mengabaikan track audio/tersembunyi', () => {
    const video = makeTrack([makeClip('v', { start: 5, end: 10 })]);
    const audio = makeTrack([makeClip('a', { start: 0, end: 30, path: 'C:/a.mp3' })], { id: 'a1', type: 'audio' });
    const hidden = makeTrack([makeClip('h', { start: 5, end: 10 })], { id: 'v2', visible: false });
    const found = activeClipAt([video, audio, hidden], 6);
    expect(found?.clip.id).toBe('v');
    expect(activeClipAt([video], 10)).toBeNull();
  });

  it('clipSourceTime = in + (playhead - start)', () => {
    const clip = makeClip('c1', { start: 10, end: 20, in: 4 });
    expect(clipSourceTime(clip, 12.5)).toBeCloseTo(6.5);
  });

  it('track audio hanya menerima berkas audio', () => {
    const audioTrack = makeTrack([], { id: 'a1', type: 'audio' });
    expect(trackAcceptsClip(audioTrack, makeClip('a', { path: 'C:/a.mp3' }))).toBe(true);
    expect(trackAcceptsClip(audioTrack, makeClip('v'))).toBe(false);
    expect(trackAcceptsClip(makeTrack([]), makeClip('v'))).toBe(true);
  });
});

describe('store: timeline mutations = 1 undo', () => {
  it('moveClip antar track dalam grup = satu entri undo', () => {
    s().addClip('v1', makeClip('c1'));
    const before = s().past.length;
    s().beginGroup('Pindah klip');
    s().moveClip('c1', 'v1', 5, 15);
    s().moveClip('c1', 'v1', 8, 18);
    s().moveClip('c1', 'a1', 12, 22);
    s().endGroup();

    expect(s().past.length).toBe(before + 1);
    const found = s().findClip('c1')!;
    expect(found.track.id).toBe('a1');
    expect(found.clip.start).toBe(12);

    s().undo();
    const restored = s().findClip('c1')!;
    expect(restored.track.id).toBe('v1');
    expect(restored.clip.start).toBe(0);
  });

  it('splitClip satu entri undo dan mengembalikan dua klip', () => {
    s().addClip('v1', makeClip('c1'));
    const before = s().past.length;
    s().splitClip('c1', 4, 'c2');
    expect(s().past.length).toBe(before + 1);
    expect(s().tracks[0].clips).toHaveLength(2);
    expect(s().findClip('c2')!.clip.start).toBe(4);

    s().undo();
    expect(s().tracks[0].clips).toHaveLength(1);
    expect(s().findClip('c1')!.clip.end).toBe(10);
  });

  it('duplicateClip satu entri undo dan menempatkan salinan setelah asal', () => {
    s().addClip('v1', makeClip('c1'));
    const before = s().past.length;
    s().duplicateClip('c1', 'c2');
    expect(s().past.length).toBe(before + 1);
    const copy = s().findClip('c2')!.clip;
    expect(copy.start).toBe(10);
    expect(copy.end).toBe(20);
    s().undo();
    expect(s().findClip('c2')).toBeNull();
  });

  it('relinkMedia memperbarui media + path klip dalam satu undo', () => {
    s().addMedia([{ id: 'm1', name: 'old.mp4', path: 'C:/old.mp4' }]);
    s().addClip('v1', makeClip('c1'));
    const before = s().past.length;
    s().relinkMedia({ m1: 'D:/baru/old.mp4' });
    expect(s().past.length).toBe(before + 1);
    expect(s().media[0].path).toBe('D:/baru/old.mp4');
    expect(s().findClip('c1')!.clip.path).toBe('D:/baru/old.mp4');

    s().undo();
    expect(s().media[0].path).toBe('C:/old.mp4');
    expect(s().findClip('c1')!.clip.path).toBe('C:/videos/c1.mp4');
  });

  it('track ops (update/move/remove) tercatat sebagai aksi terpisah', () => {
    s().addTrack('overlay', 'Overlay 1');
    const id = s().tracks[s().tracks.length - 1].id;
    s().updateTrack(id, { locked: true });
    expect(s().tracks.find((t) => t.id === id)!.locked).toBe(true);
    s().moveTrack(id, -1);
    s().removeTrack(id);
    expect(s().tracks.find((t) => t.id === id)).toBeUndefined();
  });
});
