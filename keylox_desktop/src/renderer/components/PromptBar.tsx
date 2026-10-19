import React, { useCallback, useEffect, useState } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { uid } from '../lib/utils';
import { parseCommand } from '../lib/aiParser';
import { planToCommands, isEditPlanLike, type PlanMappingResult } from '../lib/editPlanToCommands';
import { keylox, describeError, type Provider, type EditPlan } from '../lib/ipc';

/**
 * PromptBar — perintah AI (jalur utama produk, G-01/G-21).
 *
 * Kontrak v1.1:
 *  - TIDAK ADA `fetch` ke provider dari renderer. Semua AI lewat
 *    `window.keylox.ai.invoke` → main process (§2.12 invarian #3, SEC-SECRET-02).
 *  - TIDAK ADA key di renderer; tanpa key → CTA "Atur API Key" (§5.2.1, §6.4).
 *  - Hasil `parse_command` sudah lolos `EditPlanOutputSchema` di main; renderer
 *    memverifikasi ulang bentuknya (§3.3 butir 2) dan menahan plan destruktif
 *    sampai user menekan "Terapkan".
 *  - Parser rule-based offline TETAP jalan tanpa key (§7 byok-api-key.md).
 */

function applyCmd(cmd: any, store: ReturnType<typeof useEditorStore.getState>, onExport: () => void) {
  const clip = store.getSelectedClip();
  switch (cmd.a) {
    case 'trim':
      if (clip) { store.updateClip(clip.id, { start: cmd.start, end: cmd.end !== null ? cmd.end : (clip.end) }); }
      break;
    case 'trimlast':
      if (clip) { store.updateClip(clip.id, { end: Math.max(0, clip.end - cmd.sec) }); }
      break;
    case 'speed':
      if (clip) { store.updateClip(clip.id, { speed: cmd.v }); }
      break;
    case 'rotate':
      if (clip) { store.updateClip(clip.id, { transform: { ...clip.transform, rotate: cmd.deg % 360 } }); }
      break;
    case 'flipH':
      if (clip) { store.updateClip(clip.id, { transform: { ...clip.transform, flipH: !clip.transform.flipH } }); }
      break;
    case 'flipV':
      if (clip) { store.updateClip(clip.id, { transform: { ...clip.transform, flipV: !clip.transform.flipV } }); }
      break;
    case 'brightness':
      if (clip) { store.updateClip(clip.id, { filters: { ...clip.filters, brightness: cmd.v } }); }
      break;
    case 'contrast':
      if (clip) { store.updateClip(clip.id, { filters: { ...clip.filters, contrast: cmd.v } }); }
      break;
    case 'saturation':
      if (clip) { store.updateClip(clip.id, { filters: { ...clip.filters, saturation: cmd.v } }); }
      break;
    case 'blur':
      if (clip) { store.updateClip(clip.id, { filters: { ...clip.filters, blur: cmd.v } }); }
      break;
    case 'grayscale':
      if (clip) { store.updateClip(clip.id, { filters: { ...clip.filters, grayscale: true, saturation: 0 } }); }
      break;
    case 'sepia':
      if (clip) { store.updateClip(clip.id, { filters: { ...clip.filters, sepia: true, saturation: 0.6 } }); }
      break;
    case 'vivid':
      if (clip) { store.updateClip(clip.id, { filters: { ...clip.filters, saturation: 1.5, contrast: 1.2, brightness: 1.1 } }); }
      break;
    case 'crop':
      if (clip) { store.updateClip(clip.id, { transform: { ...clip.transform, crop: { x: cmd.x, y: cmd.y, w: cmd.w, h: cmd.h } } }); }
      break;
    case 'scale':
      if (clip) { store.updateClip(clip.id, { transform: { ...clip.transform, scale: { w: cmd.w, h: cmd.h } } }); }
      break;
    case 'reverse':
      if (clip) { store.updateClip(clip.id, { transform: { ...clip.transform, reverse: true } }); }
      break;
    case 'text':
      if (clip) {
        store.updateClip(clip.id, { textOverlays: [...clip.textOverlays, { id: uid(), text: cmd.text, start: cmd.at || 0, end: (cmd.at || 0) + 5, size: cmd.size || 24, color: cmd.color || '#ffffff', x: 50, y: 85 }] });
      }
      break;
    case 'mute':
      if (clip) { store.updateClip(clip.id, { muted: true }); }
      break;
    case 'removeAudio':
      if (clip) { store.updateClip(clip.id, { removeAudio: true }); }
      break;
    case 'fade':
      if (clip) { store.updateClip(clip.id, { fadeIn: cmd.in, fadeOut: cmd.out }); }
      break;
    case 'chroma':
      if (clip) { store.updateClip(clip.id, { chroma: true }); }
      break;
    case 'resetFilter':
      if (clip) { store.updateClip(clip.id, { filters: { brightness: 1, contrast: 1, saturation: 1, hue: 0, blur: 0, sharpen: 0, grayscale: false, sepia: false } }); }
      break;
    case 'resetTrim':
      if (clip) { store.updateClip(clip.id, { start: 0, end: clip.end }); }
      break;
    case 'resetAll':
      if (clip) { store.updateClip(clip.id, { start: 0, end: clip.end, speed: 1, filters: { brightness: 1, contrast: 1, saturation: 1, hue: 0, blur: 0, sharpen: 0, grayscale: false, sepia: false }, transform: { rotate: 0, flipH: false, flipV: false, crop: null, scale: null, reverse: false }, textOverlays: [] }); }
      break;
    case 'volume':
      if (clip) { store.updateClip(clip.id, { volume: cmd.v }); }
      break;
    case 'export':
      onExport();
      break;
    default:
      break;
  }
}

