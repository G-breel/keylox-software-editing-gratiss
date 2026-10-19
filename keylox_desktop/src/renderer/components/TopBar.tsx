import React from 'react';
import { useEditorStore } from '../stores/editorStore';

export interface TopBarProps {
  onOpenFiles: () => void;
  onOpenFolder: () => void;
  onExport: () => void;
  onSettings: () => void;
  onNewProject: () => void;
  onOpenProject: () => void;
  onSaveProject: (saveAs?: boolean) => void;
  onRelink: () => void;
  projectName: string | null;
  dirty: boolean;
  busy: boolean;
  missingCount: number;
}

export const TopBar: React.FC<TopBarProps> = ({
  onOpenFiles,
  onOpenFolder,
  onExport,
  onSettings,
  onNewProject,
  onOpenProject,
  onSaveProject,
  onRelink,
  projectName,
  dirty,
  busy,
  missingCount,
}) => {
  const store = useEditorStore();
  return (
    <div className="h-10 flex items-center gap-2 px-3 border-b border-border bg-panel shrink-0">
      <span className="text-active font-bold text-lg">Keylox</span>
      <div className="flex gap-1">
        <button className="px-2 py-1 bg-elevated text-textPrimary rounded text-xs transition-colors duration-150 ease-out hover:bg-border" onClick={onNewProject} title="Proyek baru (Ctrl+N)">Baru</button>
        <button className="px-2 py-1 bg-elevated text-textPrimary rounded text-xs transition-colors duration-150 ease-out hover:bg-border" onClick={onOpenProject} title="Buka proyek (Ctrl+O)">Buka</button>
        <button className="px-2 py-1 bg-elevated text-textPrimary rounded text-xs transition-colors duration-150 ease-out hover:bg-border disabled:opacity-40" onClick={() => onSaveProject(false)} disabled={busy} title="Simpan (Ctrl+S)">Simpan</button>
        <button className="px-2 py-1 bg-elevated text-textPrimary rounded text-xs transition-colors duration-150 ease-out hover:bg-border disabled:opacity-40" onClick={() => onSaveProject(true)} disabled={busy} title="Simpan sebagai (Ctrl+Shift+S)">Simpan sebagai</button>
        {missingCount > 0 && (
          <button className="px-2 py-1 bg-warning/20 text-warning rounded text-xs border border-warning/40 transition-colors duration-150 ease-out hover:bg-warning/30" onClick={onRelink} title="Relink media yang hilang">
            Relink ({missingCount})
          </button>
        )}
        <button className="px-2 py-1 bg-elevated text-textPrimary rounded text-xs transition-colors duration-150 ease-out hover:bg-border" onClick={onOpenFiles}>+ Files</button>
        <button className="px-2 py-1 bg-elevated text-textPrimary rounded text-xs transition-colors duration-150 ease-out hover:bg-border" onClick={onOpenFolder}>Folder</button>
      </div>
      <span className="mx-1 flex items-center gap-1.5 min-w-0">
        <span className="truncate text-textPrimary text-xs max-w-[240px]" title={projectName || undefined}>
          {store.name}
        </span>
        <span className="truncate text-textMuted text-[10px] max-w-[200px]" title={projectName || undefined}>
          {projectName || 'belum disimpan'}
        </span>
        {dirty && <span className="h-1.5 w-1.5 rounded-full bg-warning" title="Belum disimpan" />}
      </span>
      <div className="flex-1" />
      <button className="px-2 py-1 bg-elevated text-textPrimary rounded text-xs disabled:opacity-40 transition-colors duration-150 ease-out hover:bg-border" disabled={!store.canUndo()} onClick={() => store.undo()}>Undo</button>
      <button className="px-2 py-1 bg-elevated text-textPrimary rounded text-xs disabled:opacity-40 transition-colors duration-150 ease-out hover:bg-border" disabled={!store.canRedo()} onClick={() => store.redo()}>Redo</button>
      <button className="px-3 py-1 bg-active text-white rounded text-xs font-semibold transition-colors duration-150 ease-out hover:brightness-110" onClick={onExport}>Export</button>
      <button className="px-2 py-1 bg-elevated text-textPrimary rounded text-xs transition-colors duration-150 ease-out hover:bg-border" onClick={onSettings}>Settings</button>
    </div>
  );
};
