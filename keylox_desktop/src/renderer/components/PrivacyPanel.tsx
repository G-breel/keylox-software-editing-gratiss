import React, { useCallback, useEffect, useState } from 'react';
import {
  keylox,
  describeError,
  type PrivacyMode,
} from '../lib/ipc';
import {
  PROVIDER_IDS,
  formatTokens,
  getProviderInfo,
  providerIsLocal,
} from '../lib/providerInfo';
import { toastError, toastInfo, toastSuccess } from '../lib/toast';
import { ConfirmDialog } from './ConfirmDialog';
import { ErrorBanner } from './ErrorBanner';

/**
 * Panel "Data & Privasi" (§2.15, R4.3).
 *
 *  - Mode `local-only | standard | cloud` — `privacy:setMode` berlaku TANPA restart.
 *  - Indikator "data keluar device" per provider (registry `privacy.leavesDevice`).
 *  - Export (`data:exportLocal`) & Hapus (`data:wipeLocal`) — default export
 *    TIDAK menyertakan key; `includeSecrets` hanya status termask (§2.15.5).
 */

const MODES: Array<{ id: PrivacyMode; label: string; description: string }> = [
  {
    id: 'local-only',
    label: 'Local-only',
    description: 'Tidak ada panggilan AI keluar device. Hanya model lokal (Ollama/LM Studio) dan perintah lokal yang berjalan.',
  },
  {
    id: 'standard',
    label: 'Standard',
    description: 'Cloud boleh untuk tugas non-sensitif. Provider tier gratis yang memakai data untuk training tetap wajib dikonfirmasi.',
  },
  {
    id: 'cloud',
    label: 'Cloud',
    description: 'Semua tugas cloud diizinkan. Konfirmasi provider training tetap berlaku — ini bukan “izinkan segalanya”.',
  },
];

