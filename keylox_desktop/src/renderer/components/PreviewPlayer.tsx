import React, { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { fileUrl } from '../lib/utils';
import { TrackingPanel } from './TrackingPanel';

export const PreviewPlayer: React.FC = () => {
  const store = useEditorStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const clip = store.getSelectedClip();
  const src = clip?.path || store.tracks.flatMap(t=>t.clips)[0]?.path;

  const cssFilter = clip ? `brightness(${clip.filters.brightness}) contrast(${clip.filters.contrast}) saturate(${clip.filters.saturation}) hue-rotate(${clip.filters.hue}deg) blur(${clip.filters.blur}px)` + (clip.filters.grayscale ? ' grayscale(1)' : '') + (clip.filters.sepia ? ' sepia(1)' : '') : '';
  const transform = clip ? `rotate(${clip.transform.rotate}deg) ${clip.transform.flipH ? 'scaleX(-1)' : ''} ${clip.transform.flipV ? 'scaleY(-1)' : ''}` : '';

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (src) {
      if (v.src !== fileUrl(src)) v.src = fileUrl(src);
    } else {
      v.removeAttribute('src');
      v.load();
    }
  }, [src]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = clip?.speed || 1;
    v.volume = Math.min(1, clip?.volume ?? 1);
    v.muted = clip?.muted ?? false;
  }, [clip]);

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
        {overlays.map((o) => (
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
      </div>
      {!src && (
        <div className="absolute text-textMuted text-sm">
          Tambah klip ke timeline atau jalankan perintah AI.
        </div>
      )}
    </div>
  );
};
