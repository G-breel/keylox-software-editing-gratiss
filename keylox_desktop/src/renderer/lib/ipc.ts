// Typed wrapper around the OFFICIAL preload surface `window.keylox.*`
// (api-contract v1.1 §2.11 — namespaced). Renderer NEVER touches `ipcRenderer`
// and never `fetch`es an AI provider (SEC-SECRET-02): all AI goes through
// `keylox.ai.invoke` → main process.
//
// `api` (legacy flat names) is kept as a thin typed wrapper so existing
// components keep working while the v2.0 migration lands; it forwards to the
// same namespaced methods (§2.11.3).

export type Provider = 'gemini' | 'openai';

export type AiJobType =
  | 'parse_command' | 'chat' | 'refine' | 'transcribe' | 'scene_detect'
  | 'ocr' | 'metadata' | 'thumbnail' | 'vision_color' | 'tts' | 'translate' | 'moderation';

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

export interface TestProviderResult {
  ok: boolean;
  latencyMs: number | null;
  error: { code: string; message: string } | null;
}

export interface AiInvokeResult<T = unknown> {
  result: T;
  tokens: { input: number; output: number };
  cacheHit: boolean;
  latencyMs?: number;
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
    testProvider: (input: { provider: Provider }) => Promise<TestProviderResult>;
  };
  ai: {
    invoke: (input: { provider: Provider; jobType: AiJobType; payload: Record<string, unknown> }) => Promise<AiInvokeResult<any>>;
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
}

/** Normalisasi error apa pun → tampilan yang siap dipakai UI (§5.2.1 & §5.3). */
export function describeError(e: unknown): KeyloxErrorView {
  if (isKeyloxError(e)) {
    return {
      code: e.code,
      message: e.message,
      retryable: e.retryable === true,
      needsApiKey: e.code === 'ERR_AI_NO_KEY',
    };
  }
  const message = e instanceof Error ? e.message : 'Kesalahan tidak dikenal.';
  return { code: 'ERR_UNKNOWN', message, retryable: false, needsApiKey: false };
}

function unavailable(): never {
  const err = new Error('Permukaan preload window.keylox tidak tersedia (preload gagal dimuat).');
  (err as Error & { code?: string }).code = 'ERR_IPC_CHANNEL_DENIED';
  throw err;
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
    shell: { openPath: (p) => Promise.resolve(legacy.openInFolder(p)) },
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
  };
}

function unavailableSilently(): Error {
  const err = new Error('Preload lama tidak mengekspos permukaan ini.');
  (err as Error & { code?: string }).code = 'ERR_IPC_CHANNEL_DENIED';
  return err;
}

/** Permukaan resmi. */
export const keylox: KeyloxApi = (() => {
  if (typeof window === 'undefined') return undefined as unknown as KeyloxApi;
  if (window.keylox) return window.keylox;
  if (window.api) return namespacedFromLegacy(window.api);
  return {
    dialog: { openFiles: unavailable, openFolder: unavailable, saveFile: unavailable },
    fs: { readDir: unavailable, stat: unavailable },
    shell: { openPath: unavailable },
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
