import React, { useCallback, useEffect, useState } from 'react';
import { keylox, describeError, type UsageRange, type UsageSummary } from '../lib/ipc';
import {
  USAGE_RANGE_LABELS,
  formatDateTime,
  formatTokens,
  formatUsd,
  providerLabel,
} from '../lib/providerInfo';
import { toastError, toastSuccess } from '../lib/toast';
import { ConfirmDialog } from './ConfirmDialog';
import { ErrorBanner } from './ErrorBanner';

/**
 * Panel Usage (§2.16, R3.4).
 *
 *  - Sumber data: `usage:get` — TIDAK pernah memicu jaringan.
 *  - `estCostUsd === null` → tampilkan token saja (harga provider belum diketahui).
 *  - Label wajib: "Estimasi biaya (bukan tagihan)".
 *  - Hapus riwayat → `data:wipeLocal({ scope:'usage', confirm:true })`.
 */

const RANGES: UsageRange[] = ['today', '7d', '30d', 'all'];

const SummaryCard: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div className="rounded border border-border bg-elevated px-2.5 py-2">
    <div className="text-[10px] uppercase tracking-wide text-textMuted">{label}</div>
    <div className="mt-0.5 font-mono text-sm text-textPrimary">{value}</div>
    {hint && <div className="text-[10px] text-textMuted">{hint}</div>}
  </div>
);

export const UsagePanel: React.FC = () => {
  const [range, setRange] = useState<UsageRange>('all');
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [wiping, setWiping] = useState(false);

  const load = useCallback(async (nextRange: UsageRange) => {
    setLoading(true);
    setError(null);
    try {
      const result = await keylox.usage.get({ range: nextRange });
      setSummary(result);
    } catch (e) {
      const view = describeError(e);
      setSummary(null);
      setError(view.message);
      toastError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(range);
  }, [range, load]);

  const wipeUsage = async () => {
    setWiping(true);
    setError(null);
    try {
      const result = await keylox.data.wipeLocal({ scope: 'usage', confirm: true });
      const deleted = result?.deleted?.usage ?? 0;
      toastSuccess(`Riwayat penggunaan dihapus (${deleted} catatan).`);
      setConfirmWipe(false);
      await load(range);
    } catch (e) {
      const view = describeError(e);
      setError(view.message);
      toastError(e);
    } finally {
      setWiping(false);
    }
  };

  const totalsCost = formatUsd(summary?.totals.estCostUsd ?? null);

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-textPrimary">Usage &amp; token</h3>
          <p className="text-[11px] text-textMuted">
            Catatan lokal pemakaian AI. Angka biaya bersifat estimasi indikatif.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="usageRange" className="text-xs text-textMuted">Rentang</label>
          <select
            id="usageRange"
            value={range}
            onChange={(e) => setRange(e.target.value as UsageRange)}
            className="text-xs"
            disabled={loading}
          >
            {RANGES.map((r) => (
              <option key={r} value={r}>{USAGE_RANGE_LABELS[r]}</option>
            ))}
          </select>
          <button
            type="button"
            className="rounded bg-elevated px-2.5 py-1 text-xs text-textPrimary transition-colors duration-150 ease-out hover:bg-border disabled:opacity-40"
            onClick={() => void load(range)}
            disabled={loading}
          >
            {loading ? 'Memuat…' : 'Muat ulang'}
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="grid grid-cols-4 gap-2">
        <SummaryCard label="Panggilan" value={formatTokens(summary?.totals.calls ?? 0)} />
        <SummaryCard label="Token masuk" value={formatTokens(summary?.totals.inputTokens ?? 0)} />
        <SummaryCard label="Token keluar" value={formatTokens(summary?.totals.outputTokens ?? 0)} />
        <SummaryCard
          label="Estimasi biaya"
          value={totalsCost ?? '—'}
          hint={totalsCost ? 'bukan tagihan' : 'harga provider tidak diketahui'}
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide text-textMuted">
            Estimasi biaya (bukan tagihan)
          </span>
          <span className="text-[10px] text-textMuted">
            Biaya kosong berarti provider tidak punya harga di registry — token tetap dicatat.
          </span>
        </div>
        <div className="max-h-[300px] overflow-auto rounded border border-border">
          <table className="w-full border-collapse text-[11px]" data-testid="usage-table">
            <thead className="sticky top-0 bg-panel text-textMuted">
              <tr className="border-b border-border">
                <th className="px-2 py-1.5 text-left font-medium">Waktu</th>
                <th className="px-2 py-1.5 text-left font-medium">Provider</th>
                <th className="px-2 py-1.5 text-left font-medium">Model</th>
                <th className="px-2 py-1.5 text-left font-medium">Tugas</th>
                <th className="px-2 py-1.5 text-right font-medium">Token masuk</th>
                <th className="px-2 py-1.5 text-right font-medium">Token keluar</th>
                <th className="px-2 py-1.5 text-right font-medium">Biaya</th>
              </tr>
            </thead>
            <tbody>
              {(summary?.items ?? []).map((item, index) => {
                const cost = formatUsd(item.estCostUsd);
                return (
                  <tr
                    key={`${item.recordedAt}-${item.provider}-${item.model}-${index}`}
                    className="border-b border-border/60 last:border-b-0"
                  >
                    <td className="px-2 py-1.5 font-mono text-textMuted">{formatDateTime(item.recordedAt)}</td>
                    <td className="px-2 py-1.5 text-textPrimary">{providerLabel(item.provider)}</td>
                    <td className="px-2 py-1.5 font-mono text-textMuted">{item.model}</td>
                    <td className="px-2 py-1.5 text-textMuted">{item.jobType}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-textPrimary">{formatTokens(item.inputTokens)}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-textPrimary">{formatTokens(item.outputTokens)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">
                      {cost ?? <span className="text-textMuted" title="Harga provider belum diketahui">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && (summary?.items.length ?? 0) === 0 && (
            <p className="px-3 py-6 text-center text-xs text-textMuted">
              Belum ada catatan penggunaan pada rentang ini.
            </p>
          )}
          {loading && <p className="px-3 py-6 text-center text-xs text-textMuted">Memuat catatan penggunaan…</p>}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-[11px] text-textMuted">
          Menghapus riwayat penggunaan tidak menghapus proyek, media, atau API key.
        </p>
        <button
          type="button"
          className="rounded border border-danger/40 px-3 py-1.5 text-xs text-danger transition-colors duration-150 ease-out hover:bg-danger/10 disabled:opacity-40"
          onClick={() => setConfirmWipe(true)}
          disabled={loading || wiping || (summary?.items.length ?? 0) === 0}
        >
          Hapus riwayat penggunaan
        </button>
      </div>

      <ConfirmDialog
        open={confirmWipe}
        title="Hapus riwayat penggunaan?"
        body={
          <p>
            Semua catatan token &amp; estimasi biaya pada perangkat ini akan dihapus.
            Proyek, media, dan API key tidak tersentuh. Tindakan ini tidak dapat dibatalkan.
          </p>
        }
        confirmLabel="Hapus riwayat"
        danger
        busy={wiping}
        onConfirm={() => void wipeUsage()}
        onCancel={() => setConfirmWipe(false)}
      />
    </div>
  );
};