interface PendingPlan {
  plan: EditPlan;
  mapping: PlanMappingResult;
}

export const PromptBar: React.FC<{ onExport: () => void; onOpenSettings?: () => void }> = ({ onExport, onOpenSettings }) => {
  const store = useEditorStore();
  const [text, setText] = useState('');
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [provider, setProvider] = useState<Provider>('gemini');
  const [pending, setPending] = useState<PendingPlan | null>(null);

  const refreshKeyStatus = useCallback(async () => {
    try {
      const stored = await keylox.settings.get({ key: 'provider' });
      const activeProvider: Provider = stored === 'openai' ? 'openai' : 'gemini';
      setProvider(activeProvider);
      const res = await keylox.settings.hasSecret({ provider: activeProvider });
      setHasKey(res.hasKey === true);
    } catch {
      setHasKey(false);
    }
  }, []);

  useEffect(() => {
    void refreshKeyStatus();
    // §2.12.6 — key bisa diubah dari window lain.
    const onChange = () => { void refreshKeyStatus(); };
    window.addEventListener('keylox:secretChanged', onChange);
    return () => window.removeEventListener('keylox:secretChanged', onChange);
  }, [refreshKeyStatus]);

  const runLines = (lines: string[]) => {
    lines.forEach((line) => {
      const cmd = parseCommand(line);
      if (!cmd) { console.log('unknown', line); return; }
      applyCmd(cmd, store, onExport);
    });
  };

  const applyPlan = useCallback((mapping: PlanMappingResult) => {
    mapping.commands.forEach((cmd) => applyCmd(cmd, store, onExport));
  }, [store, onExport]);

  /** Jalur AI (satu-satunya): main process → provider/backend. Tanpa key di renderer. */
  const askAi = async (rawText: string) => {
    setErrorMsg('');
    setPending(null);
    setStatus('memahami');

    if (!hasKey) {
      setStatus('perlu-key');
      setErrorMsg('Belum ada API key. Perintah rule-based tetap jalan; perintah bebas butuh key.');
      return;
    }

    try {
      const context = {
        timelineSummary: `${store.tracks.length} track, ${store.tracks.reduce((n, t) => n + t.clips.length, 0)} klip, playhead ${Math.round(store.playhead)}ms`,
        selectedClipIds: store.selectedClipId ? [store.selectedClipId] : [],
        playheadMs: Math.round(store.playhead),
        projectAspectRatio: store.aspectRatio,
        availableAssetsSummary: `${store.media.length} aset`,
        recentCommands: [],
      };

      const res = await keylox.ai.invoke({
        provider,
        jobType: 'parse_command',
        payload: { rawText, inputMode: 'text', language: 'auto', context },
      });

      const plan = res?.result as unknown;
      if (!isEditPlanLike(plan)) {
        setStatus('error');
        setErrorMsg('Rencana dari AI tidak berbentuk EditPlan yang valid.');
        return;
      }

      const mapping = planToCommands(plan);
      if (mapping.commands.length === 0) {
        setStatus('error');
        setErrorMsg(
          `AI tidak menemukan operasi yang bisa diterapkan${mapping.unsupported.length ? ` (${mapping.unsupported.map((u) => u.opType).join(', ')} belum didukung editor)` : ''}.`
        );
        return;
      }

      // Op kelas D: tahan sampai user menekan "Terapkan" (AC-3, §3.3).
      if (plan.requiresConfirm || plan.isDestructive) {
        setPending({ plan, mapping });
        setStatus('konfirmasi');
        return;
      }

      applyPlan(mapping);
      setStatus(`siap (${mapping.commands.length} operasi)`);
      if (mapping.unsupported.length) {
        setErrorMsg(`Sebagian op belum didukung editor: ${mapping.unsupported.map((u) => u.opType).join(', ')}.`);
      }
    } catch (e) {
      const view = describeError(e);
      setErrorMsg(view.message);
      if (view.needsApiKey) { setHasKey(false); setStatus('perlu-key'); return; }
      setStatus(view.retryable ? 'error-retry' : 'error');
    }
  };

  const handleRun = () => {
    const lines = text.split('\n').filter((l) => l.trim());
    if (lines.length === 0) return;
    // Rule-based dulu (offline, tanpa key); sisanya ke AI via main.
    const parsed = lines.map(parseCommand);
    if (parsed.every((p) => p)) {
      runLines(lines);
    } else {
      void askAi(text.trim());
    }
  };

  const statusLabel: Record<string, string> = {
    idle: 'idle',
    memahami: 'memahami',
    konfirmasi: 'konfirmasi',
    'perlu-key': 'perlu key',
    'error-retry': 'gagal (bisa diulang)',
    error: 'error',
  };
  const statusText = status.startsWith('siap') ? status : (statusLabel[status] || status);
  const isBusy = status === 'memahami';

  return (
    <div className="shrink-0 bg-panel border-t border-border">
      {pending && (
        <div role="dialog" aria-label="Ringkasan rencana AI" className="border-b border-border bg-elevated/40 px-3 py-2 text-xs">
          <h3 className="font-semibold mb-1">Ringkasan perubahan</h3>
          <p className="text-textMuted mb-2">{pending.plan.diffSummary}</p>
          <p className="text-textMuted mb-2">
            {pending.mapping.commands.length} operasi siap diterapkan
            {pending.mapping.unsupported.length ? `, ${pending.mapping.unsupported.length} belum didukung` : ''}.
          </p>
          <div className="flex gap-2">
            <button
              className="px-3 py-1.5 bg-active text-white rounded font-semibold"
              onClick={() => { applyPlan(pending.mapping); setPending(null); setStatus(`siap (${pending.mapping.commands.length} operasi)`); }}
            >
              Terapkan
            </button>
            <button className="px-3 py-1.5 bg-elevated rounded" onClick={() => { setPending(null); setStatus('idle'); }}>
              Batal
            </button>
          </div>
        </div>
      )}

      {errorMsg && <p className="px-3 pt-2 text-xs text-warning" aria-live="polite">{errorMsg}</p>}

      <div className="h-14 flex items-center gap-2 px-3">
        <button className="px-2 py-1 bg-elevated rounded text-xs" title="Mic (not implemented)">🎤</button>
        <span className={`text-xs px-2 py-0.5 rounded ${status === 'idle' ? 'bg-elevated text-textMuted' : 'bg-warning/20 text-warning'}`}>{statusText}</span>
        <input
          aria-label="Perintah AI"
          className="flex-1 bg-elevated border border-border rounded px-3 py-1.5 text-sm"
          placeholder="Ketik perintah... (Ctrl+P)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleRun(); } }}
        />
        {!hasKey && (
          <button className="px-3 py-1.5 bg-elevated text-xs rounded" onClick={() => onOpenSettings?.()}>
            Atur API Key
          </button>
        )}
        <button className="px-3 py-1.5 bg-active text-white text-xs rounded font-semibold" onClick={handleRun} disabled={isBusy}>
          Jalankan
        </button>
        {status === 'error-retry' && (
          <button className="px-3 py-1.5 bg-elevated text-xs rounded" onClick={() => void askAi(text.trim())}>Coba lagi</button>
        )}
        <button className="px-3 py-1.5 bg-elevated text-xs rounded" onClick={() => void askAi(text.trim())} disabled={isBusy}>
          🤖 AI
        </button>
      </div>
    </div>
  );
};
