import React, { useRef } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { Clip } from '../lib/types';
import { uid } from '../lib/utils';

export const Timeline: React.FC = () => {
  const store = useEditorStore();
  const containerRef = useRef<HTMLDivElement>(null);

  const totalDuration = Math.max(
    10,
    ...store.tracks.flatMap((t) => t.clips.map((c) => c.end))
  );

  const pxPerSec = 40;

  const onClipClick = (clipId: string) => store.selectClip(clipId);

  const onDragOver = (e: React.DragEvent, trackId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const onDrop = (e: React.DragEvent, trackId: string) => {
    e.preventDefault();
    let item: any = null;
    try { item = JSON.parse(e.dataTransfer.getData('application/x-keylox-media')); } catch {}
    if (!item) return;
    const track = store.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const dur = item.duration || 5;
    const clip: Clip = {
      id: uid(),
      mediaId: item.id,
      name: item.name,
      path: item.path,
      trackId,
      start: 0,
      end: dur,
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
    store.addClip(trackId, clip);
  };

  const removeClip = (clipId: string) => {
    store.pushHistory();
    store.removeClip(clipId);
  };

  return (
    <div className="h-60 shrink-0 bg-panel border-t border-border flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-2 py-1 border-b border-border text-xs">
        <span className="text-textMuted">Timeline</span>
        <button className="px-2 py-0.5 bg-elevated rounded text-xs" onClick={() => store.addTrack('video')}>+ Track</button>
        <div className="flex-1" />
        <span className="font-mono text-textMuted">{(store.playhead / 1000).toFixed(2)}s</span>
      </div>
      <div ref={containerRef} className="flex-1 overflow-auto relative">
        {/* ruler */}
        <div className="sticky top-0 bg-panel z-10 h-6 border-b border-border flex">
          {Array.from({ length: Math.ceil(totalDuration) + 1 }).map((_, i) => (
            <div key={i} className="shrink-0 border-l border-border text-[9px] text-textMuted px-1" style={{ width: pxPerSec }}>
              {i}s
            </div>
          ))}
        </div>
        {store.tracks.map((track) => (
          <div
            key={track.id}
            className="flex border-b border-border"
            onDragOver={(e) => onDragOver(e, track.id)}
            onDrop={(e) => onDrop(e, track.id)}
          >
            <div className="w-28 shrink-0 bg-elevated border-r border-border px-2 py-1 text-xs flex items-center">
              {track.name}
            </div>
            <div className="relative h-10 flex-1" style={{ width: totalDuration * pxPerSec }}>
              {/* lay clips sequentially */}
              {(() => {
                let x = 0;
                return track.clips.map((clip) => {
                  const dur = Math.max(0.5, clip.end - clip.start);
                  const w = dur * pxPerSec;
                  const left = x;
                  x += w;
                  const selected = store.selectedClipId === clip.id;
                  return (
                    <div
                      key={clip.id}
                      className={`absolute top-1 h-8 rounded text-[10px] px-1 flex items-center cursor-pointer border ${selected ? 'border-active bg-active/20' : 'border-border bg-elevated'}`}
                      style={{ left, width: w }}
                      onClick={() => onClipClick(clip.id)}
                      onDoubleClick={() => removeClip(clip.id)}
                      title={`${clip.name} (dbl-click remove)`}
                    >
                      <span className="truncate">{clip.name}</span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        ))}
        {/* playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-active pointer-events-none z-20"
          style={{ left: 112 + store.playhead / 1000 * pxPerSec }}
        />
      </div>
      {store.tracks.length === 0 && (
        <div className="text-xs text-textMuted text-center p-4">Belum ada track. Tambah track atau drag media ke sini.</div>
      )}
    </div>
  );
};
