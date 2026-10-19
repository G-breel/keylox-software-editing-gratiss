import React from 'react';
import { useEditorStore } from '../stores/editorStore';

/**
 * Status bar. `data-testid="export-status"` adalah bagian dari kontrak
 * test-id (05-test-plan.md): journey "one prompt" menunggu status ini
 * berubah menjadi "Siap export" tanpa timer.
 */
export const StatusBar: React.FC = () => {
  const store = useEditorStore();
  const hasClips = store.tracks.some((t) => t.clips.length > 0);

  return (
    <div className="h-6 shrink-0 bg-panel border-t border-border flex items-center px-3 text-xs text-textMuted gap-4">
      <span>{store.media.length} media</span>
      <span>{store.tracks.length} track</span>
      <span>AI: {navigator.onLine ? 'online' : 'offline'}</span>
      <span className="ml-auto">Autosave</span>
      <span
        role="status"
        data-testid="export-status"
        className={hasClips ? 'text-success' : 'text-textMuted'}
      >
        {hasClips ? 'Siap export' : 'Belum siap export'}
      </span>
    </div>
  );
};
