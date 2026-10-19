import React from 'react';
import {
  CAPABILITY_LABELS,
  capabilityState,
  type CapabilityKey,
  type RegistryProvider,
} from '../lib/providerInfo';

const CAPABILITY_ORDER: CapabilityKey[] = ['json', 'vision', 'audioIn', 'audioOut', 'tools'];

const STATE_CLASS: Record<string, string> = {
  supported: 'border-success/30 bg-success/10 text-success',
  unsupported: 'border-danger/30 bg-danger/10 text-danger',
  unknown: 'border-border bg-elevated text-textMuted',
};

const STATE_SUFFIX: Record<string, string> = {
  supported: '',
  unsupported: ' · tidak didukung',
  unknown: ' · belum diverifikasi',
};

/**
 * Badge kapabilitas per provider (§2.13.3, §2.14.3).
 *
 * Aturan keras: kapabilitas `null` TIDAK boleh diperlakukan sebagai `false` —
 * chip tetap netral dan berlabel "belum diverifikasi"; tombol terkait TIDAK
 * di-disable (lihat `CapabilityJobActions`).
 */
export const CapabilityBadges: React.FC<{ provider: RegistryProvider | null }> = ({ provider }) => {
  if (!provider) return null;

  const hasUnknown = CAPABILITY_ORDER.some((key) => capabilityState(provider, key) === 'unknown');

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1" role="list" aria-label="Kapabilitas provider">
        {CAPABILITY_ORDER.map((key) => {
          const state = capabilityState(provider, key);
          return (
            <span
              key={key}
              role="listitem"
              title={`${CAPABILITY_LABELS[key]}: ${state === 'supported' ? 'didukung' : state === 'unsupported' ? 'tidak didukung' : 'belum diverifikasi'}`}
              className={`rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors duration-150 ease-out ${STATE_CLASS[state]}`}
            >
              {CAPABILITY_LABELS[key]}
              <span className="opacity-80">{STATE_SUFFIX[state]}</span>
            </span>
          );
        })}
      </div>
      {hasUnknown && (
        <p className="text-[10px] text-textMuted">
          Sebagian kapabilitas belum diverifikasi — jalankan <span className="text-textPrimary">Tes Koneksi</span> untuk memastikan.
        </p>
      )}
    </div>
  );
};
