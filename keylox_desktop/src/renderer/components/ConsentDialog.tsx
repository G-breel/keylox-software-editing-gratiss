import React, { useEffect, useState } from 'react';
import { getProviderInfo } from '../lib/providerInfo';
import type { ConsentScope, Provider } from '../lib/ipc';

/**
 * Konfirmasi eksplisit sebelum konten dikirim ke cloud — `privacy:confirmExternal`
 * (§2.15.3, §5.2.1 `ERR_PRIVACY_CONSENT_REQUIRED`).
 *
 * Dipakai untuk:
 *  - provider `freeTierTraining:true` (termasuk `custom` yang privasinya tak diketahui);
 *  - job yang membawa **frame/audio** (`scene_detect`, `ocr`, `thumbnail`,
 *    `vision_color`, `transcribe`) — `reason: 'media_content'` dari main.
 */
export const ConsentDialog: React.FC<{
  open: boolean;
  provider: Provider;
  purpose: string;
  /** true bila konten yang dikirim berupa frame/gambar/audio. */
  mediaContent?: boolean;
  /** `reason` dari ErrorShape.details, bila dialog muncul karena penolakan main. */
  reason?: string | null;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (scope: ConsentScope) => void;
}> = ({ open, provider, purpose, mediaContent = false, reason, busy = false, error, onCancel, onConfirm }) => {
  const [scope, setScope] = useState<ConsentScope>('once');
  const info = getProviderInfo(provider);

  useEffect(() => {
    if (open) setScope('once');
  }, [open]);

  if (!open) return null;

  const training = info?.privacy.freeTierTraining === true || reason === 'free_tier_training';
  const unknownPrivacy = provider === 'custom' || info?.privacy.freeTierTraining === null;

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50"
      onClick={(e) => { e.stopPropagation(); onCancel(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-dialog-title"
        className="w-[460px] rounded-lg border border-border bg-panel p-4 text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="consent-dialog-title" className="mb-1 text-sm font-semibold text-textPrimary">
          Konfirmasi kirim data ke cloud
        </h3>
        <p className="mb-2 text-xs text-textMuted">
          Provider: <span className="text-textPrimary">{info?.label ?? provider}</span>
        </p>
        <p className="mb-2 text-xs text-textPrimary break-words">{purpose}</p>

        {training && (
          <p className="mb-2 rounded border border-warning/40 bg-warning/10 px-2 py-1.5 text-[11px] text-warning">
            Tier gratis provider ini dapat dipakai untuk melatih model. Konten yang dikirim tidak dapat ditarik kembali.
          </p>
        )}
        {mediaContent && (
          <p className="mb-2 rounded border border-danger/40 bg-danger/10 px-2 py-1.5 text-[11px] text-danger">
            Frame/gambar atau audio dari klip akan dikirim ke server provider — bukan hanya teks perintah.
          </p>
        )}
        {unknownPrivacy && (
          <p className="mb-2 rounded border border-border bg-elevated px-2 py-1.5 text-[11px] text-textMuted">
            Kebijakan privasi provider ini belum diketahui — diperlakukan konservatif sebagai “data keluar device”.
          </p>
        )}

        {info?.privacy.retentionNote && (
          <p className="mb-3 text-[11px] text-textMuted">{info.privacy.retentionNote}</p>
        )}

        <fieldset className="mb-3 rounded border border-border p-2">
          <legend className="px-1 text-[10px] uppercase tracking-wide text-textMuted">Cakupan izin</legend>
          <label className="mb-1 flex items-center gap-2 text-xs">
            <input type="radio" name="consentScope" checked={scope === 'once'} onChange={() => setScope('once')} />
            Sekali ini
          </label>
          <label className="mb-1 flex items-center gap-2 text-xs">
            <input type="radio" name="consentScope" checked={scope === 'session'} onChange={() => setScope('session')} />
            Selama sesi ini
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="radio" name="consentScope" checked={scope === 'always'} onChange={() => setScope('always')} />
            Selalu untuk provider ini
          </label>
        </fieldset>

        {error && <p className="mb-2 text-xs text-danger break-words">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded bg-elevated px-3 py-1.5 text-xs text-textPrimary transition-colors duration-150 ease-out hover:bg-border disabled:opacity-40"
            onClick={onCancel}
            disabled={busy}
          >
            Batal
          </button>
          <button
            type="button"
            className="rounded bg-active px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-150 ease-out disabled:opacity-40"
            onClick={() => onConfirm(scope)}
            disabled={busy}
          >
            {busy ? 'Menyimpan…' : 'Konfirmasi'}
          </button>
        </div>
      </div>
    </div>
  );
};
