import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  keylox,
  describeError,
  getSetting,
  type Provider,
  type SecretStatus,
  type TestProviderResult,
} from '../lib/ipc';
import {
  DEFAULT_PROVIDER_ID,
  PROVIDER_IDS,
  getProviderInfo,
  isProviderId,
  providerAllowsCustomBaseUrl,
  providerIsLocal,
  providerKeyPlaceholder,
  providerRequiresBaseUrl,
  verdictLabel,
} from '../lib/providerInfo';
import { toastError, toastSuccess } from '../lib/toast';
import { CapabilityBadges } from './CapabilityBadges';
import { CapabilityJobActions } from './CapabilityJobActions';
import { ConsentDialog } from './ConsentDialog';
import { ErrorBanner } from './ErrorBanner';
import { PrivacyPanel } from './PrivacyPanel';
import { UsagePanel } from './UsagePanel';

/**
 * Settings (api-contract v1.2 §2.12–§2.16).
 *
 * Invarian:
 *  - Renderer TIDAK PERNAH memegang key: hanya `{ hasKey, masked, model }` (§2.12.2).
 *  - TIDAK ADA `localStorage` untuk key. Nilai lama (BUG-01) ditawarkan untuk
 *    dipindah ke `safeStorage`, lalu DIHAPUS dari localStorage.
 *  - Kapabilitas dari `shared/providerRegistry.js`; `null` = "belum diverifikasi"
 *    dan TIDAK mematikan aksi (§2.13.3, §2.14.3).
 *  - Tab Usage/Privasi memakai channel v1.2 (`usage:get`, `privacy:*`, `data:*`).
 */

type Tab = 'provider' | 'usage' | 'privacy';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'provider', label: 'AI Provider' },
  { id: 'usage', label: 'Usage' },
  { id: 'privacy', label: 'Data & Privasi' },
];

/** Nama kunci legacy yang wajib dibersihkan (BUG-01 / SEC-SECRET-02). */
const LEGACY_KEY_NAMES = ['geminiKey', 'geminiApiKey', 'apiKey', 'openaiKey'];
const LEGACY_BACKEND_URL = 'backendBaseUrl';

interface LegacyState {
  apiKey: string | null;
  backendBaseUrl: string | null;
}

function readLegacyState(): LegacyState {
  if (typeof localStorage === 'undefined') return { apiKey: null, backendBaseUrl: null };
  let apiKey: string | null = null;
  for (const name of LEGACY_KEY_NAMES) {
    const value = localStorage.getItem(name);
    if (value && value.trim()) {
      apiKey = value.trim();
      break;
    }
  }
  const backendBaseUrl = localStorage.getItem(LEGACY_BACKEND_URL);
  return { apiKey, backendBaseUrl: backendBaseUrl && backendBaseUrl.trim() ? backendBaseUrl.trim() : null };
}

function purgeLegacyKey(): void {
  if (typeof localStorage === 'undefined') return;
  for (const name of LEGACY_KEY_NAMES) localStorage.removeItem(name);
}

function purgeLegacyBackendUrl(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(LEGACY_BACKEND_URL);
}

/** Tebak provider dari bentuk key — hanya untuk MIGRASI, bukan validasi keamanan. */
function guessProvider(apiKey: string): Provider {
  if (/^sk-ant-/.test(apiKey)) return 'anthropic';
  if (/^sk-or-/.test(apiKey)) return 'openrouter';
  if (/^gsk_/.test(apiKey)) return 'groq';
  if (/^sk-/.test(apiKey)) return 'openai';
  if (/^AIza|^AQ\./.test(apiKey)) return 'gemini';
  return DEFAULT_PROVIDER_ID;
}

const LeavesDeviceLine: React.FC<{ value: boolean | null }> = ({ value }) => {
  if (value === false) {
    return <span className="text-xs text-success">Lokal — data tidak keluar device</span>;
  }
  if (value === true) {
    return <span className="text-xs text-warning">Data keluar device</span>;
  }
  return <span className="text-xs text-textMuted">Privasi belum diverifikasi</span>;
};

