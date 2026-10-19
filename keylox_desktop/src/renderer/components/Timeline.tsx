import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { Clip, Track, TrackType } from '../lib/types';
import { uid } from '../lib/utils';
import {
  buildRulerTicks,
  clipDuration,
  clipIn,
  clipOut,
  collectSnapTargets,
  duplicateClipAtEnd,
  formatRulerTime,
  isAudioClip,
  moveClipStart,
  snapRange,
  splitClipAt,
  totalDurationSec,
  trackAcceptsClip,
  trimClip,
} from '../lib/timeline';
import { toastInfo } from '../lib/toast';

const HEADER_W = 148;
const ROW_H = 48;
const RULER_H = 28;
const MIN_WIDTH_SEC = 40;

type DragState =
  | {
      kind: 'move';
      clipId: string;
      startX: number;
      startY: number;
      originStart: number;
      duration: number;
      originTrackId: string;
    }
  | {
      kind: 'trim';
      clipId: string;
      edge: 'start' | 'end';
      startX: number;
      baseClip: Clip;
      trackId: string;
    }
  | { kind: 'playhead' };

function makeClipFromMedia(item: any, trackId: string, start: number): Clip {
  const duration = Math.max(0.1, Number(item.duration) || 5);
  return {
    id: uid(),
    mediaId: item.id,
    name: item.name,
    path: item.path,
    trackId,
    start,
    end: start + duration,
    in: 0,
    out: duration,
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
  };
}

function fmtTimecode(sec: number): string {
  const safe = Math.max(0, sec);
  const hundredths = Math.floor((safe - Math.floor(safe)) * 100);
  return `${formatRulerTime(safe)}.${String(hundredths).padStart(2, '0')}`;
}

