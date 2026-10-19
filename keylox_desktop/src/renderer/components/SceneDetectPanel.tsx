import React, { useState } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { keylox } from '../lib/ipc';

export const SceneDetectPanel: React.FC = () => {
  const store = useEditorStore();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const run = async () => {
    const clip = store.getSelectedClip();
    if (!clip) { setStatus('Pilih klip dulu.'); return; }
    setBusy(true);
    setStatus('Memproses...');
    try {
      const res = await keylox.ai.sceneDetect({ durationSec: clip.end - clip.start });
      const scenes = (res && (res as any).scenes) || [];
      setStatus(`Scene mock: ${scenes.length} terdeteksi.`);
    } catch (e: any) {
      setStatus('Gagal: ' + (e?.message || 'unknown'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3 text-sm flex flex-col gap-2">
      <button className="px-2 py-1 bg-active text-white text-xs rounded w-fit" onClick={run} disabled={busy}>
        Deteksi Scene (mock)
      </button>
      {status && <div className="text-xs text-textMuted">{status}</div>}
    </div>
  );
};