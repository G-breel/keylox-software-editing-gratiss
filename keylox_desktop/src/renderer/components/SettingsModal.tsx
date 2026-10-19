import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  keylox,
  describeError,
  type Provider,
  type SecretStatus,
  type TestProviderResult,
} from '../lib/ipc';

/**
 * Settings › AI Provider (BYOK) — api-contract v1.1 §6.1 / §2.12, byok-api-key.md §4.
 *
 * Kontrak yang dipatuhi komponen ini:
 *  - Renderer TIDAK PERNAH memegang key: hanya `{ hasKey, masked, model }` (§2.12.2).
 *    Key diisi sekali, dikirim ke main (`settings:setSecret`), lalu dibuang dari
 *    memori renderer (input dibersihkan).
 *  - TIDAK ADA `localStorage` untuk key / backendBaseUrl. Nilai lama (BUG-01)
 *    ditawarkan untuk dipindah ke `safeStorage`, lalu DIHAPUS dari localStorage.
 *  - Mode DIRECT/PROXY: `backendBaseUrl` kosong → DIRECT (§6.4).
 */

const PROVIDER_LABEL: Record<Provider, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI-compatible',
};

const DEFAULT_MODEL: Record<Provider, string> = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
};

const BASE_URL_PLACEHOLDER: Record<Provider, string> = {
  gemini: 'https://generativelanguage.googleapis.com',
  openai: 'https://api.openai.com/v1',
};

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
  return /^sk-/.test(apiKey) ? 'openai' : 'gemini';
}

