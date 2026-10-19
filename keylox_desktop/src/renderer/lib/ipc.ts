// Typed wrapper around the OFFICIAL preload surface `window.keylox.*`
// (api-contract v1.2 §2.11 — namespaced). Renderer NEVER touches `ipcRenderer`
// and never `fetch`es an AI provider (SEC-SECRET-02): all AI goes through
// `keylox.ai.invoke` → main process.
//
// `api` (legacy flat names) is kept as a thin typed wrapper so existing
// components keep working while the v2.0 migration lands; it forwards to the
// same namespaced methods (§2.11.3).

/** 13 id registry — `api-contract.md` v1.2 §2.13.1. Jangan hardcode label di UI. */
export type Provider =
  | 'gemini'
  | 'openai'
  | 'anthropic'
  | 'openrouter'
  | 'groq'
  | 'deepseek'
  | 'mistral'
  | 'xai'
  | 'together'
  | 'cerebras'
  | 'ollama'
  | 'lmstudio'
  | 'custom';

/** §2.12.5 — jobType kanonik klien (alias `asr` hanya untuk backend). */
export type AiJobType =
  | 'parse_command' | 'chat' | 'refine' | 'transcribe' | 'scene_detect'
  | 'ocr' | 'metadata' | 'thumbnail' | 'vision_color' | 'tts' | 'translate' | 'moderation';

/** §2.15 — tiga tingkat mode privasi. */
export type PrivacyMode = 'local-only' | 'standard' | 'cloud';
/** §2.15.3 — cakupan konfirmasi kirim konten ke cloud. */
export type ConsentScope = 'once' | 'session' | 'always';
/** §2.15.4 — cakupan hapus data lokal. */
export type WipeScope = 'cache' | 'usage' | 'all';
/** §2.16 — rentang `usage:get`. */
export type UsageRange = 'today' | '7d' | '30d' | 'all';

/** ErrorShape (api-contract §5.1) — tidak pernah memuat rahasia. */
export interface ErrorShapeLike {
  code: string;
  message: string;
  retryable?: boolean;
  details?: unknown;
  httpStatus?: number;
  timestamp?: string;
}

export interface SecretStatus {
  hasKey: boolean;
  /** Selalu termask (`AIza••••••••1234`) atau null. Tidak pernah key utuh. */
  masked: string | null;
  model: string | null;
  /** Diisi bila safeStorage OS tidak tersedia (ERR_SECURE_STORAGE_UNAVAILABLE). */
  error?: ErrorShapeLike;
}

/** §2.13.3 — `null` = belum diketahui; JANGAN diperlakukan sebagai `false`. */
export interface ProviderCapabilities {
  json: boolean | null;
  vision: boolean | null;
  audioIn: boolean | null;
  audioOut: boolean | null;
  tools: boolean | null;
}

/** §2.13.4 */
export interface ProviderPrivacy {
  leavesDevice: boolean | null;
  freeTierTraining: boolean | null;
  retentionNote: string;
}

export interface ProviderTestError {
  code: string;
  message: string;
  level: 1 | 2 | 3;
}

/** §2.14.1 — `settings:testProvider` v2 (bentuk v1.1 tetap subset). */
export interface TestProviderResult {
  ok: boolean;
  latencyMs: number | null;
  provider?: string;
  model?: string;
  capabilities?: ProviderCapabilities;
  verdict?: 'ok' | 'limited' | 'incompatible';
  privacy?: ProviderPrivacy;
  errors?: ProviderTestError[];
  /** Bentuk v1.1 (dipertahankan): `errors[0]` v1.2 dipetakan ke sini. */
  error?: { code: string; message: string } | null;
}

export interface AiInvokeResult<T = unknown> {
  result: T;
  tokens: { input: number; output: number };
  cacheHit: boolean;
  latencyMs?: number;
  provider?: string;
  model?: string;
  capability?: string | null;
  jobType?: string;
}

