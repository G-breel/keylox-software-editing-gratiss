import React, { useState } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { keylox } from '../lib/ipc';

export const AutoCaptionPanel: React.FC = () => {
  const store = useEditorStore();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const run = async () => {
    const clip = store.getSelectedClip();
    if (!clip) { setStatus('Pilih klip dulu.'); return; }
    setBusy(true);
    setStatus('Memproses...');
    try {
      const res = await keylox.ai.autoCaption({ durationSec: clip.end - clip.start });
      const captions = (res && (res as any).captions) || [];
      const overlays = captions.map((c: any, i: number) => ({
        id: crypto.randomUUID(),
        text: c.text,
        start: (c.start ?? 0) / 1000,
        end: (c.end ?? 0) / 1000,
        size: 24,
        color: '#ffffff',
        x: 50,
        y: 85,
      }));
      store.updateClip(clip.id, { textOverlays: [...clip.textOverlays, ...overlays] });
      setStatus(`Caption mock: ${overlays.length} ditambahkan.`);
    } catch (e: any) {
      setStatus('Gagal: ' + (e?.message || 'unknown'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3 text-sm flex flex-col gap-2">
      <button className="px-2 py-1 bg-active text-white text-xs rounded w-fit" onClick={run} disabled={busy}>
        Generate Caption (mock)
      </button>
      {status && <div className="text-xs text-textMuted">{status}</div>}
    </div>
  );
};