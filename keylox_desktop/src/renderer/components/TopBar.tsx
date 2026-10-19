import React from 'react';
import { useEditorStore } from '../stores/editorStore';

export const TopBar: React.FC<{ onOpenFiles: () => void; onOpenFolder: () => void; onExport: () => void; onSettings: () => void; }> = ({ onOpenFiles, onOpenFolder, onExport, onSettings }) => {
  const store = useEditorStore();
  const name = store.name;
  return (
    <div className="h-10 flex items-center gap-2 px-3 border-b border-border bg-panel shrink-0">
      <span className="text-active font-bold text-lg">Keylox</span>
      <div className="flex gap-1">
        <button className="px-3 py-1 bg-elevated text-textPrimary rounded text-xs hover:bg-panel" onClick={onOpenFiles}>+ Files</button>
        <button className="px-3 py-1 bg-elevated text-textPrimary rounded text-xs hover:bg-panel" onClick={onOpenFolder}>Folder</button>
      </div>
      <span className="mx-2 text-textMuted text-xs">{name}</span>
      <div className="flex-1" />
      <button className="px-2 py-1 bg-elevated text-textPrimary rounded text-xs disabled:opacity-40" disabled={!store.canUndo()} onClick={() => store.undo()}>Undo</button>
      <button className="px-2 py-1 bg-elevated text-textPrimary rounded text-xs disabled:opacity-40" disabled={!store.canRedo()} onClick={() => store.redo()}>Redo</button>
      <span className="font-mono text-xs text-textMuted mx-2">00:00:00:00</span>
      <button className="px-3 py-1 bg-active text-white rounded text-xs font-semibold" onClick={onExport}>Export</button>
      <button className="px-2 py-1 bg-elevated text-textPrimary rounded text-xs" onClick={onSettings}>⚙</button>
    </div>
  );
};