/** §2.16 — UsageSummary kanonik. */
export interface UsageItem {
  recordedAt: string;
  provider: string;
  model: string;
  jobType: string;
  inputTokens: number;
  outputTokens: number;
  estCostUsd: number | null;
  cacheHit: boolean;
}

export interface UsageSummary {
  range: string;
  totals: {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    estCostUsd: number | null;
  };
  items: UsageItem[];
}

/** §2.15.4 */
export interface WipeLocalResult {
  freedBytes: number;
  deleted: { cache?: number; usage?: number; embeddings?: number };
}

/** §2.15.5 — `canceled` aditif bila dialog simpan dibatalkan. */
export interface ExportLocalResult {
  filePath: string | null;
  size: number;
  canceled?: boolean;
}

/* ------------------------------------------------------------------ *
 * EditPlan (api-contract §3.3) — sudah divalidasi Zod di main sebelum sampai
 * ke sini; renderer tetap memeriksa bentuk sebelum menerapkan (AC-8, §3.3.2).
 * ------------------------------------------------------------------ */

export interface EditPlanOp {
  opId: string;
  opType: string;
  target: { type: 'clip' | 'track' | 'project' | 'asset' | 'text' | 'effect'; id: string };
  params: Record<string, unknown>;
  timeRange?: { startMs: number; endMs: number } | null;
  order: number;
}

export interface EditPlan {
  planId: string;
  commandId: string;
  planVersion: number;
  isDestructive: boolean;
  requiresConfirm: boolean;
  diffSummary: string;
  ops: EditPlanOp[];
  commandRef?: number | null;
  confidence?: number;
  needsClarification?: boolean;
  clarificationQuestion?: string | null;
}

export interface AiChatReply {
  reply: string;
  plan?: EditPlan;
}

export interface KeyloxApi {
  dialog: {
    openFiles: () => Promise<string[]>;
    openFolder: () => Promise<string | null>;
    saveFile: (name?: string) => Promise<string | null>;
  };
  fs: {
    readDir: (dir: string) => Promise<{ name: string; path: string; isDir: boolean }[]>;
    stat: (p: string) => Promise<{ size: number; mtime: number } | null>;
  };
  shell: {
    openPath: (p: string) => Promise<void>;
    /** §2.12.7 [v1.2] — hanya https + host allowlist; ditegakkan di MAIN. */
    openExternal: (input: { url: string }) => Promise<{ ok: boolean }>;
  };
  ffmpeg: {
    probe: (p: string) => Promise<any>;
    export: (opts: any) => Promise<{ success: boolean; path?: string; error?: string }>;
    thumbnail: (p: string, tSec: number) => Promise<string | null>;
    onProgress: (cb: (v: number) => void) => () => void;
  };
  project: {
    createWithMedia: (spec: { mediaCount: number; fixture?: string }) => Promise<unknown>;
  };
  settings: {
    get: (input: { key: string }) => Promise<unknown>;
    set: (input: { key: string; value: unknown }) => Promise<{ ok: boolean }>;
    setSecret: (input: { provider: Provider; apiKey: string; model?: string; baseUrl?: string }) => Promise<{ ok: boolean; hasKey?: boolean; masked?: string; model?: string }>;
    hasSecret: (input: { provider: Provider }) => Promise<SecretStatus>;
    clearSecret: (input: { provider: Provider }) => Promise<{ ok: boolean }>;
    testProvider: (input: { provider: Provider; model?: string }) => Promise<TestProviderResult>;
  };
  ai: {
    invoke: (input: { provider: Provider; jobType: AiJobType; payload: Record<string, unknown> }) => Promise<AiInvokeResult<any>>;
  };
  /** §2.16 [v1.2] */
  usage: {
    get: (input?: { range?: UsageRange; provider?: string; model?: string }) => Promise<UsageSummary>;
  };
  /** §2.15 [v1.2] */
  privacy: {
    getMode: () => Promise<{ mode: PrivacyMode }>;
    setMode: (input: { mode: PrivacyMode }) => Promise<{ ok: boolean; mode?: PrivacyMode }>;
    confirmExternal: (input: { provider: Provider; purpose?: string; scope: ConsentScope }) => Promise<{ ok: boolean; grantedAt: string }>;
  };
  /** §2.15.4–§2.15.5 [v1.2] — data lokal (tidak pernah menyentuh key/proyek). */
  data: {
    wipeLocal: (input: { scope: WipeScope; confirm: true }) => Promise<WipeLocalResult>;
    exportLocal: (input?: { includeSecrets?: boolean }) => Promise<ExportLocalResult>;
  };
}

