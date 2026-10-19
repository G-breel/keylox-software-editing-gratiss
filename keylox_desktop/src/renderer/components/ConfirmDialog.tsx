import React from 'react';

/** Dialog konfirmasi generik untuk aksi berisiko (wipe/export/izin). */
export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Batal',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-[420px] rounded-lg border border-border bg-panel p-4 text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-dialog-title" className="mb-2 text-sm font-semibold text-textPrimary">{title}</h3>
        <div className="text-xs text-textMuted">{body}</div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded bg-elevated px-3 py-1.5 text-xs text-textPrimary transition-colors duration-150 ease-out hover:bg-border disabled:opacity-40"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`rounded px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-150 ease-out disabled:opacity-40 ${
              danger ? 'bg-danger' : 'bg-active'
            }`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Memproses…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
