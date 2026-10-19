import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { uid } from '../lib/utils';
import { parseCommand } from '../lib/aiParser';
import { planToCommands, isEditPlanLike, type PlanMappingResult } from '../lib/editPlanToCommands';
import {
  keylox,
  describeError,
  getSetting,
  type ConsentScope,
  type EditPlan,
  type Provider,
} from '../lib/ipc';
import { DEFAULT_PROVIDER_ID, getProviderInfo, isProviderId, jobTypeLabel, providerIsLocal, providerLabel } from '../lib/providerInfo';
import { toastError, toastSuccess } from '../lib/toast';
import { ConsentDialog } from './ConsentDialog';
import { ErrorBanner } from './ErrorBanner';

/**
 * PromptBar — perintah AI (jalur utama produk, G-01/G-21).
 *
 * Kontrak v1.2:
 *  - TIDAK ADA `fetch` ke provider dari renderer. Semua AI lewat
 *    `window.keylox.ai.invoke` → main process (§2.12 invarian #3, SEC-SECRET-02).
 *  - TIDAK ADA key di renderer; tanpa key → CTA "Atur API Key" (§5.2.1, §6.4).
 *  - Hasil `parse_command` sudah lolos `EditPlanOutputSchema` di main; renderer
 *    memverifikasi ulang bentuknya (§3.3 butir 2) dan menahan plan destruktif
 *    sampai user menekan "Terapkan".
 *  - SATU perintah AI = SATU grup undo (§4.3 butir 7, R6.1).
 *  - `ERR_PRIVACY_CONSENT_REQUIRED` → dialog `privacy:confirmExternal` (§2.15.3);
 *    `ERR_PROVIDER_INCOMPATIBLE` → toast + saran ganti provider/model (§5.2.1).
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

interface ConsentRequest {
  provider: Provider;
  purpose: string;
  mediaContent: boolean;
  reason: string | null;
}

/** Job yang membawa frame/gambar/audio ke cloud (§2.15.3, `privacyService`). */
const MEDIA_CONTENT_JOB_TYPES = new Set(['scene_detect', 'ocr', 'thumbnail', 'vision_color', 'transcribe', 'asr']);

