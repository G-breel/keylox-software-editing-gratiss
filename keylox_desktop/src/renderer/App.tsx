import React, { useState, useEffect, useCallback } from 'react';
import { TopBar } from './components/TopBar';
import { MediaPanel } from './components/MediaPanel';
import { PreviewPlayer } from './components/PreviewPlayer';
import { Timeline } from './components/Timeline';
import { Inspector } from './components/Inspector';
import { PromptBar } from './components/PromptBar';
import { StatusBar } from './components/StatusBar';
import { ExportDialog } from './components/ExportDialog';
import { SettingsModal } from './components/SettingsModal';
import { ToastHost } from './components/ToastHost';
import { useEditorStore } from './stores/editorStore';
import { useProjectFiles } from './hooks/useProjectFiles';
import { api } from './lib/ipc';
import { uid } from './lib/utils';
import { splitClipAt, totalDurationSec } from './lib/timeline';
import { toastInfo } from './lib/toast';

export const App: React.FC = () => {
  const store = useEditorStore();
  const projects = useProjectFiles();
  const [exportOpen, setExportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [promptSeed, setPromptSeed] = useState<{ text: string; id: number } | null>(null);
  const [autosaveDismissed, setAutosaveDismissed] = useState(false);

  const openFiles = useCallback(async () => {
    const paths = await api.openFiles();
    if (paths?.length) {
      const items = paths.map((p) => ({ id: crypto.randomUUID(), name: p.split(/[\\/]/).pop() || p, path: p }));
      store.addMedia(items as any);
    }
  }, [store]);

  const openFolder = useCallback(async () => {
    const dir = await api.openFolder();
    if (!dir) return;
    const entries = await api.readDir(dir);
    const media = entries.filter((e) => !e.isDir && /\.(mp4|mov|mkv|avi|webm|mp3|wav|aac|png|jpg|jpeg|gif)$/i.test(e.name));
    const items = media.map((e) => ({ id: crypto.randomUUID(), name: e.name, path: e.path }));
    store.addMedia(items as any);
  }, [store]);

  // Keyboard shortcuts + hydration marker for E2E (tests/e2e/helpers/electronApp.ts:
  // `html[data-app-ready="true"]`). Setelah store tersedia, bukan setelah timer.
  useEffect(() => {
    document.documentElement.dataset.appReady = 'true';
  }, []);

  /** Aksi jobType dari Settings mengisi bilah perintah (R2.3). */
  const handleUsePrompt = useCallback((text: string) => {
    setPromptSeed({ text, id: Date.now() });
    setSettingsOpen(false);
  }, []);

  const splitSelected = useCallback(() => {
    const state = useEditorStore.getState();
    const clip = state.getSelectedClip();
    if (!clip) {
      toastInfo('Pilih klip yang akan dipotong.');
      return;
    }
    const at = state.playhead / 1000;
    if (!splitClipAt(clip, at, 'check')) {
      toastInfo('Playhead harus berada di dalam klip (bukan di tepi).');
      return;
    }
    state.splitClip(clip.id, at, uid());
  }, []);

  const duplicateSelected = useCallback(() => {
    const state = useEditorStore.getState();
    const clip = state.getSelectedClip();
    if (clip) state.duplicateClip(clip.id, uid());
  }, []);

  const requestNewProject = useCallback(() => {
    if (projects.dirty && !window.confirm('Proyek belum disimpan. Buat proyek baru dan buang perubahan?')) return;
    projects.newProject();
  }, [projects]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (key === 's') {
          e.preventDefault();
          void projects.save(e.shiftKey);
          return;
        }
        if (key === 'o' && !e.shiftKey) { e.preventDefault(); void projects.open(); return; }
        if (key === 'n') { e.preventDefault(); requestNewProject(); return; }
        if (key === 'd') { e.preventDefault(); duplicateSelected(); return; }
        if (key === 'z' && !e.shiftKey) { e.preventDefault(); store.undo(); return; }
        if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); store.redo(); return; }
        if (key === 'p') {
          e.preventDefault();
          const el = document.querySelector('input[placeholder*="Ketik perintah"]') as HTMLInputElement | null;
          el?.focus();
          return;
        }
        if (key === 'e') { e.preventDefault(); setExportOpen(true); return; }
        if (key === 'i' && !e.shiftKey) { e.preventDefault(); void openFiles(); return; }
        if (key === 'i' && e.shiftKey) { e.preventDefault(); void openFolder(); return; }
        if (e.key === ',') { e.preventDefault(); setSettingsOpen(true); return; }
        if (e.key === '+' || e.key === '=') { e.preventDefault(); store.zoomIn(); return; }
        if (e.key === '-' || e.key === '_') { e.preventDefault(); store.zoomOut(); return; }
        if (e.key === '0') { e.preventDefault(); useEditorStore.getState().setZoom(40); return; }
      }
      if (inInput) return;

      if (e.code === 'Space') { e.preventDefault(); store.setPlaying(!store.isPlaying); return; }
      if (e.key === 'Home') { e.preventDefault(); store.setPlayhead(0); return; }
      if (e.key === 'End') {
        e.preventDefault();
        store.setPlayhead(totalDurationSec(store.tracks) * 1000);
        return;
      }
      if (e.key.toLowerCase() === 's') { e.preventDefault(); splitSelected(); return; }
      if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        const state = useEditorStore.getState();
        const clip = state.getSelectedClip();
        const track = clip
          ? state.tracks.find((t) => t.id === clip.trackId)
          : state.tracks.find((t) => t.type === 'audio');
        if (track) state.updateTrack(track.id, { muted: !track.muted });
        return;
      }
      if (e.key.toLowerCase() === 'n') { e.preventDefault(); store.toggleSnap(); return; }
      if (e.key === '+' || e.key === '=') { store.zoomIn(); return; }
      if (e.key === '-' || e.key === '_') { store.zoomOut(); return; }
      if (e.key.toLowerCase() === 'j') { /* shuttle back placeholder */ return; }
      if (e.key.toLowerCase() === 'k') { store.setPlaying(false); return; }
      if (e.key.toLowerCase() === 'l') { store.setPlaying(true); return; }
      if (e.key.toLowerCase() === 'i') {
        const c = store.getSelectedClip();
        if (c) store.updateClip(c.id, { start: Math.min(store.playhead / 1000, c.end - 0.1) });
        return;
      }
      if (e.key.toLowerCase() === 'o') {
        const c = store.getSelectedClip();
        if (c) store.updateClip(c.id, { end: Math.max(store.playhead / 1000, c.start + 0.1) });
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const c = store.getSelectedClip();
        if (c) store.removeClip(c.id);
        return;
      }
      if (e.key === 'Escape') { store.selectClip(null); setExportOpen(false); setSettingsOpen(false); return; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [store, openFiles, openFolder, projects, duplicateSelected, requestNewProject, splitSelected]);

  // drag-drop global
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => { window.removeEventListener('dragover', prevent); window.removeEventListener('drop', prevent); };
  }, []);

  const autosave = projects.recent.autosave;
  const showAutosaveBanner = Boolean(autosave?.available && !autosaveDismissed);

  return (
    <div className="h-screen flex flex-col bg-app" data-testid="app-ready">
      <TopBar
        onOpenFiles={openFiles}
        onOpenFolder={openFolder}
        onExport={() => setExportOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        onNewProject={requestNewProject}
        onOpenProject={() => { void projects.open(); }}
        onSaveProject={(saveAs) => { void projects.save(saveAs); }}
        onRelink={() => { void projects.relink(); }}
        projectName={projects.filePath}
        dirty={projects.dirty}
        busy={projects.busy}
        missingCount={projects.missing.length}
      />
      {showAutosaveBanner && (
        <div className="flex items-center gap-2 border-b border-border bg-elevated px-3 py-1.5 text-xs text-textPrimary">
          <span className="text-warning">Autosave ditemukan</span>
          <span className="text-textMuted truncate">
            {autosave?.corrupt
              ? 'Berkas autosave rusak.'
              : `${autosave?.name || 'Proyek'}${autosave?.savedAt ? ` · ${new Date(autosave.savedAt).toLocaleString('id-ID')}` : ''}${typeof autosave?.clipCount === 'number' ? ` · ${autosave.clipCount} klip` : ''}`}
          </span>
          <div className="flex-1" />
          {!autosave?.corrupt && (
            <button
              type="button"
              className="rounded bg-active px-2 py-0.5 text-[11px] font-semibold text-white transition-colors duration-150 ease-out hover:brightness-110"
              onClick={() => { setAutosaveDismissed(true); void projects.recoverAutosave(); }}
            >Pulihkan</button>
          )}
          <button
            type="button"
            className="rounded bg-panel px-2 py-0.5 text-[11px] text-textMuted border border-border transition-colors duration-150 ease-out hover:text-textPrimary"
            onClick={() => { setAutosaveDismissed(true); void projects.discardAutosave(); }}
          >Abaikan</button>
        </div>
      )}
      {projects.missing.length > 0 && (
        <div className="flex items-center gap-2 border-b border-border bg-warning/10 px-3 py-1.5 text-xs text-textPrimary">
          <span className="text-warning">{projects.missing.length} media hilang/berubah.</span>
          <span className="text-textMuted">Pilih berkas pengganti agar klip kembali tampil.</span>
          <div className="flex-1" />
          <button
            type="button"
            className="rounded bg-warning/20 px-2 py-0.5 text-[11px] text-warning border border-warning/40 transition-colors duration-150 ease-out hover:bg-warning/30"
            onClick={() => { void projects.relink(); }}
          >Relink media</button>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <MediaPanel />
        <div className="flex-1 flex flex-col overflow-hidden">
          <PreviewPlayer />
          <Timeline />
        </div>
        <Inspector onExport={() => setExportOpen(true)} />
      </div>
      <PromptBar
        onExport={() => setExportOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        seed={promptSeed}
      />
      <StatusBar />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} onUsePrompt={handleUsePrompt} />
      <ToastHost />
    </div>
  );
};
