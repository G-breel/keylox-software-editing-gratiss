import React, { useRef } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { MediaItem } from '../lib/types';
import { api } from '../lib/ipc';
import { uid, fileUrl } from '../lib/utils';

const MEDIA_EXT = /\.(mp4|mov|mkv|avi|webm|mp3|wav|aac|png|jpg|jpeg|gif)$/i;

export const MediaPanel: React.FC = () => {
  const store = useEditorStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importPaths = async (paths: string[]) => {
    const items: MediaItem[] = [];
    for (const p of paths) {
      const meta: any = await api.probe(p).catch(() => null);
      const dur = meta?.format?.duration ? parseFloat(meta.format.duration) : undefined;
      items.push({ id: uid(), name: p.split(/[\\/]/).pop() || p, path: p, duration: dur });
    }
    store.addMedia(items);
  };

  const openFiles = async () => {
    const paths = await api.openFiles();
    if (paths?.length) await importPaths(paths);
  };

  const openFolder = async () => {
    const dir = await api.openFolder();
    if (!dir) return;
    const entries = await api.readDir(dir);
    const media = entries.filter((e) => !e.isDir && MEDIA_EXT.test(e.name));
    await importPaths(media.map((e) => e.path));
  };

  // drag & drop from OS
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files) as any[];
    const paths = files.map((f) => f.path).filter(Boolean);
    if (paths.length) await importPaths(paths);
  };

  const onDragStart = (e: React.DragEvent, item: MediaItem) => {
    e.dataTransfer.setData('application/x-keylox-media', JSON.stringify(item));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const addToTimeline = (item: MediaItem) => {
    const track = store.tracks.find((t) => t.type === 'video') || store.tracks[0];
    if (!track) return;
    const dur = item.duration || 5;
    const clip = {
      id: uid(),
      mediaId: item.id,
      name: item.name,
      path: item.path,
      trackId: track.id,
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
    store.addClip(track.id, clip as any);
  };

  return (
    <div
      className="w-[280px] shrink-0 bg-panel border-r border-border flex flex-col overflow-hidden"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="flex items-center gap-1 p-2 border-b border-border">
        <button className="px-2 py-1 bg-elevated text-xs rounded" onClick={openFiles}>Import</button>
        <button className="px-2 py-1 bg-elevated text-xs rounded" onClick={openFolder}>Folder</button>
        <span className="text-xs text-textMuted ml-auto">{store.media.length} media</span>
      </div>
      <div className="flex-1 overflow-auto p-2 grid grid-cols-2 gap-2 content-start">
        {store.media.length === 0 && (
          <div className="col-span-2 text-xs text-textMuted text-center mt-8">
            Belum ada media. Drag file/folder ke sini atau klik Import.
          </div>
        )}
        {store.media.map((item) => (
          <div
            key={item.id}
            className="bg-elevated rounded p-1 cursor-grab hover:ring-1 hover:ring-active"
            draggable
            onDragStart={(e) => onDragStart(e, item)}
            onClick={() => addToTimeline(item)}
            title={item.path}
          >
            <div className="aspect-video bg-black rounded overflow-hidden flex items-center justify-center text-textMuted text-[10px]">
              {item.name.match(/\.(png|jpg|jpeg|gif)$/i) ? (
                <img src={fileUrl(item.path)} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                <span>🎬</span>
              )}
            </div>
            <div className="text-[10px] text-textMuted truncate mt-1">{item.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