/** Permukaan lama (§2.11.3) — masih didukung sampai v2.0. */
export interface Api {
  openFiles: () => Promise<string[]>;
  openFolder: () => Promise<string | null>;
  saveFile: (name: string) => Promise<string | null>;
  readDir: (dir: string) => Promise<{ name: string; path: string; isDir: boolean }[]>;
  stat: (p: string) => Promise<{ size: number; mtime: number } | null>;
  openInFolder: (p: string) => Promise<void>;
  probe: (p: string) => Promise<any>;
  exportVideo: (opts: any) => Promise<{ success: boolean; path?: string; error?: string }>;
  thumbnail: (p: string, t: number) => Promise<string | null>;
  onProgress: (cb: (v: number) => void) => void | (() => void);
}

declare global {
  interface Window {
    keylox?: KeyloxApi;
    api?: Api;
  }
}

/** Error dari channel BYOK membawa `.code` (mis. ERR_AI_NO_KEY) — §5.2.1. */
export function isKeyloxError(e: unknown): e is Error & { code: string; retryable?: boolean } {
  return Boolean(e) && typeof e === 'object' && typeof (e as { code?: unknown }).code === 'string';
}

export function errorCodeOf(e: unknown): string | null {
  return isKeyloxError(e) ? e.code : null;
}

export interface KeyloxErrorView {
  code: string;
  message: string;
  retryable: boolean;
  /** §5.2.1: true bila UI harus menampilkan CTA "Atur API Key". */
  needsApiKey: boolean;
  /** §5.2.1 v1.2: provider tidak punya kapabilitas wajib untuk jobType. */
  needsProviderChange: boolean;
  /** §5.2.1 v1.2: UI harus membuka dialog `privacy:confirmExternal`. */
  needsConsent: boolean;
  /** §5.2.1 v1.2: mode `local-only` memblokir panggilan cloud. */
  privacyBlocked: boolean;
  /** §5.2.1 v1.2: base URL ditolak anti-SSRF/allowlist. */
  baseUrlRejected: boolean;
  /** Saran tindakan untuk toast (§5.2.1 kolom "Aksi renderer"). */
  suggestion: string | null;
  /** Detail debug dari ErrorShape — JANGAN dirender mentah ke user (§5.1). */
  details?: unknown;
}

