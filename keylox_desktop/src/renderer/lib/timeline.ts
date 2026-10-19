import { Clip, Track } from './types';

/**
 * Utilitas timeline murni (tanpa React) — dipakai `Timeline.tsx`, store, dan
 * unit test. Semua waktu klip dalam DETIK; playhead store dalam MILIDETIK.
 */

export const MIN_CLIP_SEC = 0.1;
export const GRID_STEP_SEC = 1;
export const SNAP_THRESHOLD_PX = 8;
export const MIN_PPS = 12;
export const MAX_PPS = 240;

export const AUDIO_EXT = /\.(mp3|wav|aac|m4a|ogg|flac)$/i;

export function clipIn(clip: Clip): number {
  return Number.isFinite(clip.in) ? Math.max(0, clip.in as number) : 0;
}

export function clipOut(clip: Clip): number {
  if (Number.isFinite(clip.out)) return Math.max(clipIn(clip), clip.out as number);
  return clipIn(clip) + clipDuration(clip);
}

export function clipDuration(clip: Clip): number {
  return Math.max(0, clip.end - clip.start);
}

export function isAudioClip(clip: Clip): boolean {
  return AUDIO_EXT.test(clip.path || '');
}

/** Track audio hanya menerima berkas audio; track visual menolak audio. */
export function trackAcceptsClip(track: Track, clip: Clip): boolean {
  if (track.type === 'audio') return isAudioClip(clip);
  return !isAudioClip(clip);
}

export function clampPps(pps: number): number {
  if (!Number.isFinite(pps)) return 40;
  return Math.min(MAX_PPS, Math.max(MIN_PPS, pps));
}

export function totalDurationSec(tracks: Track[]): number {
  return Math.max(0, ...tracks.flatMap((t) => t.clips.map((c) => c.end)));
}

/* ------------------------------------------------------------------ *
 * Ruler
 * ------------------------------------------------------------------ */

const TICK_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

/** Langkah tick major agar label tidak bertumpuk (minimal ~64px). */
export function chooseTickStep(pxPerSec: number, minPx = 64): number {
  const pps = clampPps(pxPerSec);
  for (const step of TICK_STEPS) {
    if (step * pps >= minPx) return step;
  }
  return TICK_STEPS[TICK_STEPS.length - 1];
}

export interface RulerTick {
  time: number;
  x: number;
  major: boolean;
  label: string | null;
}

/** mm:ss (atau hh:mm:ss bila melewati 1 jam) — tanpa frame. */
export function formatRulerTime(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function buildRulerTicks(durationSec: number, pxPerSec: number): RulerTick[] {
  const pps = clampPps(pxPerSec);
  const step = chooseTickStep(pps);
  const minorStep = step >= 5 && step % 5 === 0 ? step / 5 : step;
  const end = Math.max(step, Math.ceil((durationSec + step) / minorStep) * minorStep);
  const ticks: RulerTick[] = [];
  for (let i = 0; i <= Math.ceil(end / minorStep); i++) {
    const time = i * minorStep;
    const major = Math.abs(time / step - Math.round(time / step)) < 1e-6;
    ticks.push({
      time,
      x: time * pps,
      major,
      label: major ? formatRulerTime(time) : null,
    });
  }
  return ticks;
}

/* ------------------------------------------------------------------ *
 * Snap
 * ------------------------------------------------------------------ */

export function collectSnapTargets(tracks: Track[], excludeClipId: string | null, playheadSec: number): number[] {
  const targets = new Set<number>();
  if (Number.isFinite(playheadSec)) targets.add(Math.max(0, playheadSec));
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (clip.id === excludeClipId) continue;
      targets.add(clip.start);
      targets.add(clip.end);
    }
  }
  return [...targets].sort((a, b) => a - b);
}

export interface SnapResult {
  start: number;
  end: number;
  snapped: boolean;
  target: number | null;
}

