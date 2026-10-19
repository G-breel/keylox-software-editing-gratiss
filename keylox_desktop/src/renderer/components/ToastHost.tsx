import React, { useEffect } from 'react';
import { useToastStore, type ToastItem } from '../lib/toast';

/** Tampilan toast: tenang, tanpa shadow berlebih, transisi 150ms ease-out. */
const KIND_CLASS: Record<ToastItem['kind'], string> = {
  error: 'border-danger/40 text-danger',
  success: 'border-success/40 text-success',
  info: 'border-borderStrong text-textPrimary',
};

const ToastCard: React.FC<{ item: ToastItem }> = ({ item }) => {
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    const ms = item.kind === 'error' ? 8000 : 5000;
    const timer = window.setTimeout(() => dismiss(item.id), ms);
    return () => window.clearTimeout(timer);
  }, [item.id, item.kind, dismiss]);

  return (
    <div
      role={item.kind === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto w-[340px] rounded border bg-panel px-3 py-2 text-xs transition-colors duration-150 ease-out ${KIND_CLASS[item.kind]}`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-textPrimary break-words">{item.message}</p>
          {item.suggestion && (
            <p className="mt-1 text-textMuted break-words">{item.suggestion}</p>
          )}
        </div>
        <button
          type="button"
          className="shrink-0 text-textMuted hover:text-textPrimary transition-colors duration-150 ease-out"
          onClick={() => dismiss(item.id)}
          aria-label="Tutup notifikasi"
        >
          Tutup
        </button>
      </div>
    </div>
  );
};

export const ToastHost: React.FC = () => {
  const items = useToastStore((s) => s.items);
  if (items.length === 0) return null;
  return (
    <div
      className="fixed bottom-10 right-4 z-[70] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
    >
      {items.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>
  );
};
