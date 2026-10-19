import React from 'react';
import { JOB_ACTIONS, jobSupport, type RegistryProvider } from '../lib/providerInfo';

/**
 * Tombol aksi jobType (R2.3). Kapabilitas eksplisit `false` → tombol disabled +
 * teks "Tidak didukung oleh `<provider>`". Kapabilitas `null` → tetap aktif,
 * diberi label "belum diverifikasi" (§2.13.3, §2.14.3).
 *
 * Aksi yang aktif mengisi bilah perintah dengan saran perintah; job AI tetap
 * melewati `ai:invoke` di main (tidak ada jalur AI langsung dari renderer).
 */
export const CapabilityJobActions: React.FC<{
  provider: RegistryProvider | null;
  onUsePrompt: (text: string) => void;
}> = ({ provider, onUsePrompt }) => {
  if (!provider) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-2 gap-1.5">
        {JOB_ACTIONS.map((action) => {
          const support = jobSupport(provider, action.jobType);
          const reason = support.state === 'unsupported'
            ? `Tidak didukung oleh ${provider.label}`
            : support.state === 'unknown'
              ? 'belum diverifikasi'
              : null;

          return (
            <button
              key={action.jobType}
              type="button"
              data-testid={`job-action-${action.jobType}`}
              disabled={support.disabled}
              title={reason ? `${action.label} — ${reason}` : `${action.label} — ${provider.label}`}
              onClick={() => onUsePrompt(action.prompt)}
              className={`flex flex-col items-start rounded border px-2 py-1 text-left text-xs transition-colors duration-150 ease-out ${
                support.disabled
                  ? 'border-border bg-elevated/50 text-textDisabled cursor-not-allowed'
                  : 'border-border bg-elevated text-textPrimary hover:border-borderStrong'
              }`}
            >
              <span>{action.label}</span>
              {reason && (
                <span className={`text-[10px] ${support.disabled ? 'text-danger/80' : 'text-warning/90'}`}>
                  {reason}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-textMuted">
        Aksi aktif mengisi bilah perintah. Job berat tetap berjalan lewat backend/main sesuai kontrak.
      </p>
    </div>
  );
};