const LeavesDeviceBadge: React.FC<{ value: boolean | null }> = ({ value }) => {
  if (value === false) {
    return <span className="rounded border border-success/30 bg-success/10 px-1.5 py-0.5 text-[10px] text-success">Lokal — tidak keluar device</span>;
  }
  if (value === true) {
    return <span className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">Data keluar device</span>;
  }
  return <span className="rounded border border-border bg-elevated px-1.5 py-0.5 text-[10px] text-textMuted">Belum diverifikasi</span>;
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export const PrivacyPanel: React.FC = () => {
  const [mode, setMode] = useState<PrivacyMode>('standard');
  const [loadingMode, setLoadingMode] = useState(true);
  const [savingMode, setSavingMode] = useState<PrivacyMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportInfo, setExportInfo] = useState<string | null>(null);

  const [confirmWipe, setConfirmWipe] = useState(false);
  const [wiping, setWiping] = useState(false);

  const loadMode = useCallback(async () => {
    setLoadingMode(true);
    try {
      const result = await keylox.privacy.getMode();
      if (result?.mode) setMode(result.mode);
    } catch (e) {
      const view = describeError(e);
      setError(view.message);
      toastError(e);
    } finally {
      setLoadingMode(false);
    }
  }, []);

  useEffect(() => {
    void loadMode();
  }, [loadMode]);

  const changeMode = async (next: PrivacyMode) => {
    if (next === mode) return;
    const previous = mode;
    // Optimistis: perubahan berlaku langsung di UI; dikembalikan bila main menolak.
    setMode(next);
    setSavingMode(next);
    setError(null);
    try {
      await keylox.privacy.setMode({ mode: next });
      toastSuccess(`Mode privasi: ${next}. Berlaku tanpa restart.`);
    } catch (e) {
      setMode(previous);
      const view = describeError(e);
      setError(view.message);
      toastError(e);
    } finally {
      setSavingMode(null);
    }
  };

  const exportLocal = async () => {
    setExporting(true);
    setError(null);
    setExportInfo(null);
    try {
      const result = await keylox.data.exportLocal(
        includeSecrets ? { includeSecrets: true } : {}
      );
      if (result?.canceled || !result?.filePath) {
        toastInfo('Export data lokal dibatalkan.');
        return;
      }
      setExportInfo(`${result.filePath} (${formatBytes(result.size)})`);
      toastSuccess('Data lokal diekspor.');
    } catch (e) {
      const view = describeError(e);
      setError(view.message);
      toastError(e);
    } finally {
      setExporting(false);
    }
  };

  const wipeLocal = async () => {
    setWiping(true);
    setError(null);
    try {
      const result = await keylox.data.wipeLocal({ scope: 'all', confirm: true });
      const deleted = result?.deleted ?? {};
      toastSuccess(
        `Data lokal dihapus — cache ${formatTokens(deleted.cache ?? 0)}, usage ${formatTokens(deleted.usage ?? 0)}, embedding ${formatTokens(deleted.embeddings ?? 0)}.`
      );
      setConfirmWipe(false);
    } catch (e) {
      const view = describeError(e);
      setError(view.message);
      toastError(e);
    } finally {
      setWiping(false);
    }
  };

  const activeMode = MODES.find((m) => m.id === mode) ?? MODES[1];

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-textPrimary">Mode privasi</h3>
          <span className="text-[10px] text-textMuted">Berlaku langsung, tanpa restart</span>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-1.5">
          {MODES.map((item) => {
            const selected = mode === item.id;
            return (
              <label
                key={item.id}
                className={`flex cursor-pointer items-start gap-2 rounded border px-2.5 py-2 transition-colors duration-150 ease-out ${
                  selected ? 'border-active/60 bg-active/10' : 'border-border bg-elevated hover:border-borderStrong'
                }`}
              >
                <input
                  type="radio"
                  name="privacyMode"
                  className="mt-0.5"
                  checked={selected}
                  disabled={loadingMode || savingMode !== null}
                  onChange={() => void changeMode(item.id)}
                />
                <span className="min-w-0">
                  <span className={`text-xs font-semibold ${selected ? 'text-active' : 'text-textPrimary'}`}>
                    {item.label}
                  </span>
                  <span className="block text-[11px] text-textMuted">{item.description}</span>
                </span>
              </label>
            );
          })}
        </div>
        {savingMode && <p className="mt-1 text-[10px] text-textMuted">Menyimpan mode…</p>}
        <p className="mt-1 text-[11px] text-textMuted">
          Mode aktif: <span className="text-textPrimary">{activeMode.label}</span>.
          {mode === 'local-only' && ' Panggilan cloud akan ditolak sebelum menyentuh jaringan.'}
        </p>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-textPrimary">Data keluar device per provider</h3>
          <span className="text-[10px] text-textMuted">Dari registry provider (§2.13.4)</span>
        </div>
        <div className="mt-2 max-h-[210px] overflow-auto rounded border border-border">
          {PROVIDER_IDS.map((id) => {
            const info = getProviderInfo(id);
            if (!info) return null;
            const local = providerIsLocal(info);
            return (
              <div key={id} className="border-b border-border/60 px-2.5 py-1.5 last:border-b-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-textPrimary">{info.label}</span>
                  <LeavesDeviceBadge value={info.privacy.leavesDevice} />
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  {info.privacy.freeTierTraining === true && (
                    <span className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">
                      Tier gratis dapat dipakai training
                    </span>
                  )}
                  {info.privacy.freeTierTraining === null && (
                    <span className="text-[10px] text-textMuted">Training: belum diketahui</span>
                  )}
                  {local && <span className="text-[10px] text-success">Inferensi di perangkat</span>}
                </div>
                <p className="mt-0.5 truncate text-[10px] text-textMuted" title={info.privacy.retentionNote}>
                  {info.privacy.retentionNote}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-border pt-3">
        <h3 className="text-sm font-semibold text-textPrimary">Data lokal</h3>
        <p className="mt-0.5 text-[11px] text-textMuted">
          Export berisi preferensi + riwayat penggunaan. Default tidak menyertakan API key sama sekali.
        </p>
        <label className="mt-2 flex items-center gap-2 text-xs text-textMuted">
          <input
            type="checkbox"
            checked={includeSecrets}
            onChange={(e) => setIncludeSecrets(e.target.checked)}
            disabled={exporting}
          />
          Sertakan status key (hanya <code>hasKey</code>/<code>masked</code> — bukan nilai key)
        </label>
        {exportInfo && (
          <p className="mt-1 break-all text-[11px] text-success">Diekspor ke {exportInfo}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded bg-elevated px-3 py-1.5 text-xs text-textPrimary transition-colors duration-150 ease-out hover:bg-border disabled:opacity-40"
            onClick={() => void exportLocal()}
            disabled={exporting}
          >
            {exporting ? 'Mengekspor…' : 'Export data lokal'}
          </button>
          <button
            type="button"
            className="rounded border border-danger/40 px-3 py-1.5 text-xs text-danger transition-colors duration-150 ease-out hover:bg-danger/10 disabled:opacity-40"
            onClick={() => setConfirmWipe(true)}
            disabled={wiping}
          >
            Hapus data lokal
          </button>
        </div>
        <p className="mt-2 text-[10px] text-textMuted">
          Hapus data lokal mencakup cache AI, riwayat penggunaan, embedding, dan insight aset.
          Proyek, media, dan API key tidak pernah dihapus.
        </p>
      </div>

      <ConfirmDialog
        open={confirmWipe}
        title="Hapus data lokal?"
        body={
          <div className="flex flex-col gap-1">
            <p>Cache AI, riwayat penggunaan, embedding, dan insight aset akan dihapus dari perangkat ini.</p>
            <p>Proyek, media, dan API key (settings.enc) tidak tersentuh. Tindakan ini tidak dapat dibatalkan.</p>
          </div>
        }
        confirmLabel="Hapus data lokal"
        danger
        busy={wiping}
        onConfirm={() => void wipeLocal()}
        onCancel={() => setConfirmWipe(false)}
      />
    </div>
  );
};
