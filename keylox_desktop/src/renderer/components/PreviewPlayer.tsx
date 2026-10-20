import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { fileUrl } from '../lib/utils';
import { Clip } from '../lib/types';
import { activeClipAt, clipSourceTime, totalDurationSec } from '../lib/timeline';
import { TrackingPanel } from './TrackingPanel';

function cssFilterFor(clip: Clip | null): string {
  if (!clip) return '';
  const f = clip.filters;
  return `brightness(${f.brightness}) contrast(${f.contrast}) saturate(${f.saturation}) hue-rotate(${f.hue}deg) blur(${f.blur}px)`
    + (f.grayscale ? ' grayscale(1)' : '')
    + (f.sepia ? ' sepia(1)' : '');
}

function transformFor(clip: Clip | null): string {
  if (!clip) return '';
  return `rotate(${clip.transform.rotate}deg) ${clip.transform.flipH ? 'scaleX(-1)' : ''} ${clip.transform.flipV ? 'scaleY(-1)' : ''}`;
}

/**
 * Preview sinkron dengan playhead (U3 dasar):
 * - klip yang tampil = klip video di posisi playhead (bukan sekadar seleksi);
 * - `currentTime` = `in + (playhead - start)`;
 * - play/pause menggerakkan playhead lewat rAF; seek dihormati saat pause.
 * Filter/transform CSS yang sudah ada tetap dipakai.
 */
export const PreviewPlayer: React.FC = () => {
  const store = useEditorStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const srcRef = useRef<string | null>(null);

  const playheadSec = store.playhead / 1000;
  const active = useMemo(
    () => activeClipAt(store.tracks, playheadSec),
    [store.tracks, playheadSec],
  );
  const clip = active?.clip ?? null;
  const track = active?.track ?? null;
  const src = clip?.path ?? null;
  const expectedTime = clip ? clipSourceTime(clip, playheadSec) : 0;
  const duration = totalDurationSec(store.tracks);

  const transDur = clip?.transition?.durationMs ? clip.transition.durationMs / 1000 : 0;
  const inTransition = !!clip?.transition && transDur > 0
    && playheadSec >= (clip.end - transDur) && playheadSec <= clip.end;

  const cssFilter = cssFilterFor(clip);
  const transform = transformFor(clip);

  /* Sumber video: ganti hanya saat klip aktif berubah. */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (src) {
      const next = fileUrl(src);
      if (srcRef.current !== src) {
        srcRef.current = src;
        v.src = next;
        v.load();
      }
    } else {
      srcRef.current = null;
      v.removeAttribute('src');
      v.load();
    }
  }, [src]);

  /* Seek/scrub: saat pause, ikuti playhead dengan presisi. */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !src) return;
    const apply = () => {
      const target = Math.max(0, expectedTime);
      // Saat playing, koreksi hanya bila drift besar (hindari stutter tiap frame).
      const threshold = useEditorStore.getState().isPlaying ? 0.3 : 0.02;
      if (Number.isFinite(target) && Math.abs(v.currentTime - target) > threshold) {
        try { v.currentTime = target; } catch { /* metadata belum siap */ }
      }
    };
    apply();
    v.addEventListener('loadedmetadata', apply);
    return () => v.removeEventListener('loadedmetadata', apply);
  }, [expectedTime, src, store.isPlaying]);

  /* Play/pause video + properti audio/kecepatan. */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = clip?.speed || 1;
    v.volume = Math.min(1, Math.max(0, clip?.volume ?? 1));
    const muted = clip?.muted === true || clip?.removeAudio === true || track?.muted === true || track?.visible === false;
    v.muted = muted;
    if (!clip) {
      v.pause();
      return;
    }
    if (store.isPlaying) {
      void v.play().catch(() => { /* autoplay/format tidak didukung */ });
    } else {
      v.pause();
    }
  }, [store.isPlaying, clip?.id, clip?.speed, clip?.volume, clip?.muted, clip?.removeAudio, track?.muted, track?.visible, src]);

  /* Jam playback: playhead bergerak, preview mengikuti. */
  useEffect(() => {
    if (!store.isPlaying) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const state = useEditorStore.getState();
      if (!state.isPlaying) return;
      const dt = Math.max(0, Math.min(250, now - last));
      last = now;
      const next = state.playhead + dt;
      const endMs = totalDurationSec(state.tracks) * 1000;
      if (endMs <= 0 || next >= endMs) {
        state.setPlayhead(Math.max(0, endMs));
        state.setPlaying(false);
        return;
      }
      state.setPlayhead(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [store.isPlaying]);

  // WebGL canvas init (basic)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }, []);

  const overlays = clip?.textOverlays || [];
  const localOverlays = clip
    ? overlays.filter((o) => {
        const t = playheadSec - clip.start;
        return t >= o.start && t <= o.end;
      })
    : [];

  return (
    <div className="flex-1 bg-black relative flex items-center justify-center overflow-hidden">
      <button
        type="button"
        className="absolute right-3 top-3 z-20 rounded border border-border bg-panel/90 px-2 py-1 text-[11px] text-textPrimary transition-colors duration-150 ease-out hover:bg-elevated"
        onClick={() => setTrackingOpen((v) => !v)}
      >
        Editor tracking
      </button>
      {trackingOpen && <TrackingPanel onClose={() => setTrackingOpen(false)} />}
      <div className="relative" style={{ aspectRatio: store.aspectRatio.replace(':', '/'), maxHeight: '100%', maxWidth: '100%' }}>
        <video
          ref={videoRef}
          className="max-w-full max-h-full"
          style={{ filter: cssFilter, transform }}
          controls={false}
          playsInline
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none"
          style={{ width: '100%', height: '100%' }}
        />
        {localOverlays.map((o) => (
          <div
            key={o.id}
            className="absolute pointer-events-none"
            style={{
              left: `${o.x}%`,
              top: `${o.y}%`,
              transform: 'translate(-50%, -50%)',
              fontSize: `${o.size}px`,
              color: o.color,
              fontWeight: 600,
              textShadow: '0 2px 4px rgba(0,0,0,0.8)',
            }}
          >
            {o.text}
          </div>
        ))}
        {inTransition && (
          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-active/80 text-white text-[10px] pointer-events-none">
            transisi: {clip?.transition?.type}
          </div>
        )}
      </div>
      {!src && (
        <div className="absolute text-textMuted text-sm text-center px-6">
          {duration > 0 ? 'Tidak ada klip di posisi playhead.' : 'Tambah klip ke timeline atau jalankan perintah AI.'}
        </div>
      )}
    </div>
  );
};
