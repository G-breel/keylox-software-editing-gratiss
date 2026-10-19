import React from 'react';
import { useEditorStore } from '../stores/editorStore';

export const StatusBar: React.FC = () => {
  const store = useEditorStore();
  return (
    <div className="h-6 shrink-0 bg-panel border-t border-border flex items-center px-3 text-xs text-textMuted gap-4">
      <span>{store.media.length} media</span>
      <span>{store.tracks.length} track</span>
      <span>AI: {navigator.onLine ? 'online' : 'offline'}</span>
      <span className="ml-auto">Autosave</span>
    </div>
  );
};
