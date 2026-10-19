import React, { useState } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { Clip, MediaItem } from '../lib/types';
import { api, describeError } from '../lib/ipc';
import { uid, fileUrl } from '../lib/utils';

const MEDIA_EXT = /\.(mp4|mov|mkv|avi|webm|mp3|wav|aac|png|jpg|jpeg|gif)$/i;

/**
 * Media panel. Selain picker OS, tersedia affordance import-by-path
 * (`data-testid="import-dialog-path"`) untuk pengujian E2E — dialog file
 * native tidak bisa dikendalikan Playwright (05-test-plan.md, test-id contract).
 */
export const MediaPanel: React.FC = () => {
  const store = useEditorStore();
  const [importOpen, setImportOpen] = useState(false);
  const [importPath, setImportPath] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const importPaths = async (paths: string[]): Promise<MediaItem[]> => {
    const items: MediaItem[] = [];
    for (const p of paths) {
      const meta: any = await api.probe(p).catch(() => null);
      const dur = meta?.format?.duration ? parseFloat(meta.format.duration) : undefined;
      items.push({ id: uid(), name: p.split(/[\\/]/).pop() || p, path: p, duration: dur });
    }
    if (items.length) store.addMedia(items);
    return items;
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
    const current = useEditorStore.getState();
    const track = current.tracks.find((t) => t.type === 'video') || current.tracks[0];
    if (!track) return;
    const dur = item.duration || 5;
    const clip: Clip = {
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
    current.addClip(track.id, clip);
  };

  const importByPath = async () => {
    const path = importPath.trim();
    if (!path) {
      setImportError('Isi path file terlebih dahulu.');
      return;
    }
    setImportBusy(true);
    setImportError(null);
    try {
      const items = await importPaths([path]);
      const item = items[0];
      if (item) addToTimeline(item);
      setImportPath('');
      setImportOpen(false);
    } catch (e) {
      setImportError(describeError(e).message);
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <div
      className="w-[280px] shrink-0 bg-panel border-r border-border flex flex-col overflow-hidden"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="flex items-center gap-1 p-2 border-b border-border">
        <button className="rounded bg-elevated px-2 py-1 text-xs transition-colors duration-150 ease-out hover:bg-border" onClick={() => setImportOpen(true)}>
          Import
        </button>
        <button className="rounded bg-elevated px-2 py-1 text-xs transition-colors duration-150 ease-out hover:bg-border" onClick={openFolder}>
          Folder
        </button>
        <span className="ml-auto text-xs text-textMuted">{store.media.length} media</span>
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
            className="bg-elevated rounded p-1 cursor-grab transition-colors duration-150 ease-out hover:ring-1 hover:ring-active"
            draggable
            onDragStart={(e) => onDragStart(e, item)}
            onClick={() => addToTimeline(item)}
            title={item.path}
          >
            <div className="aspect-video bg-black rounded overflow-hidden flex items-center justify-center text-textMuted text-[10px]">
              {item.name.match(/\.(png|jpg|jpeg|gif)$/i) ? (
                <img src={fileUrl(item.path)} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                <span>Media</span>
              )}
            </div>
            <div className="text-[10px] text-textMuted truncate mt-1">{item.name}</div>
          </div>
        ))}
      </div>

      {importOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
          onClick={() => { if (!importBusy) setImportOpen(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Import media"
            className="w-[420px] rounded-lg border border-border bg-panel p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-sm font-semibold text-textPrimary">Import media</h2>
            <label htmlFor="importPath" className="mb-1 block text-[10px] uppercase tracking-wide text-textMuted">
              Path file
            </label>
            <input
              id="importPath"
              data-testid="import-dialog-path"
              value={importPath}
              onChange={(e) => setImportPath(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void importByPath(); } }}
              placeholder="C:\video\klip.mp4"
              className="w-full font-mono text-xs"
              autoFocus
            />
            {importError && <p className="mt-1 text-[11px] text-danger">{importError}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded bg-elevated px-3 py-1.5 text-xs transition-colors duration-150 ease-out hover:bg-border"
                onClick={openFiles}
                disabled={importBusy}
              >
                Pilih file…
              </button>
              <button
                type="button"
                className="rounded bg-active px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-150 ease-out disabled:opacity-40"
                onClick={() => void importByPath()}
                disabled={importBusy}
              >
                {importBusy ? 'Menambahkan…' : 'Tambahkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