export const SettingsModal: React.FC<{
  open: boolean;
  onClose: () => void;
  /** Aksi jobType yang aktif mengisi bilah perintah (R2.3). */
  onUsePrompt?: (text: string) => void;
}> = ({ open, onClose, onUsePrompt }) => {
  const [tab, setTab] = useState<Tab>('provider');
  const [provider, setProvider] = useState<Provider>(DEFAULT_PROVIDER_ID);
  const [secret, setSecret] = useState<SecretStatus>({ hasKey: false, masked: null, model: null });
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [editingKey, setEditingKey] = useState(false);
  const [backendBaseUrl, setBackendBaseUrl] = useState('');
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<TestProviderResult | null>(null);
  const [legacy, setLegacy] = useState<LegacyState>({ apiKey: null, backendBaseUrl: null });
  const [migrating, setMigrating] = useState(false);

  const [consent, setConsent] = useState<{ provider: Provider; purpose: string } | null>(null);
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const promptedProviders = useRef<Set<string>>(new Set());

  const info = getProviderInfo(provider);
  const localProvider = providerIsLocal(info);
  const allowsCustomBaseUrl = providerAllowsCustomBaseUrl(info);
  const mode: 'direct' | 'proxy' = backendBaseUrl.trim() ? 'proxy' : 'direct';

  const refreshSecret = useCallback(async (p: Provider) => {
    try {
      const res = await keylox.settings.hasSecret({ provider: p });
      setSecret(res);
      if (res.model) setModel(res.model);
      if (res.error) {
        setError(
          res.error.code === 'ERR_SECURE_STORAGE_UNAVAILABLE'
            ? 'Penyimpanan aman OS tidak tersedia — key tidak dapat disimpan (hanya jalur sesi).'
            : res.error.message
        );
      }
    } catch (e) {
      setError(describeError(e).message);
    }
  }, []);

  // Muat state saat modal dibuka (tanpa pernah menampilkan key).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus('');
    setError('');
    setTestResult(null);
    setKeyInput('');
    setEditingKey(false);
    setConsent(null);
    setConsentError(null);

    (async () => {
      const found = readLegacyState();
      if (!cancelled) setLegacy(found);

      try {
        const storedBackend = await getSetting(LEGACY_BACKEND_URL);
        if (!cancelled && typeof storedBackend === 'string' && storedBackend) setBackendBaseUrl(storedBackend);
        else if (!cancelled && found.backendBaseUrl) setBackendBaseUrl(found.backendBaseUrl);
      } catch {
        if (!cancelled && found.backendBaseUrl) setBackendBaseUrl(found.backendBaseUrl);
      }

      let active: Provider = DEFAULT_PROVIDER_ID;
      try {
        const storedProvider = await getSetting('provider');
        if (isProviderId(storedProvider)) active = storedProvider;
      } catch {
        /* preferensi provider opsional */
      }

      if (cancelled) return;
      setProvider(active);
      setModel(getProviderInfo(active)?.defaultModel ?? '');
      await refreshSecret(active);
    })();

    return () => { cancelled = true; };
  }, [open, refreshSecret]);

  const hydrateProvider = (next: Provider) => {
    setProvider(next);
    setSecret({ hasKey: false, masked: null, model: null });
    setModel(getProviderInfo(next)?.defaultModel ?? '');
    setBaseUrl('');
    setKeyInput('');
    setEditingKey(false);
    setTestResult(null);
    setStatus('');
    setError('');
  };

  const switchProvider = async (next: Provider) => {
    if (next === provider) return;
    hydrateProvider(next);

    try {
      await keylox.settings.set({ key: 'provider', value: next });
    } catch (e) {
      // Preferensi provider non-rahasia; kegagalan tidak menghalangi pemakaian.
      setError(describeError(e).message);
    }

    await refreshSecret(next);

    const nextInfo = getProviderInfo(next);
    if (nextInfo?.privacy.freeTierTraining === true && !promptedProviders.current.has(next)) {
      promptedProviders.current.add(next);
      setConsentError(null);
      setConsent({ provider: next, purpose: 'Mengaktifkan provider dengan tier gratis yang dapat memakai data untuk pelatihan.' });
    }
  };

  const saveSecret = async () => {
    setError('');
    setStatus('');
    const apiKey = keyInput.trim();

    if (!apiKey && !localProvider) {
      setError('API key masih kosong.');
      return;
    }
    if (providerRequiresBaseUrl(info) && !baseUrl.trim()) {
      setError('Base URL wajib diisi untuk provider kustom.');
      return;
    }

    setBusy(true);
    try {
      await keylox.settings.setSecret({
        provider,
        // Provider lokal boleh tanpa key (§2.12.1: null/kosong hanya ollama/lmstudio).
        apiKey: apiKey || '',
        model: model.trim() || undefined,
        baseUrl: baseUrl.trim() || undefined,
      });
      // Key dibuang dari renderer segera setelah tersimpan di safeStorage.
      setKeyInput('');
      setEditingKey(false);
      setStatus('API key tersimpan terenkripsi (main process).');
      await refreshSecret(provider);
      const onDisk = legacy.apiKey;
      if (onDisk) {
        purgeLegacyKey();
        setLegacy((prev) => ({ ...prev, apiKey: null }));
      }
    } catch (e) {
      const view = describeError(e);
      setError(view.message);
      if (view.suggestion) setStatus(view.suggestion);
    } finally {
      setBusy(false);
    }
  };

  const clearSecret = async () => {
    setError('');
    setStatus('');
    setBusy(true);
    try {
      await keylox.settings.clearSecret({ provider });
      setStatus('API key dihapus dari penyimpanan aman.');
      setTestResult(null);
      await refreshSecret(provider);
    } catch (e) {
      setError(describeError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const testConnection = async () => {
    setError('');
    setStatus('');
    setBusy(true);
    setTestResult(null);
    try {
      const res = await keylox.settings.testProvider({
        provider,
        ...(model.trim() ? { model: model.trim() } : {}),
      });
      setTestResult(res);
      if (!res.ok) {
        const failure = res.error ?? res.errors?.[0] ?? null;
        setError(failure?.message ?? 'Tes provider gagal.');
      } else if (res.verdict === 'limited') {
        setStatus('Sebagian kapabilitas terbatas — aksi di luar subset akan dinonaktifkan.');
      }
    } catch (e) {
      const view = describeError(e);
      setError(view.message);
      if (view.suggestion) setStatus(view.suggestion);
    } finally {
      setBusy(false);
    }
  };

  const saveConnection = async () => {
    setError('');
    setStatus('');
    setBusy(true);
    try {
      await keylox.settings.set({ key: LEGACY_BACKEND_URL, value: backendBaseUrl.trim() });
      await keylox.settings.set({ key: 'provider', value: provider });
      purgeLegacyBackendUrl();
      setLegacy((prev) => ({ ...prev, backendBaseUrl: null }));
      setStatus(backendBaseUrl.trim() ? 'Mode Proxy tersimpan.' : 'Mode Direct tersimpan.');
    } catch (e) {
      const view = describeError(e);
      setError(view.message);
      if (view.suggestion) setStatus(view.suggestion);
    } finally {
      setBusy(false);
    }
  };

  const migrateLegacyKey = async () => {
    const apiKey = legacy.apiKey;
    if (!apiKey) return;
    const target = guessProvider(apiKey);
    setMigrating(true);
    setError('');
    try {
      await keylox.settings.setSecret({
        provider: target,
        apiKey,
        model: getProviderInfo(target)?.defaultModel ?? undefined,
      });
      purgeLegacyKey();
      purgeLegacyBackendUrl();
      setLegacy({ apiKey: null, backendBaseUrl: null });
      setProvider(target);
      setStatus(`Kunci lama dipindahkan ke penyimpanan aman (${getProviderInfo(target)?.label ?? target}).`);
      await refreshSecret(target);
    } catch (e) {
      setError(describeError(e).message);
    } finally {
      setMigrating(false);
    }
  };

  const dismissLegacy = () => {
    purgeLegacyKey();
    setLegacy((prev) => ({ ...prev, apiKey: null }));
    setStatus('Nilai lama di localStorage dibersihkan.');
  };

  const openDocs = async () => {
    if (!info) return;
    setError('');
    try {
      await keylox.shell.openExternal({ url: info.docsUrl });
    } catch (e) {
      const view = describeError(e);
      setError(view.message);
      toastError(e);
    }
  };

  const confirmConsent = async (scope: 'once' | 'session' | 'always') => {
    if (!consent) return;
    setConsentBusy(true);
    setConsentError(null);
    try {
      await keylox.privacy.confirmExternal({ provider: consent.provider, purpose: consent.purpose, scope });
      setConsent(null);
      toastSuccess('Konfirmasi privasi disimpan.');
    } catch (e) {
      const view = describeError(e);
      setConsentError(view.message);
      toastError(e);
    } finally {
      setConsentBusy(false);
    }
  };

  const statusDot = useMemo(() => {
    if (!testResult) return <span className="text-textMuted">● Belum diuji</span>;
    if (testResult.verdict === 'incompatible' || (!testResult.ok && !testResult.verdict)) {
      const code = testResult.error?.code ?? testResult.errors?.[0]?.code ?? 'ERR_PROVIDER_UNREACHABLE';
      return <span className="text-danger">● Tidak kompatibel ({code})</span>;
    }
    if (testResult.verdict === 'limited') {
      return <span className="text-warning">● Terbatas ({testResult.latencyMs ?? '-'} ms)</span>;
    }
    return <span className="text-success">● Siap ({testResult.latencyMs ?? '-'} ms)</span>;
  }, [testResult]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="flex max-h-[85vh] w-[720px] flex-col rounded-lg border border-border bg-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 id="settings-title" className="text-base font-semibold text-textPrimary">Settings</h2>
          <button
            type="button"
            className="text-textMuted transition-colors duration-150 ease-out hover:text-textPrimary"
            onClick={onClose}
            aria-label="Tutup"
          >
            Tutup
          </button>
        </div>

        <div role="tablist" aria-label="Kategori settings" className="flex gap-1 border-b border-border px-5 pt-2">
          {TABS.map((item) => {
            const selected = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(item.id)}
                className={`rounded-t border-b-2 px-3 py-1.5 text-xs transition-colors duration-150 ease-out ${
                  selected
                    ? 'border-active text-active'
                    : 'border-transparent text-textMuted hover:text-textPrimary'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'usage' && <UsagePanel />}
          {tab === 'privacy' && <PrivacyPanel />}

          {tab === 'provider' && (
            <div className="flex flex-col gap-4 text-sm">
              {legacy.apiKey && (
                <div className="rounded border border-warning/40 bg-warning/10 p-3 text-xs">
                  <p className="mb-2">
                    Ditemukan API key lama di <code>localStorage</code> (cara simpan yang tidak aman).
                    Pindahkan ke penyimpanan aman OS, lalu nilai lama dihapus?
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded bg-active px-3 py-1.5 font-semibold text-white transition-colors duration-150 ease-out disabled:opacity-40"
                      onClick={() => void migrateLegacyKey()}
                      disabled={migrating}
                    >
                      {migrating ? 'Memindahkan…' : 'Pindahkan & bersihkan'}
                    </button>
                    <button
                      type="button"
                      className="rounded bg-elevated px-3 py-1.5 transition-colors duration-150 ease-out hover:bg-border"
                      onClick={dismissLegacy}
                      disabled={migrating}
                    >
                      Hapus saja
                    </button>
                  </div>
                </div>
              )}

              {/* Provider + onboarding */}
              <section className="flex flex-col gap-2">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label htmlFor="aiProvider" className="mb-1 block text-[10px] uppercase tracking-wide text-textMuted">
                      Provider
                    </label>
                    <select
                      id="aiProvider"
                      value={provider}
                      onChange={(e) => { if (isProviderId(e.target.value)) void switchProvider(e.target.value); }}
                      className="w-full"
                    >
                      {PROVIDER_IDS.map((id) => (
                        <option key={id} value={id}>{getProviderInfo(id)?.label ?? id}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ease-out ${
                      info?.freeTier === true
                        ? 'bg-active text-white hover:opacity-90'
                        : 'cursor-not-allowed bg-elevated text-textDisabled'
                    }`}
                    onClick={() => void openDocs()}
                    disabled={info?.freeTier !== true}
                    title={
                      info?.freeTier === false
                        ? 'Provider ini tidak menyediakan tier gratis'
                        : info?.freeTier === null
                          ? 'Tier gratis provider ini belum diketahui'
                          : `Buka ${info?.docsUrl ?? ''}`
                    }
                  >
                    Dapatkan API Key Gratis
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {info?.freeTier === true && (
                    <span className="rounded border border-success/30 bg-success/10 px-1.5 py-0.5 text-[10px] text-success">
                      Gratis tersedia
                    </span>
                  )}
                  {info?.freeTier === false && (
                    <span className="rounded border border-border bg-elevated px-1.5 py-0.5 text-[10px] text-textMuted">
                      Tanpa tier gratis
                    </span>
                  )}
                  {info?.freeTier === null && (
                    <span className="rounded border border-border bg-elevated px-1.5 py-0.5 text-[10px] text-textMuted">
                      Tier gratis belum diketahui
                    </span>
                  )}
                  <LeavesDeviceLine value={info?.privacy.leavesDevice ?? null} />
                  {info?.privacy.freeTierTraining === true && (
                    <span className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">
                      Tier gratis dapat dipakai training
                    </span>
                  )}
                </div>

                {info?.privacy.freeTierTraining === true && (
                  <div className="flex items-center justify-between gap-2 rounded border border-warning/30 bg-warning/5 px-2 py-1.5 text-[11px] text-textMuted">
                    <span>{info.privacy.retentionNote}</span>
                    <button
                      type="button"
                      className="shrink-0 rounded border border-warning/40 px-2 py-0.5 text-[10px] text-warning transition-colors duration-150 ease-out hover:bg-warning/10"
                      onClick={() => {
                        setConsentError(null);
                        setConsent({ provider, purpose: 'Mengirim konten ke provider dengan tier gratis yang dapat dipakai untuk pelatihan.' });
                      }}
                    >
                      Konfirmasi pengiriman konten
                    </button>
                  </div>
                )}

                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-textMuted">Kapabilitas model default</div>
                  <CapabilityBadges provider={info} />
                </div>
              </section>

              {/* Key + model */}
              <section className="flex flex-col gap-3 border-t border-border pt-3">
                <div>
                  <label htmlFor="aiApiKey" className="mb-1 block text-[10px] uppercase tracking-wide text-textMuted">
                    API Key
                  </label>
                  {localProvider ? (
                    <p className="rounded border border-border bg-elevated px-2 py-1.5 text-xs text-textMuted">
                      Provider lokal tidak memerlukan API key. Simpan untuk menerapkan model/base URL.
                    </p>
                  ) : secret.hasKey && !editingKey ? (
                    <div className="flex items-center gap-2">
                      <input
                        id="aiApiKey"
                        readOnly
                        value={secret.masked || '••••••••'}
                        aria-label="API key termask"
                        className="flex-1 font-mono"
                      />
                      <button
                        type="button"
                        className="rounded bg-elevated px-3 py-1.5 text-xs transition-colors duration-150 ease-out hover:bg-border"
                        onClick={() => { setEditingKey(true); setKeyInput(''); }}
                      >
                        Ganti
                      </button>
                      <button
                        type="button"
                        className="rounded bg-elevated px-3 py-1.5 text-xs transition-colors duration-150 ease-out hover:bg-border disabled:opacity-40"
                        onClick={() => void clearSecret()}
                        disabled={busy}
                      >
                        Hapus
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        id="aiApiKey"
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder={providerKeyPlaceholder(info)}
                        value={keyInput}
                        onChange={(e) => setKeyInput(e.target.value)}
                        className="flex-1 font-mono"
                      />
                      <button
                        type="button"
                        className="rounded bg-active px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-150 ease-out disabled:opacity-40"
                        onClick={() => void saveSecret()}
                        disabled={busy || (!localProvider && !keyInput.trim())}
                      >
                        {busy ? 'Menyimpan…' : 'Simpan'}
                      </button>
                      {secret.hasKey && (
                        <button
                          type="button"
                          className="rounded bg-elevated px-3 py-1.5 text-xs transition-colors duration-150 ease-out hover:bg-border"
                          onClick={() => { setEditingKey(false); setKeyInput(''); }}
                        >
                          Batal
                        </button>
                      )}
                    </div>
                  )}
                  <p className="mt-1 text-[10px] text-textMuted">
                    Key disimpan terenkripsi oleh OS (<code>safeStorage</code>) dan hanya dibaca main process.
                    Renderer tidak pernah menerima key utuh.
                  </p>
                </div>

                {localProvider && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="rounded bg-active px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-150 ease-out disabled:opacity-40"
                      onClick={() => void saveSecret()}
                      disabled={busy}
                    >
                      {busy ? 'Menyimpan…' : 'Simpan pengaturan provider'}
                    </button>
                  </div>
                )}

                <div>
                  <label htmlFor="aiModel" className="mb-1 block text-[10px] uppercase tracking-wide text-textMuted">
                    Model
                  </label>
                  <input
                    id="aiModel"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full font-mono"
                    placeholder={info?.defaultModel ?? 'model'}
                  />
                  <p className="mt-1 text-[10px] text-textMuted">
                    Model di luar pola provider akan jatuh ke model default (§2.13.2).
                  </p>
                </div>

                <div>
                  <label htmlFor="aiBaseUrl" className="mb-1 block text-[10px] uppercase tracking-wide text-textMuted">
                    Base URL provider
                  </label>
                  <input
                    id="aiBaseUrl"
                    value={allowsCustomBaseUrl ? baseUrl : (info?.baseUrl ?? '')}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    readOnly={!allowsCustomBaseUrl}
                    className="w-full font-mono text-xs read-only:text-textMuted"
                    placeholder={info?.baseUrl ?? 'https://…'}
                  />
                  <p className="mt-1 text-[10px] text-textMuted">
                    {allowsCustomBaseUrl
                      ? (providerRequiresBaseUrl(info) ? 'Wajib diisi untuk provider kustom.' : 'Kosongkan untuk memakai default lokal.')
                      : 'Base URL tetap untuk provider ini (allowlist anti-SSRF §3.7).'}
                  </p>
                </div>
              </section>

              {/* Test + mode */}
              <section className="flex flex-col gap-2 border-t border-border pt-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="rounded bg-elevated px-3 py-1.5 text-xs transition-colors duration-150 ease-out hover:bg-border disabled:opacity-40"
                    onClick={() => void testConnection()}
                    disabled={busy || (!secret.hasKey && !localProvider)}
                  >
                    {busy ? 'Menguji…' : 'Tes Koneksi'}
                  </button>
                  <span className="text-xs" aria-live="polite" data-testid="test-status">{statusDot}</span>
                  {testResult?.verdict && (
                    <span className="text-[10px] text-textMuted">verdict: {verdictLabel(testResult.verdict)}</span>
                  )}
                </div>

                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-textMuted">
                    Aksi AI &amp; dukungan provider
                  </div>
                  <CapabilityJobActions
                    provider={info}
                    onUsePrompt={(text) => {
                      onUsePrompt?.(text);
                      onClose();
                    }}
                  />
                </div>

                <fieldset className="rounded border border-border p-3">
                  <legend className="px-1 text-[10px] uppercase tracking-wide text-textMuted">Mode operasi</legend>
                  <label className="mb-1 flex items-center gap-2 text-xs text-textMuted">
                    <input
                      type="radio"
                      name="aiMode"
                      checked={mode === 'direct'}
                      onChange={() => setBackendBaseUrl('')}
                    />
                    Direct — app memanggil provider langsung (tanpa server)
                  </label>
                  <label className="flex items-center gap-2 text-xs text-textMuted">
                    <input
                      type="radio"
                      name="aiMode"
                      checked={mode === 'proxy'}
                      onChange={() => { if (!backendBaseUrl.trim()) setBackendBaseUrl('http://localhost:8787'); }}
                    />
                    Proxy — lewat backend relay (<code>X-Provider-Key</code>, TLS saja)
                  </label>
                  <div className="mt-2">
                    <label htmlFor="aiBackendUrl" className="mb-1 block text-[10px] uppercase tracking-wide text-textMuted">
                      Backend Base URL
                    </label>
                    <input
                      id="aiBackendUrl"
                      value={backendBaseUrl}
                      onChange={(e) => setBackendBaseUrl(e.target.value)}
                      className="w-full font-mono text-xs"
                      placeholder="https://api.keylox.dev (kosong = Direct)"
                    />
                  </div>
                </fieldset>
              </section>

              {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
              {status && <p className="text-xs text-success" aria-live="polite">{status}</p>}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            className="rounded bg-elevated px-3 py-1.5 text-xs transition-colors duration-150 ease-out hover:bg-border"
            onClick={onClose}
          >
            Tutup
          </button>
          {tab === 'provider' && (
            <button
              type="button"
              className="rounded bg-active px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-150 ease-out disabled:opacity-40"
              onClick={() => void saveConnection()}
              disabled={busy}
            >
              Simpan Koneksi
            </button>
          )}
        </div>
      </div>

      <ConsentDialog
        open={consent !== null}
        provider={consent?.provider ?? provider}
        purpose={consent?.purpose ?? 'Mengirim konten ke provider cloud.'}
        busy={consentBusy}
        error={consentError}
        onCancel={() => setConsent(null)}
        onConfirm={(scope) => void confirmConsent(scope)}
      />
    </div>
  );
};