export const Timeline: React.FC = () => {
  const store = useEditorStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [newTrackType, setNewTrackType] = useState<TrackType>('video');

  const pps = store.pxPerSec;
  const playheadSec = store.playhead / 1000;
  const totalDuration = Math.max(MIN_WIDTH_SEC, totalDurationSec(store.tracks) + 8);
  const contentWidth = Math.round(totalDuration * pps);
  const ticks = useMemo(
    () => buildRulerTicks(totalDuration, pps),
    [totalDuration, pps],
  );

  const selected = store.getSelectedClip();

  /* ------------------------------------------------------------------ *
   * Zoom (Ctrl+wheel) — listener native agar bisa preventDefault.
   * ------------------------------------------------------------------ */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const state = useEditorStore.getState();
      const rect = el.getBoundingClientRect();
      const cursorX = e.clientX - rect.left + el.scrollLeft - HEADER_W;
      const timeAtCursor = cursorX / state.pxPerSec;
      const next = e.deltaY < 0 ? state.pxPerSec * 1.12 : state.pxPerSec / 1.12;
      state.setZoom(next);
      const applied = useEditorStore.getState().pxPerSec;
      requestAnimationFrame(() => {
        el.scrollLeft = Math.max(0, timeAtCursor * applied + HEADER_W - (e.clientX - rect.left));
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /* ------------------------------------------------------------------ *
   * Drag playhead (ruler / handle)
   * ------------------------------------------------------------------ */
  const seekFromClientX = useCallback((clientX: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const ruler = el.querySelector('[data-timeline-content]') as HTMLElement | null;
    if (!ruler) return;
    const rect = ruler.getBoundingClientRect();
    const sec = Math.max(0, (clientX - rect.left) / pps);
    useEditorStore.getState().setPlayhead(sec * 1000);
  }, [pps]);

  const onWindowPointerMove = useCallback((e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const state = useEditorStore.getState();
    const ppsNow = state.pxPerSec;
    const threshold = 8 / ppsNow;

    if (drag.kind === 'playhead') {
      seekFromClientX(e.clientX);
      return;
    }

    if (drag.kind === 'move') {
      const found = state.findClip(drag.clipId);
      if (!found) return;
      const dx = (e.clientX - drag.startX) / ppsNow;
      const desiredStart = Math.max(0, drag.originStart + dx);
      const targets = state.snapEnabled
        ? collectSnapTargets(state.tracks, drag.clipId, state.playhead / 1000)
        : [];
      const snapped = state.snapEnabled
        ? snapRange(desiredStart, desiredStart + drag.duration, targets, threshold)
        : { start: desiredStart, end: desiredStart + drag.duration };

      // Track tujuan dari posisi pointer (baris mana yang berada di bawah kursor).
      const hit = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const row = hit?.closest('[data-track-id]') as HTMLElement | null;
      let targetTrack = state.tracks.find((t) => t.id === drag.originTrackId) || found.track;
      if (row && row.dataset.trackId) {
        const candidate = state.tracks.find((t) => t.id === row.dataset.trackId);
        if (candidate && !candidate.locked && trackAcceptsClip(candidate, found.clip)) {
          targetTrack = candidate;
        }
      }
      if (targetTrack.locked) return;

      const result = moveClipStart(targetTrack, found.clip, snapped.start);
      if (result.blocked) return;
      state.moveClip(drag.clipId, targetTrack.id, result.start, result.end);
      return;
    }

    if (drag.kind === 'trim') {
      const track = state.tracks.find((t) => t.id === drag.trackId);
      if (!track || track.locked) return;
      const base = drag.baseClip;
      const offset = (e.clientX - drag.startX) / ppsNow;
      let desired = drag.edge === 'start'
        ? base.start + offset
        : base.end + offset;
      if (state.snapEnabled) {
        const targets = collectSnapTargets(state.tracks, base.id, state.playhead / 1000);
        const point = snapRange(desired, desired, targets, threshold);
        if (point.snapped) desired = point.start;
      }
      const trimmed = trimClip(track, base, drag.edge, desired);
      state.updateClip(base.id, trimmed);
    }
  }, [seekFromClientX]);

  const stopDrag = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', stopDrag);
    if (drag && drag.kind !== 'playhead') {
      const state = useEditorStore.getState();
      if (state.groupDepth > 0) state.endGroup();
    }
  }, [onWindowPointerMove]);

  const beginDrag = useCallback((drag: DragState) => {
    dragRef.current = drag;
    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', stopDrag);
  }, [onWindowPointerMove, stopDrag]);

  const onRulerPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    seekFromClientX(e.clientX);
    beginDrag({ kind: 'playhead' });
  };

  /* ------------------------------------------------------------------ *
   * Clip pointer handlers
   * ------------------------------------------------------------------ */
  const onClipPointerDown = (e: React.PointerEvent, clip: Clip, track: Track) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const state = useEditorStore.getState();
    state.selectClip(clip.id);
    if (track.locked) {
      toastInfo('Track terkunci. Buka lock untuk mengedit klip.');
      return;
    }
    state.beginGroup('Pindah klip');
    beginDrag({
      kind: 'move',
      clipId: clip.id,
      startX: e.clientX,
      startY: e.clientY,
      originStart: clip.start,
      duration: clipDuration(clip),
      originTrackId: track.id,
    });
  };

  const onTrimPointerDown = (
    e: React.PointerEvent,
    clip: Clip,
    track: Track,
    edge: 'start' | 'end',
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (track.locked) {
      toastInfo('Track terkunci.');
      return;
    }
    const state = useEditorStore.getState();
    state.selectClip(clip.id);
    state.beginGroup('Trim klip');
    beginDrag({
      kind: 'trim',
      clipId: clip.id,
      edge,
      startX: e.clientX,
      baseClip: JSON.parse(JSON.stringify(clip)),
      trackId: track.id,
    });
  };

  /* ------------------------------------------------------------------ *
   * Drop media
   * ------------------------------------------------------------------ */
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const onDrop = (e: React.DragEvent, track: Track) => {
    e.preventDefault();
    if (track.locked) {
      toastInfo('Track terkunci.');
      return;
    }
    let item: any = null;
    try { item = JSON.parse(e.dataTransfer.getData('application/x-keylox-media')); } catch { /* ignore */ }
    if (!item || !item.path) return;

    const state = useEditorStore.getState();
    const probe = makeClipFromMedia(item, track.id, 0);
    if (!trackAcceptsClip(track, probe)) {
      toastInfo(track.type === 'audio'
        ? 'Track audio hanya menerima berkas audio.'
        : 'Berkas audio hanya dapat ditaruh di track audio.');
      return;
    }
    const body = e.currentTarget as HTMLElement;
    const rect = body.getBoundingClientRect();
    const rawStart = Math.max(0, (e.clientX - rect.left) / state.pxPerSec);
    const targets = state.snapEnabled
      ? collectSnapTargets(state.tracks, null, state.playhead / 1000)
      : [];
    const snapped = state.snapEnabled
      ? snapRange(rawStart, rawStart + (probe.end - probe.start), targets, 8 / state.pxPerSec)
      : { start: rawStart };
    const placed = moveClipStart(track, probe, snapped.start);
    if (placed.blocked) {
      toastInfo('Tidak ada ruang kosong di track ini pada posisi tersebut.');
      return;
    }
    probe.start = placed.start;
    probe.end = placed.end;
    state.addClip(track.id, probe);
    state.selectClip(probe.id);
  };

  /* ------------------------------------------------------------------ *
   * Toolbar actions
   * ------------------------------------------------------------------ */
  const splitAtPlayhead = () => {
    const state = useEditorStore.getState();
    const clip = state.getSelectedClip();
    if (!clip) {
      toastInfo('Pilih klip yang akan dipotong.');
      return;
    }
    if (!splitClipAt(clip, state.playhead / 1000, 'check')) {
      toastInfo('Playhead harus berada di dalam klip (bukan di tepi).');
      return;
    }
    state.splitClip(clip.id, state.playhead / 1000, uid());
  };

  const duplicateSelected = () => {
    const state = useEditorStore.getState();
    const clip = state.getSelectedClip();
    if (!clip) {
      toastInfo('Pilih klip untuk diduplikat.');
      return;
    }
    const copy = duplicateClipAtEnd(clip, uid());
    if (copy) state.duplicateClip(clip.id, copy.id);
  };

  const removeSelected = () => {
    const state = useEditorStore.getState();
    const clip = state.getSelectedClip();
    if (clip) state.removeClip(clip.id);
  };

  const addTrack = () => {
    useEditorStore.getState().addTrack(newTrackType);
  };

  return (
    <div className="h-[296px] shrink-0 bg-panel border-t border-border flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-border text-xs shrink-0">
        <span className="text-textMuted mr-1">Timeline</span>
        <select
          value={newTrackType}
          onChange={(e) => setNewTrackType(e.target.value as TrackType)}
          className="h-6 py-0 text-[11px]"
          aria-label="Jenis track baru"
        >
          <option value="video">Video</option>
          <option value="overlay">Overlay</option>
          <option value="text">Teks</option>
          <option value="audio">Audio</option>
        </select>
        <button
          type="button"
          className="rounded bg-elevated px-2 py-0.5 text-[11px] transition-colors duration-150 ease-out hover:bg-border"
          onClick={addTrack}
        >+ Track</button>
        <span className="mx-1 h-4 w-px bg-border" />
        <button
          type="button"
          className="rounded bg-elevated px-2 py-0.5 text-[11px] transition-colors duration-150 ease-out hover:bg-border disabled:opacity-40"
          onClick={splitAtPlayhead}
          disabled={!selected}
          title="Split di playhead (S)"
        >Split</button>
        <button
          type="button"
          className="rounded bg-elevated px-2 py-0.5 text-[11px] transition-colors duration-150 ease-out hover:bg-border disabled:opacity-40"
          onClick={duplicateSelected}
          disabled={!selected}
          title="Duplikat (Ctrl+D)"
        >Duplikat</button>
        <button
          type="button"
          className="rounded bg-elevated px-2 py-0.5 text-[11px] transition-colors duration-150 ease-out hover:bg-border disabled:opacity-40"
          onClick={removeSelected}
          disabled={!selected}
          title="Hapus (Del)"
        >Hapus</button>
        <span className="mx-1 h-4 w-px bg-border" />
        <button
          type="button"
          aria-pressed={store.snapEnabled}
          className={`rounded px-2 py-0.5 text-[11px] transition-colors duration-150 ease-out ${store.snapEnabled ? 'bg-active text-white' : 'bg-elevated text-textMuted hover:bg-border'}`}
          onClick={() => useEditorStore.getState().toggleSnap()}
          title="Snap ke playhead/tepi klip/grid (N)"
        >{store.snapEnabled ? 'Snap: on' : 'Snap: off'}</button>
        <div className="flex-1" />
        <span className="font-mono text-textMuted tabular-nums">{fmtTimecode(playheadSec)}</span>
        <span className="mx-1 h-4 w-px bg-border" />
        <button
          type="button"
          className="rounded bg-elevated px-1.5 py-0.5 text-[11px] hover:bg-border"
          onClick={() => useEditorStore.getState().zoomOut()}
          title="Zoom out (-)"
        >−</button>
        <input
          type="range"
          min={12}
          max={240}
          step={1}
          value={Math.round(pps)}
          onChange={(e) => useEditorStore.getState().setZoom(Number(e.target.value))}
          className="w-24 accent-[#ff6600]"
          aria-label="Zoom timeline"
        />
        <button
          type="button"
          className="rounded bg-elevated px-1.5 py-0.5 text-[11px] hover:bg-border"
          onClick={() => useEditorStore.getState().zoomIn()}
          title="Zoom in (+)"
        >+</button>
      </div>

      {/* Scroll area */}
      <div ref={scrollRef} className="flex-1 overflow-auto relative select-none">
        <div className="relative" style={{ width: HEADER_W + contentWidth, minHeight: RULER_H + store.tracks.length * ROW_H }}>
          {/* Ruler */}
          <div className="sticky top-0 z-30 flex bg-panel border-b border-border" style={{ height: RULER_H }}>
            <div className="sticky left-0 z-40 shrink-0 bg-panel border-r border-border" style={{ width: HEADER_W }} />
            <div
              data-timeline-content
              className="relative cursor-pointer"
              style={{ width: contentWidth, height: RULER_H }}
              onPointerDown={onRulerPointerDown}
              role="slider"
              aria-label="Posisi playhead"
              aria-valuemin={0}
              aria-valuemax={Math.round(totalDuration)}
              aria-valuenow={Math.round(playheadSec)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') useEditorStore.getState().setPlayhead(store.playhead + 100);
                if (e.key === 'ArrowLeft') useEditorStore.getState().setPlayhead(store.playhead - 100);
              }}
            >
              {ticks.map((tick) => (
                <div
                  key={tick.time}
                  className={`absolute top-0 ${tick.major ? 'bg-borderStrong' : 'bg-border'}`}
                  style={{ left: tick.x, width: 1, height: tick.major ? 10 : 5 }}
                />
              ))}
              {ticks.filter((t) => t.label).map((tick) => (
                <span
                  key={`label-${tick.time}`}
                  className="absolute top-2 text-[9px] font-mono text-textMuted whitespace-nowrap"
                  style={{ left: tick.x + 3 }}
                >{tick.label}</span>
              ))}
            </div>
          </div>

          {/* Track rows */}
          {store.tracks.map((track) => {
            const isAudio = track.type === 'audio';
            return (
              <div key={track.id} className="flex border-b border-border" style={{ height: ROW_H }}>
                <div
                  className="sticky left-0 z-40 shrink-0 bg-elevated border-r border-border px-1.5 flex flex-col justify-center gap-0.5"
                  style={{ width: HEADER_W }}
                >
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="shrink-0 rounded bg-panel px-1 text-[9px] font-mono text-textMuted">
                      {track.type.slice(0, 2).toUpperCase()}
                    </span>
                    <span className={`truncate text-[11px] ${track.visible === false ? 'text-textDisabled' : 'text-textPrimary'}`}>
                      {track.name}
                    </span>
                    <div className="ml-auto flex items-center gap-0.5">
                      <button
                        type="button"
                        className={`px-1 text-[9px] leading-4 rounded ${track.muted ? 'bg-active text-white' : 'text-textMuted hover:bg-border'}`}
                        title={isAudio ? 'Mute audio (M)' : 'Mute track'}
                        aria-pressed={track.muted === true}
                        onClick={() => useEditorStore.getState().updateTrack(track.id, { muted: !track.muted })}
                      >M</button>
                      {!isAudio && (
                        <button
                          type="button"
                          className={`px-1 text-[9px] leading-4 rounded ${track.visible === false ? 'bg-active text-white' : 'text-textMuted hover:bg-border'}`}
                          title="Visibilitas"
                          aria-pressed={track.visible !== false}
                          onClick={() => useEditorStore.getState().updateTrack(track.id, { visible: track.visible === false })}
                        >V</button>
                      )}
                      <button
                        type="button"
                        className={`px-1 text-[9px] leading-4 rounded ${track.locked ? 'bg-active text-white' : 'text-textMuted hover:bg-border'}`}
                        title="Kunci track"
                        aria-pressed={track.locked === true}
                        onClick={() => useEditorStore.getState().updateTrack(track.id, { locked: !track.locked })}
                      >L</button>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      className="px-1 text-[9px] leading-4 rounded text-textMuted hover:bg-border"
                      title="Naikkan track"
                      onClick={() => useEditorStore.getState().moveTrack(track.id, -1)}
                    >↑</button>
                    <button
                      type="button"
                      className="px-1 text-[9px] leading-4 rounded text-textMuted hover:bg-border"
                      title="Turunkan track"
                      onClick={() => useEditorStore.getState().moveTrack(track.id, 1)}
                    >↓</button>
                    <button
                      type="button"
                      className="px-1 text-[9px] leading-4 rounded text-textMuted hover:bg-border hover:text-danger"
                      title="Hapus track"
                      onClick={() => useEditorStore.getState().removeTrack(track.id)}
                    >×</button>
                  </div>
                </div>

                <div
                  data-track-id={track.id}
                  className={`relative ${track.locked ? 'bg-app/40' : ''} ${track.visible === false ? 'opacity-40' : ''}`}
                  style={{ width: contentWidth, height: ROW_H }}
                  onDragOver={onDragOver}
                  onDrop={(e) => onDrop(e, track)}
                >
                  {/* grid 1 detik */}
                  {Array.from({ length: Math.ceil(totalDuration) + 1 }).map((_, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 border-l border-border/40 pointer-events-none"
                      style={{ left: i * pps }}
                    />
                  ))}

                  {track.clips.map((clip) => {
                    const selectedClip = store.selectedClipId === clip.id;
                    const width = Math.max(6, clipDuration(clip) * pps);
                    const isAudioClipItem = isAudioClip(clip);
                    return (
                      <div
                        key={clip.id}
                        data-testid="timeline-clip"
                        data-clip-id={clip.id}
                        className={`absolute top-1 rounded border overflow-hidden group transition-colors duration-150 ease-out ${
                          selectedClip
                            ? 'border-active bg-active/20'
                            : 'border-border bg-elevated hover:border-borderStrong'
                        } ${track.locked ? 'cursor-not-allowed' : 'cursor-grab'}`}
                        style={{ left: clip.start * pps, width, height: ROW_H - 8 }}
                        onPointerDown={(e) => onClipPointerDown(e, clip, track)}
                        onDoubleClick={() => useEditorStore.getState().selectClip(clip.id)}
                        title={`${clip.name} · ${(clip.end - clip.start).toFixed(2)}s · in ${clipIn(clip).toFixed(2)} / out ${clipOut(clip).toFixed(2)}`}
                      >
                        <div className="px-1.5 pt-0.5 text-[10px] text-textPrimary truncate pointer-events-none">
                          {clip.name}
                        </div>
                        <div className="px-1.5 text-[9px] text-textMuted truncate pointer-events-none font-mono">
                          {isAudioClipItem ? 'audio' : 'video'} · {(clip.end - clip.start).toFixed(2)}s
                        </div>
                        {clip.muted && (
                          <span className="absolute right-1 bottom-0.5 text-[8px] text-textMuted pointer-events-none">mute</span>
                        )}
                        <div
                          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-active/0 hover:bg-active/70 transition-colors duration-150 ease-out"
                          onPointerDown={(e) => onTrimPointerDown(e, clip, track, 'start')}
                          aria-label="Trim kiri"
                          role="separator"
                        />
                        <div
                          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-active/0 hover:bg-active/70 transition-colors duration-150 ease-out"
                          onPointerDown={(e) => onTrimPointerDown(e, clip, track, 'end')}
                          aria-label="Trim kanan"
                          role="separator"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-px bg-active z-30 pointer-events-none"
            style={{ left: HEADER_W + playheadSec * pps }}
          />
          <div
            className="absolute z-40 cursor-ew-resize"
            style={{ left: HEADER_W + playheadSec * pps - 5, top: 0, width: 11, height: 10 }}
            onPointerDown={(e) => {
              e.preventDefault();
              beginDrag({ kind: 'playhead' });
            }}
            title="Geser playhead"
          >
            <div className="mx-auto h-0 w-0 border-l-[5px] border-r-[5px] border-t-[9px] border-l-transparent border-r-transparent border-t-active" />
          </div>
        </div>
      </div>

      {store.tracks.length === 0 && (
        <div className="text-xs text-textMuted text-center p-3">
          Belum ada track. Tambah track atau drag media ke sini.
        </div>
      )}
    </div>
  );
};
