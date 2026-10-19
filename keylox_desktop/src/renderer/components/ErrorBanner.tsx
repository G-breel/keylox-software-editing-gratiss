import React from 'react';

/**
 * Satu-satunya render error envelope di UI (`data-testid="error-banner"`,
 * `role="alert"`). `details` tidak pernah dirender mentah (api-contract §5.1).
 */
export const ErrorBanner: React.FC<{
  message?: string | null;
  suggestion?: string | null;
  onDismiss?: () => void;
}> = ({ message, suggestion, onDismiss }) => {
  if (!message) return null;
  return (
    <div
      role="alert"
      data-testid="error-banner"
      className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-xs transition-colors duration-150 ease-out"
    >
      <div className="flex items-start gap-2">
        <p className="flex-1 text-textPrimary break-words">{message}</p>
        {onDismiss && (
          <button
            type="button"
            className="shrink-0 text-textMuted hover:text-textPrimary transition-colors duration-150 ease-out"
            onClick={onDismiss}
            aria-label="Tutup pesan galat"
          >
            Tutup
          </button>
        )}
      </div>
      {suggestion && <p className="mt-1 text-textMuted break-words">{suggestion}</p>}
    </div>
  );
};