/**
 * Snap rentang klip: cocokkan tepi kiri ATAU kanan ke target terdekat (playhead,
 * tepi klip lain) dan ke grid. Grid hanya dipakai bila tidak ada target clip.
 */
export function snapRange(
  start: number,
  end: number,
  targets: number[],
  thresholdSec: number,
  gridSec = GRID_STEP_SEC,
): SnapResult {
  const duration = Math.max(0, end - start);
  let bestDelta = Number.POSITIVE_INFINITY;
  let bestStart = start;
  let bestTarget: number | null = null;

  for (const target of targets) {
    const dStart = Math.abs(target - start);
    const dEnd = Math.abs(target - end);
    if (dStart <= thresholdSec && dStart < bestDelta) {
      bestDelta = dStart;
      bestStart = target;
      bestTarget = target;
    }
    if (dEnd <= thresholdSec && dEnd < bestDelta) {
      bestDelta = dEnd;
      bestStart = target - duration;
      bestTarget = target;
    }
  }

  if (bestTarget !== null && bestStart >= 0) {
    return { start: bestStart, end: bestStart + duration, snapped: true, target: bestTarget };
  }

  // Grid: satu-satunya fallback agar hasil tetap terasa "magnet".
  if (gridSec > 0) {
    const gridStart = Math.round(start / gridSec) * gridSec;
    if (Math.abs(gridStart - start) <= Math.min(thresholdSec, gridSec / 2)) {
      return { start: gridStart, end: gridStart + duration, snapped: true, target: gridStart };
    }
  }

  return { start, end, snapped: false, target: null };
}

/* ------------------------------------------------------------------ *
 * Move & trim (non-overlap)
 * ------------------------------------------------------------------ */

interface Range {
  start: number;
  end: number;
}

