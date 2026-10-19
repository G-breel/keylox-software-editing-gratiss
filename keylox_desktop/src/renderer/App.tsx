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
import { api } from './lib/ipc';

export const App: React.FC = () => {
  const store = useEditorStore();
  const [exportOpen, setExportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [promptSeed, setPromptSeed] = useState<{ text: string; id: number } | null>(null);

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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); store.undo(); return; }
        if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) { e.preventDefault(); store.redo(); return; }
        if (e.key.toLowerCase() === 's') { e.preventDefault(); store.pushHistory(); return; }
        if (e.key.toLowerCase() === 'p') { e.preventDefault(); const el = document.querySelector('input[placeholder*="Ketik perintah"]') as HTMLInputElement; el?.focus(); return; }
        if (e.key.toLowerCase() === 'e') { e.preventDefault(); setExportOpen(true); return; }
        if (e.key.toLowerCase() === 'i') { e.preventDefault(); openFiles(); return; }
        if (e.shiftKey && e.key.toLowerCase() === 'i') { e.preventDefault(); openFolder(); return; }
        if (e.key === ',') { e.preventDefault(); setSettingsOpen(true); return; }
      }
      if (inInput) return;
      if (e.code === 'Space') { e.preventDefault(); store.setPlaying(!store.isPlaying); return; }
      if (e.key.toLowerCase() === 'j') { /* shuttle back placeholder */ return; }
      if (e.key.toLowerCase() === 'k') { store.setPlaying(false); return; }
      if (e.key.toLowerCase() === 'l') { store.setPlaying(true); return; }
      if (e.key.toLowerCase() === 'i') { /* mark in */ const c = store.getSelectedClip(); if (c) store.updateClip(c.id, { start: store.playhead / 1000 }); return; }
      if (e.key.toLowerCase() === 'o') { const c = store.getSelectedClip(); if (c) store.updateClip(c.id, { end: store.playhead / 1000 }); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const c = store.getSelectedClip();
        if (c) { store.removeClip(c.id); }
        return;
      }
      if (e.key === 'Escape') { store.selectClip(null); setExportOpen(false); setSettingsOpen(false); return; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [store, openFiles, openFolder]);

  // drag-drop global
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => { window.removeEventListener('dragover', prevent); window.removeEventListener('drop', prevent); };
  }, []);

  return (
    <div className="h-screen flex flex-col bg-app" data-testid="app-ready">
      <TopBar onOpenFiles={openFiles} onOpenFolder={openFolder} onExport={() => setExportOpen(true)} onSettings={() => setSettingsOpen(true)} />
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