/** §5.2.1 — aksi renderer per kode error (teks Bahasa Indonesia). */
const ERROR_SUGGESTIONS: Record<string, string> = {
  ERR_AI_NO_KEY: 'Atur API key di Settings › AI Provider, lalu coba lagi.',
  ERR_PROVIDER_KEY_INVALID: 'Periksa kembali API key provider, lalu simpan ulang.',
  ERR_SECURE_STORAGE_UNAVAILABLE: 'Penyimpanan aman OS tidak tersedia — key hanya dapat dipakai pada sesi ini.',
  ERR_PROVIDER_UNREACHABLE: 'Provider tidak dapat dihubungi. Periksa koneksi lalu coba lagi.',
  ERR_PROVIDER_UNSUPPORTED: 'Provider/model belum didukung. Pilih provider lain di Settings.',
  ERR_PROVIDER_INCOMPATIBLE:
    'Provider aktif tidak punya kapabilitas wajib untuk tugas ini. Ganti provider atau model di Settings › AI Provider.',
  ERR_PROVIDER_MODEL_UNSUPPORTED:
    'Model tidak cocok dengan provider. Gunakan model default provider di Settings › AI Provider.',
  ERR_PROVIDER_BASE_URL_NOT_ALLOWED: 'Base URL tidak diizinkan. Kosongkan kolom Base URL untuk memakai default provider.',
  ERR_PRIVACY_CONSENT_REQUIRED:
    'Konfirmasi pengiriman konten ke provider cloud sebelum melanjutkan.',
  ERR_PRIVACY_LOCAL_ONLY_BLOCKED:
    'Mode privasi local-only memblokir panggilan cloud. Ubah mode privasi atau pakai model lokal (Ollama/LM Studio).',
  ERR_AI_RATE_LIMIT: 'Batas laju provider tercapai. Tunggu sebentar lalu coba lagi.',
  ERR_IPC_CHANNEL_DENIED: 'Terjadi kesalahan internal (channel IPC tidak diizinkan).',
  ERR_VALIDATION_SECRET_IN_PLAIN_SETTING: 'Rahasia tidak boleh disimpan lewat settings biasa.',
};

/** Normalisasi error apa pun → tampilan yang siap dipakai UI (§5.2.1 & §5.3). */
export function describeError(e: unknown): KeyloxErrorView {
  if (isKeyloxError(e)) {
    const code = e.code;
    return {
      code,
      message: e.message,
      retryable: e.retryable === true,
      needsApiKey: code === 'ERR_AI_NO_KEY',
      needsProviderChange: code === 'ERR_PROVIDER_INCOMPATIBLE' || code === 'ERR_PROVIDER_UNSUPPORTED',
      needsConsent: code === 'ERR_PRIVACY_CONSENT_REQUIRED',
      privacyBlocked: code === 'ERR_PRIVACY_LOCAL_ONLY_BLOCKED',
      baseUrlRejected: code === 'ERR_PROVIDER_BASE_URL_NOT_ALLOWED',
      suggestion: ERROR_SUGGESTIONS[code] ?? null,
      details: (e as Error & { details?: unknown }).details,
    };
  }
  const message = e instanceof Error ? e.message : 'Kesalahan tidak dikenal.';
  return {
    code: 'ERR_UNKNOWN',
    message,
    retryable: false,
    needsApiKey: false,
    needsProviderChange: false,
    needsConsent: false,
    privacyBlocked: false,
    baseUrlRejected: false,
    suggestion: null,
  };
}

/**
 * `settings:get` sudah dikontrak mengembalikan `{ value, error }` (§2.7), tetapi
 * aksesori preload v1.2 mengembalikan nilai langsung. Baca keduanya agar tahan
 * terhadap kedua bentuk tanpa menebak.
 */
export async function getSetting(key: string): Promise<unknown> {
  const raw = await keylox.settings.get({ key });
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'value' in (raw as Record<string, unknown>)) {
    return (raw as { value?: unknown }).value ?? null;
  }
  return raw ?? null;
}

function unavailable(): never {
  const err = new Error('Permukaan preload window.keylox tidak tersedia (preload gagal dimuat).');
  (err as Error & { code?: string }).code = 'ERR_IPC_CHANNEL_DENIED';
  throw err;
}

function unavailableSilently(): Error {
  const err = new Error('Preload lama tidak mengekspos permukaan ini.');
  (err as Error & { code?: string }).code = 'ERR_IPC_CHANNEL_DENIED';
  return err;
}

/**
 * Fallback: bila build lama hanya mengekspos `window.api` (tanpa namespace),
 * bangun namespace dari alias deprecated agar UI tidak pecah.
 */