/** Jarak bebas terdekat untuk klip berdurasi `duration` dalam `[0, ∞)`. */
export function nearestFreeStart(blocked: Range[], desired: number, duration: number): number {
  const intervals = blocked
    .map((b) => ({ start: Math.min(b.start, b.end), end: Math.max(b.start, b.end) }))
    .sort((a, b) => a.start - b.start);
  const free: Range[] = [];
  let cursor = 0;
  for (const b of intervals) {
    if (b.start > cursor) free.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  free.push({ start: cursor, end: Number.POSITIVE_INFINITY });

  let best: number | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const gap of free) {
    if (gap.end - gap.start < duration) continue;
    const candidate = Math.min(Math.max(desired, gap.start), gap.end - duration);
    const dist = Math.abs(candidate - desired);
    if (dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  return best === null ? Math.max(0, desired) : best;
}

/** Barengan dari clip lain di track yang sama (kecuali clip yang dipindah). */
export function blockedRanges(track: Track, excludeClipId: string | null): Range[] {
  return track.clips
    .filter((c) => c.id !== excludeClipId)
    .map((c) => ({ start: c.start, end: c.end }));
}

export interface MoveResult {
  start: number;
  end: number;
  blocked: boolean;
}

/**
 * Pindahkan klip ke `desiredStart` tanpa tumpang tindih. Bila tidak ada celah
 * yang cukup, posisi asal dipertahankan (`blocked: true`).
 */
export function moveClipStart(track: Track, clip: Clip, desiredStart: number): MoveResult {
  const duration = clipDuration(clip);
  const desired = Math.max(0, desiredStart);
  const others = blockedRanges(track, clip.id);
  const overlap = others.some((b) => desired < b.end && desired + duration > b.start);
  if (!overlap) {
    return { start: desired, end: desired + duration, blocked: false };
  }
  const start = nearestFreeStart(others, desired, duration);
  const stillOverlaps = others.some((b) => start < b.end && start + duration > b.start);
  if (stillOverlaps || start < 0) {
    return { start: clip.start, end: clip.end, blocked: true };
  }
  return { start, end: start + duration, blocked: false };
}

/** Tepi tetangga terdekat untuk trim (prev end / next start). */
export function neighborBounds(track: Track, clip: Clip): { prevEnd: number; nextStart: number } {
  let prevEnd = 0;
  let nextStart = Number.POSITIVE_INFINITY;
  for (const other of track.clips) {
    if (other.id === clip.id) continue;
    if (other.end <= clip.start + 1e-9) prevEnd = Math.max(prevEnd, other.end);
    if (other.start >= clip.end - 1e-9) nextStart = Math.min(nextStart, other.start);
  }
  return { prevEnd, nextStart };
}

export interface TrimResult {
  start: number;
  end: number;
  in: number;
  out: number;
}

/**
 * Trim satu tepi. `desiredSec` = posisi tepi baru di timeline.
 * - kiri: `in` ikut bergeser, tidak boleh < 0;
 * - kanan: `out` ikut bergeser;
 * - durasi minimum `MIN_CLIP_SEC`, tidak menabrak tetangga.
 */
export function trimClip(
  track: Track,
  clip: Clip,
  edge: 'start' | 'end',
  desiredSec: number,
): TrimResult {
  const bounds = neighborBounds(track, clip);
  const inPoint = clipIn(clip);
  const outPoint = clipOut(clip);

  if (edge === 'start') {
    const minStart = Math.max(bounds.prevEnd, clip.start - inPoint);
    const maxStart = clip.end - MIN_CLIP_SEC;
    const start = Math.min(maxStart, Math.max(minStart, desiredSec));
    const delta = start - clip.start;
    return {
      start,
      end: clip.end,
      in: Math.max(0, inPoint + delta),
      out: outPoint,
    };
  }

  const minEnd = clip.start + MIN_CLIP_SEC;
  const maxEnd = bounds.nextStart;
  const end = Math.min(maxEnd, Math.max(minEnd, desiredSec));
  const delta = end - clip.end;
  return {
    start: clip.start,
    end,
    in: inPoint,
    out: Math.max(inPoint, outPoint + delta),
  };
}

/**
 * Split pada playhead. `null` bila playhead tidak berada di dalam klip
 * (dengan margin `MIN_CLIP_SEC` di kedua sisi).
 */
export function splitClipAt(clip: Clip, atSec: number, newId: string): [Clip, Clip] | null {
  if (!Number.isFinite(atSec)) return null;
  if (atSec <= clip.start + MIN_CLIP_SEC || atSec >= clip.end - MIN_CLIP_SEC) return null;
  const inPoint = clipIn(clip);
  const outPoint = clipOut(clip);
  const left: Clip = { ...clip, end: atSec, out: inPoint + (atSec - clip.start) };
  const right: Clip = {
    ...clip,
    id: newId,
    start: atSec,
    in: inPoint + (atSec - clip.start),
    out: outPoint,
  };
  return [left, right];
}

/** Duplikat tepat setelah klip asal (start = end), properti disalin. */
export function duplicateClipAtEnd(clip: Clip, newId: string): Clip {
  const duration = clipDuration(clip);
  return {
    ...JSON.parse(JSON.stringify(clip)),
    id: newId,
    start: clip.end,
    end: clip.end + duration,
  };
}

/* ------------------------------------------------------------------ *
 * Preview
 * ------------------------------------------------------------------ */

export interface ActiveClip {
  clip: Clip;
  track: Track;
}

/** Klip video yang tampil pada playhead (track paling atas menang). */
export function activeClipAt(tracks: Track[], playheadSec: number): ActiveClip | null {
  for (let i = tracks.length - 1; i >= 0; i--) {
    const track = tracks[i];
    if (track.visible === false) continue;
    if (track.type === 'audio') continue;
    const clip = track.clips.find((c) => playheadSec >= c.start && playheadSec < c.end);
    if (clip) return { clip, track };
  }
  return null;
}

/** Waktu sumber untuk klip aktif: `in + (playhead - start)`. */
export function clipSourceTime(clip: Clip, playheadSec: number): number {
  return Math.max(0, clipIn(clip) + (playheadSec - clip.start));
}