export const PromptBar: React.FC<{
  onExport: () => void;
  onOpenSettings?: () => void;
  /** Saran perintah dari Settings › aksi jobType (R2.3). */
  seed?: { text: string; id: number } | null;
}> = ({ onExport, onOpenSettings, seed }) => {
  const store = useEditorStore();
  const [text, setText] = useState('');
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [errorHint, setErrorHint] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [provider, setProvider] = useState<Provider>(DEFAULT_PROVIDER_ID);
  const [pending, setPending] = useState<PendingPlan | null>(null);

  const [consent, setConsent] = useState<ConsentRequest | null>(null);
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const lastPromptRef = useRef<string>('');

  const refreshKeyStatus = useCallback(async () => {
    try {
      const stored = await getSetting('provider');
      const activeProvider: Provider = isProviderId(stored) ? stored : DEFAULT_PROVIDER_ID;
      setProvider(activeProvider);
      const info = getProviderInfo(activeProvider);
      const res = await keylox.settings.hasSecret({ provider: activeProvider });
      // Provider lokal (ollama/lmstudio) tidak butuh key (§2.12.1).
      setHasKey(res.hasKey === true || providerIsLocal(info));
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

  // Saran perintah dari Settings (aksi jobType).
  useEffect(() => {
    if (!seed) return;
    setText(seed.text);
    setStatus('idle');
    inputRef.current?.focus();
  }, [seed]);

  const runLines = (lines: string[]) => {
    lines.forEach((line) => {
      const cmd = parseCommand(line);
      if (!cmd) { console.log('unknown', line); return; }
      applyCmd(cmd, useEditorStore.getState(), onExport);
    });
  };

  /**
   * R6.1: satu perintah AI = satu grup undo (`undo_records.group_id`, §4.3 #7).
   * `beginGroup` dipanggil SEKALI sebelum semua op; `endGroup` sesudahnya.
   */
  const applyPlan = useCallback((mapping: PlanMappingResult) => {
    if (mapping.commands.length === 0) return;
    const snapshotStore = useEditorStore.getState();
    snapshotStore.beginGroup('Perintah AI');
    try {
      mapping.commands.forEach((cmd) => applyCmd(cmd, useEditorStore.getState(), onExport));
    } finally {
      useEditorStore.getState().endGroup();
    }
  }, [onExport]);

  /** Jalur AI (satu-satunya): main process → provider/backend. Tanpa key di renderer. */
  const askAi = async (rawText: string) => {
    setErrorMsg('');
    setErrorHint(null);
    setPending(null);
    setStatus('memahami');
    lastPromptRef.current = rawText;

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

      if (view.needsConsent) {
        const details = (view.details ?? {}) as {
          provider?: string;
          reason?: string;
          jobType?: string;
        };
        const consentProvider: Provider = isProviderId(details.provider) ? details.provider : provider;
        const jobType = typeof details.jobType === 'string' ? details.jobType : null;
        const reason = typeof details.reason === 'string' ? details.reason : null;
        const mediaContent = reason === 'media_content' || (jobType !== null && MEDIA_CONTENT_JOB_TYPES.has(jobType));
        setConsent({
          provider: consentProvider,
          purpose: jobType
            ? `Menjalankan ${jobTypeLabel(jobType)} dengan ${providerLabel(consentProvider)}.`
            : `Mengirim konten ke ${providerLabel(consentProvider)}.`,
          mediaContent,
          reason,
        });
        setConsentError(null);
        setStatus('perlu-konfirmasi');
        return;
      }

      setErrorMsg(view.message);
      setErrorHint(view.suggestion);

      if (view.needsApiKey) { setHasKey(false); setStatus('perlu-key'); return; }
      if (view.needsProviderChange) {
        // §5.2.1: toast + saran ganti provider/model.
        toastError(e);
        setStatus('error');
        return;
      }
      setStatus(view.retryable ? 'error-retry' : 'error');
    }
  };

  const confirmConsent = async (scope: ConsentScope) => {
    if (!consent) return;
    setConsentBusy(true);
    setConsentError(null);
    try {
      await keylox.privacy.confirmExternal({
        provider: consent.provider,
        purpose: consent.purpose.slice(0, 280),
        scope,
      });
      setConsent(null);
      setStatus('memahami');
      toastSuccess('Konfirmasi privasi disimpan. Mengirim ulang perintah…');
      await askAi(lastPromptRef.current);
    } catch (e) {
      const view = describeError(e);
      setConsentError(view.message);
      toastError(e);
    } finally {
      setConsentBusy(false);
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
    'perlu-konfirmasi': 'perlu konfirmasi',
    'perlu-key': 'perlu key',
    'error-retry': 'gagal (bisa diulang)',
    error: 'error',
  };
  const statusText = status.startsWith('siap') ? status : (statusLabel[status] || status);
  const isBusy = status === 'memahami';

  return (
    <div className="shrink-0 border-t border-border bg-panel">
      {pending && (
        <div role="dialog" aria-label="Ringkasan rencana AI" className="border-b border-border bg-elevated/40 px-3 py-2 text-xs">
          <h3 className="mb-1 font-semibold">Ringkasan perubahan</h3>
          <p className="mb-2 text-textMuted">{pending.plan.diffSummary}</p>
          <p className="mb-2 text-textMuted">
            {pending.mapping.commands.length} operasi siap diterapkan
            {pending.mapping.unsupported.length ? `, ${pending.mapping.unsupported.length} belum didukung` : ''}.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded bg-active px-3 py-1.5 font-semibold text-white transition-colors duration-150 ease-out"
              onClick={() => {
                applyPlan(pending.mapping);
                setPending(null);
                setStatus(`siap (${pending.mapping.commands.length} operasi)`);
              }}
            >
              Terapkan
            </button>
            <button
              type="button"
              className="rounded bg-elevated px-3 py-1.5 transition-colors duration-150 ease-out hover:bg-border"
              onClick={() => { setPending(null); setStatus('idle'); }}
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="px-3 pt-2">
          <ErrorBanner message={errorMsg} suggestion={errorHint} onDismiss={() => { setErrorMsg(''); setErrorHint(null); }} />
        </div>
      )}

      <div className="flex h-14 items-center gap-2 px-3">
        <button
          type="button"
          className="cursor-not-allowed rounded bg-elevated px-2 py-1 text-xs text-textDisabled"
          title="Input suara belum tersedia"
          aria-label="Input suara belum tersedia"
          disabled
        >
          Mic
        </button>
        <span className={`rounded px-2 py-0.5 text-xs ${status === 'idle' ? 'bg-elevated text-textMuted' : 'bg-warning/20 text-warning'}`} aria-live="polite">
          {statusText}
        </span>
        <input
          ref={inputRef}
          data-testid="prompt-input"
          aria-label="Perintah AI"
          className="flex-1 rounded border border-border bg-elevated px-3 py-1.5 text-sm"
          placeholder="Ketik perintah... (Ctrl+P)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleRun(); } }}
        />
        {!hasKey && (
          <button
            type="button"
            className="rounded bg-elevated px-3 py-1.5 text-xs transition-colors duration-150 ease-out hover:bg-border"
            onClick={() => onOpenSettings?.()}
          >
            Atur API Key
          </button>
        )}
        <button
          type="button"
          data-testid="prompt-apply"
          className="rounded bg-active px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-150 ease-out disabled:opacity-40"
          onClick={handleRun}
          disabled={isBusy}
        >
          Jalankan
        </button>
        {status === 'error-retry' && (
          <button
            type="button"
            className="rounded bg-elevated px-3 py-1.5 text-xs transition-colors duration-150 ease-out hover:bg-border"
            onClick={() => void askAi(text.trim())}
          >
            Coba lagi
          </button>
        )}
        <button
          type="button"
          className="rounded bg-elevated px-3 py-1.5 text-xs transition-colors duration-150 ease-out hover:bg-border disabled:opacity-40"
          onClick={() => void askAi(text.trim())}
          disabled={isBusy}
          title="Kirim ke AI"
        >
          AI
        </button>
      </div>

      <ConsentDialog
        open={consent !== null}
        provider={consent?.provider ?? provider}
        purpose={consent?.purpose ?? 'Mengirim konten ke provider cloud.'}
        mediaContent={consent?.mediaContent ?? false}
        reason={consent?.reason ?? null}
        busy={consentBusy}
        error={consentError}
        onCancel={() => { setConsent(null); setStatus('idle'); }}
        onConfirm={(scope) => void confirmConsent(scope)}
      />
    </div>
  );
};