export const SettingsModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [provider, setProvider] = useState<Provider>('gemini');
  const [secret, setSecret] = useState<SecretStatus>({ hasKey: false, masked: null, model: null });
  const [model, setModel] = useState(DEFAULT_MODEL.gemini);
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

    (async () => {
      const found = readLegacyState();
      if (!cancelled) setLegacy(found);

      try {
        const stored = await keylox.settings.get({ key: LEGACY_BACKEND_URL });
        if (!cancelled && typeof stored === 'string' && stored) setBackendBaseUrl(stored);
        else if (!cancelled && found.backendBaseUrl) setBackendBaseUrl(found.backendBaseUrl);
      } catch {
        if (!cancelled && found.backendBaseUrl) setBackendBaseUrl(found.backendBaseUrl);
      }

      if (!cancelled) await refreshSecret('gemini');
    })();

    return () => { cancelled = true; };
  }, [open, refreshSecret]);

  const switchProvider = async (next: Provider) => {
    setProvider(next);
    setSecret({ hasKey: false, masked: null, model: null });
    setModel(DEFAULT_MODEL[next]);
    setBaseUrl('');
    setKeyInput('');
    setEditingKey(false);
    setTestResult(null);
    setStatus('');
    setError('');
    await refreshSecret(next);
  };

  const saveSecret = async () => {
    setError('');
    setStatus('');
    const apiKey = keyInput.trim();
    if (!apiKey) { setError('API key masih kosong.'); return; }
    setBusy(true);
    try {
      await keylox.settings.setSecret({
        provider,
        apiKey,
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
    setBusy(true);
    setTestResult(null);
    try {
      const res = await keylox.settings.testProvider({ provider });
      setTestResult(res);
      if (!res.ok && res.error) setError(res.error.message);
    } catch (e) {
      setError(describeError(e).message);
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
      purgeLegacyBackendUrl();
      setLegacy((prev) => ({ ...prev, backendBaseUrl: null }));
      setStatus(backendBaseUrl.trim() ? 'Mode Proxy tersimpan.' : 'Mode Direct tersimpan.');
    } catch (e) {
      setError(describeError(e).message);
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
      await keylox.settings.setSecret({ provider: target, apiKey, model: DEFAULT_MODEL[target] });
      purgeLegacyKey();
      purgeLegacyBackendUrl();
      setLegacy({ apiKey: null, backendBaseUrl: null });
      setProvider(target);
      setStatus(`Kunci lama dipindahkan ke penyimpanan aman (${PROVIDER_LABEL[target]}).`);
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

  const statusDot = useMemo(() => {
    if (!testResult) return <span className="text-textMuted">● Belum diuji</span>;
    if (testResult.ok) return <span className="text-active">● Terhubung ({testResult.latencyMs ?? '-'} ms)</span>;
    return <span className="text-warning">● Gagal ({testResult.error?.code || 'ERR_PROVIDER_UNREACHABLE'})</span>;
  }, [testResult]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="bg-panel rounded-lg p-5 w-[560px] max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 id="settings-title" className="text-lg font-semibold">Settings › AI Provider</h2>
          <button className="text-textMuted" onClick={onClose} aria-label="Tutup">✕</button>
        </div>

        {legacy.apiKey && (
          <div className="mb-3 rounded border border-warning/40 bg-warning/10 p-3 text-xs">
            <p className="mb-2">
              Ditemukan API key lama di <code>localStorage</code> (cara simpan yang tidak aman).
              Pindahkan ke penyimpanan aman OS, lalu nilai lama dihapus?
            </p>
            <div className="flex gap-2">
              <button
                className="px-3 py-1.5 bg-active text-white rounded font-semibold"
                onClick={migrateLegacyKey}
                disabled={migrating}
              >
                {migrating ? 'Memindahkan…' : 'Pindahkan & bersihkan'}
              </button>
              <button className="px-3 py-1.5 bg-elevated rounded" onClick={dismissLegacy} disabled={migrating}>
                Hapus saja
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 text-sm">
          <div>
            <label htmlFor="aiProvider" className="text-xs text-textMuted block mb-1">Provider</label>
            <select
              id="aiProvider"
              value={provider}
              onChange={(e) => switchProvider(e.target.value as Provider)}
              className="w-full"
            >
              {(Object.keys(PROVIDER_LABEL) as Provider[]).map((p) => (
                <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="aiApiKey" className="text-xs text-textMuted block mb-1">API Key</label>
            {secret.hasKey && !editingKey ? (
              <div className="flex items-center gap-2">
                <input
                  id="aiApiKey"
                  readOnly
                  value={secret.masked || '••••••••'}
                  aria-label="API key termask"
                  className="flex-1 font-mono"
                />
                <button className="px-3 py-1.5 bg-elevated text-xs rounded" onClick={() => { setEditingKey(true); setKeyInput(''); }}>Ganti</button>
                <button className="px-3 py-1.5 bg-elevated text-xs rounded" onClick={clearSecret} disabled={busy}>Hapus</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  id="aiApiKey"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={provider === 'gemini' ? 'AIza…' : 'sk-…'}
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  className="flex-1 font-mono"
                />
                <button className="px-3 py-1.5 bg-active text-white text-xs rounded font-semibold" onClick={saveSecret} disabled={busy || !keyInput.trim()}>
                  {busy ? 'Menyimpan…' : 'Simpan'}
                </button>
                {secret.hasKey && (
                  <button className="px-3 py-1.5 bg-elevated text-xs rounded" onClick={() => { setEditingKey(false); setKeyInput(''); }}>Batal</button>
                )}
              </div>
            )}
            <p className="text-xs text-textMuted mt-1">
              Key disimpan terenkripsi oleh OS (<code>safeStorage</code>) dan hanya dibaca main process.
              Renderer tidak pernah menerima key utuh.
            </p>
          </div>

          <div>
            <label htmlFor="aiModel" className="text-xs text-textMuted block mb-1">Model</label>
            <input
              id="aiModel"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full"
              placeholder={DEFAULT_MODEL[provider]}
            />
          </div>

          <div>
            <label htmlFor="aiBaseUrl" className="text-xs text-textMuted block mb-1">Base URL provider</label>
            <input
              id="aiBaseUrl"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full font-mono text-xs"
              placeholder={BASE_URL_PLACEHOLDER[provider]}
            />
            <p className="text-xs text-textMuted mt-1">Kosongkan untuk memakai default provider.</p>
          </div>

          <div className="flex items-center gap-3">
            <button className="px-3 py-1.5 bg-elevated text-xs rounded" onClick={testConnection} disabled={busy || !secret.hasKey}>
              {busy ? 'Menguji…' : 'Tes Koneksi'}
            </button>
            <span className="text-xs" aria-live="polite" data-testid="test-status">{statusDot}</span>
          </div>

          <fieldset className="border border-border rounded p-3">
            <legend className="text-xs text-textMuted px-1">Mode operasi</legend>
            <label className="flex items-center gap-2 text-xs mb-1">
              <input
                type="radio"
                name="aiMode"
                checked={mode === 'direct'}
                onChange={() => setBackendBaseUrl('')}
              />
              Direct — app memanggil provider langsung (tanpa server)
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="radio"
                name="aiMode"
                checked={mode === 'proxy'}
                onChange={() => { if (!backendBaseUrl.trim()) setBackendBaseUrl('http://localhost:8787'); }}
              />
              Proxy — lewat backend relay (<code>X-Provider-Key</code>, TLS saja)
            </label>
            <div className="mt-2">
              <label htmlFor="aiBackendUrl" className="text-xs text-textMuted block mb-1">Backend Base URL</label>
              <input
                id="aiBackendUrl"
                value={backendBaseUrl}
                onChange={(e) => setBackendBaseUrl(e.target.value)}
                className="w-full font-mono text-xs"
                placeholder="https://api.keylox.dev (kosong = Direct)"
              />
            </div>
          </fieldset>

          {(error || status) && (
            <div aria-live="polite">
              {error && <p className="text-xs text-warning">{error}</p>}
              {status && <p className="text-xs text-active">{status}</p>}
            </div>
          )}

          <div className="flex justify-end gap-2 mt-1">
            <button className="px-3 py-1.5 bg-elevated text-xs rounded" onClick={onClose}>Tutup</button>
            <button className="px-3 py-1.5 bg-active text-white text-xs rounded font-semibold" onClick={saveConnection} disabled={busy}>
              Simpan Koneksi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