function namespacedFromLegacy(legacy: Api): KeyloxApi {
  return {
    dialog: {
      openFiles: () => legacy.openFiles(),
      openFolder: () => legacy.openFolder(),
      saveFile: (name) => legacy.saveFile(name ?? ''),
    },
    fs: { readDir: (dir) => legacy.readDir(dir), stat: (p) => legacy.stat(p) },
    shell: {
      openPath: (p) => Promise.resolve(legacy.openInFolder(p)),
      openExternal: () => Promise.reject(unavailableSilently()),
    },
    ffmpeg: {
      probe: (p) => legacy.probe(p),
      export: (opts) => legacy.exportVideo(opts),
      thumbnail: (p, t) => legacy.thumbnail(p, t),
      onProgress: (cb) => {
        const off = legacy.onProgress(cb);
        return typeof off === 'function' ? off : () => {};
      },
    },
    project: { createWithMedia: () => Promise.reject(unavailableSilently()) },
    settings: {
      get: () => Promise.resolve(null),
      set: () => Promise.reject(unavailableSilently()),
      setSecret: () => Promise.reject(unavailableSilently()),
      hasSecret: () => Promise.resolve({ hasKey: false, masked: null, model: null }),
      clearSecret: () => Promise.reject(unavailableSilently()),
      testProvider: () => Promise.resolve({ ok: false, latencyMs: null, error: { code: 'ERR_PROVIDER_UNREACHABLE', message: 'Preload lama tidak mendukung BYOK.' } }),
    },
    ai: { invoke: () => Promise.reject(unavailableSilently()) },
    usage: { get: () => Promise.reject(unavailableSilently()) },
    privacy: {
      getMode: () => Promise.resolve({ mode: 'standard' }),
      setMode: () => Promise.reject(unavailableSilently()),
      confirmExternal: () => Promise.reject(unavailableSilently()),
    },
    data: {
      wipeLocal: () => Promise.reject(unavailableSilently()),
      exportLocal: () => Promise.reject(unavailableSilently()),
    },
  };
}

/** Permukaan resmi. */
export const keylox: KeyloxApi = (() => {
  if (typeof window === 'undefined') return undefined as unknown as KeyloxApi;
  if (window.keylox) return window.keylox;
  if (window.api) return namespacedFromLegacy(window.api);
  return {
    dialog: { openFiles: unavailable, openFolder: unavailable, saveFile: unavailable },
    fs: { readDir: unavailable, stat: unavailable },
    shell: { openPath: unavailable, openExternal: unavailable },
    ffmpeg: { probe: unavailable, export: unavailable, thumbnail: unavailable, onProgress: () => () => {} },
    project: { createWithMedia: unavailable },
    settings: {
      get: unavailable,
      set: unavailable,
      setSecret: unavailable,
      hasSecret: unavailable,
      clearSecret: unavailable,
      testProvider: unavailable,
    },
    ai: { invoke: unavailable },
    usage: { get: unavailable },
    privacy: { getMode: unavailable, setMode: unavailable, confirmExternal: unavailable },
    data: { wipeLocal: unavailable, exportLocal: unavailable },
  } as unknown as KeyloxApi;
})();

/** Wrapper kompatibilitas untuk komponen lama (nama rata). */
export const api: Api = {
  openFiles: () => keylox.dialog.openFiles(),
  openFolder: () => keylox.dialog.openFolder(),
  saveFile: (name: string) => keylox.dialog.saveFile(name),
  readDir: (dir: string) => keylox.fs.readDir(dir),
  stat: (p: string) => keylox.fs.stat(p),
  openInFolder: (p: string) => keylox.shell.openPath(p),
  probe: (p: string) => keylox.ffmpeg.probe(p),
  exportVideo: (opts: any) => keylox.ffmpeg.export(opts),
  thumbnail: (p: string, t: number) => keylox.ffmpeg.thumbnail(p, t),
  onProgress: (cb: (v: number) => void) => keylox.ffmpeg.onProgress(cb),
};
