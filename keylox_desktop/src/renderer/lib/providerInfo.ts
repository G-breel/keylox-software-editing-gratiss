// Akses bertipe ke SATU sumber kebenaran provider: `src/shared/providerRegistry.js`
// (api-contract v1.2 §2.13). Berkas shared itu data murni CJS tanpa rahasia, sehingga
// renderer boleh membacanya langsung (tanpa channel baru).
//
// Catatan: shared sengaja tidak punya tipe TS (dipakai juga oleh main/backend CJS).
// `@ts-ignore` hanya menutup deklarasi modul; bentuk record ditegakkan oleh
// `RegistryProvider` di bawah agar UI tidak menebak nama field.

// @ts-ignore -- modul data CJS tanpa deklarasi tipe (by design, §2.13)
import registryModule from '../../shared/providerRegistry.js';
// @ts-ignore -- modul data CJS tanpa deklarasi tipe (by design, §2.14.3)
import capabilityModule from '../../shared/capabilityMatrix.js';

import type { AiJobType, Provider, ProviderCapabilities, ProviderPrivacy } from './ipc';

export type CapabilityKey = keyof ProviderCapabilities;

/** Bentuk record kanonik §2.13 (subset yang dipakai UI). */
export interface RegistryProvider {
  id: Provider;
  label: string;
  adapter: 'gemini' | 'anthropic' | 'openai-compatible';
  host: string | null;
  baseUrl: string | null;
  keyPattern: string | null;
  modelPatterns: string[];
  defaultModel: string | null;
  docsUrl: string;
  freeTier: boolean | null;
  capabilities: ProviderCapabilities;
  pricePer1M: { in: number; out: number } | null;
  privacy: ProviderPrivacy;
}

interface RegistryModule {
  PROVIDERS: Record<string, RegistryProvider>;
  PROVIDER_IDS: string[];
  CLIENT_BASE_URL_PROVIDER_IDS: string[];
  DEFAULT_PROVIDER: string;
  getProvider: (id: string) => RegistryProvider | null;
  hasProvider: (id: string) => boolean;
}

interface CapabilityModule {
  capabilityFor: (jobType: string) => CapabilityKey | null;
  canonicalJobType: (jobType: string) => string;
  JOB_CAPABILITY_MATRIX: Record<string, CapabilityKey>;
}

const registry = registryModule as RegistryModule;
const matrix = capabilityModule as CapabilityModule;

/** Urutan tampil mengikuti tabel §2.13.1. */
export const PROVIDER_IDS: readonly Provider[] = Object.freeze(registry.PROVIDER_IDS as Provider[]);

export const DEFAULT_PROVIDER_ID: Provider = registry.DEFAULT_PROVIDER as Provider;

const CUSTOM_BASE_URL_IDS = new Set<string>(registry.CLIENT_BASE_URL_PROVIDER_IDS || []);

export function isProviderId(value: unknown): value is Provider {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(registry.PROVIDERS, value);
}

export function getProviderInfo(id: string): RegistryProvider | null {
  if (!isProviderId(id)) return null;
  return registry.PROVIDERS[id];
}

/** `docsUrl`/`label` aman walau id tidak dikenal (fallback netral, tanpa menebak). */
export function providerLabel(id: string): string {
  return getProviderInfo(id)?.label ?? id;
}

export const CAPABILITY_LABELS: Record<CapabilityKey, string> = {
  json: 'JSON terstruktur',
  vision: 'Vision (frame)',
  audioIn: 'Audio masuk (ASR)',
  audioOut: 'Audio keluar (TTS)',
  tools: 'Tool calling',
};

export type CapabilityState = 'supported' | 'unsupported' | 'unknown';

/** §2.14.3: `false` = tidak didukung; `null` = belum diverifikasi (JANGAN disable). */
export function capabilityState(provider: RegistryProvider | null, key: CapabilityKey): CapabilityState {
  const value = provider?.capabilities?.[key];
  if (value === true) return 'supported';
  if (value === false) return 'unsupported';
  return 'unknown';
}

export interface JobSupport {
  jobType: string;
  capability: CapabilityKey | null;
  state: CapabilityState;
  /** `false` hanya bila kapabilitas eksplisit `false` (§2.14.3). */
  disabled: boolean;
}

export function jobSupport(provider: RegistryProvider | null, jobType: string): JobSupport {
  const capability = matrix.capabilityFor(jobType);
  if (!capability) return { jobType, capability: null, state: 'unknown', disabled: false };
  const state = capabilityState(provider, capability);
  return { jobType, capability, state, disabled: state === 'unsupported' };
}

export function capabilityForJob(jobType: string): CapabilityKey | null {
  return matrix.capabilityFor(jobType);
}

export const JOB_TYPE_LABELS: Record<string, string> = {
  parse_command: 'Perintah AI',
  chat: 'Chat',
  refine: 'Perbaiki rencana',
  transcribe: 'Transkrip audio',
  scene_detect: 'Scene detect',
  ocr: 'OCR teks',
  metadata: 'Metadata otomatis',
  thumbnail: 'Thumbnail AI',
  vision_color: 'Visi warna',
  tts: 'TTS voiceover',
  translate: 'Terjemahkan subtitle',
  moderation: 'Moderasi konten',
  asr: 'Transkrip audio (asr)',
};

export function jobTypeLabel(jobType: string): string {
  return JOB_TYPE_LABELS[jobType] ?? jobType;
}

/**
 * Aksi jobType yang dapat dijalankan dari editor. Dipakai untuk disable + badge
 * "Tidak didukung oleh `<provider>`" (R2.3). `prompt` = saran perintah yang
 * mengisi bilah perintah (bukan panggilan job langsung — job berat lewat backend).
 */
export interface JobAction {
  jobType: AiJobType;
  label: string;
  prompt: string;
}

export const JOB_ACTIONS: readonly JobAction[] = Object.freeze([
  { jobType: 'parse_command', label: 'Perintah AI', prompt: 'Buatkan rencana edit untuk klip terpilih.' },
  { jobType: 'scene_detect', label: 'Scene detect', prompt: 'Deteksi scene pada klip terpilih dan buat auto-cut.' },
  { jobType: 'ocr', label: 'OCR teks', prompt: 'Ambil teks di layar klip terpilih dan jadikan caption.' },
  { jobType: 'thumbnail', label: 'Thumbnail AI', prompt: 'Buat thumbnail dari klip terpilih.' },
  { jobType: 'vision_color', label: 'Visi warna', prompt: 'Samakan warna klip terpilih dengan referensi.' },
  { jobType: 'transcribe', label: 'Transkrip audio', prompt: 'Transkrip audio klip terpilih menjadi subtitle.' },
  { jobType: 'tts', label: 'TTS voiceover', prompt: 'Buat voiceover untuk klip terpilih.' },
  { jobType: 'metadata', label: 'Metadata', prompt: 'Buat judul, deskripsi, dan hashtag untuk proyek ini.' },
]);

/** Provider lokal (tidak butuh key; `leavesDevice === false`). */
export function providerIsLocal(provider: RegistryProvider | null): boolean {
  return provider?.privacy?.leavesDevice === false;
}

/** Hanya `custom`/lokal yang boleh menentukan Base URL sendiri (§3.7 butir 3). */
export function providerAllowsCustomBaseUrl(provider: RegistryProvider | null): boolean {
  return Boolean(provider && CUSTOM_BASE_URL_IDS.has(provider.id));
}

/** `custom` wajib diisi user (§2.13.1). */
export function providerRequiresBaseUrl(provider: RegistryProvider | null): boolean {
  return Boolean(provider && provider.baseUrl === null);
}

const KEY_PLACEHOLDERS: Partial<Record<Provider, string>> = {
  gemini: 'AIza…',
  openai: 'sk-…',
  anthropic: 'sk-ant-…',
  openrouter: 'sk-or-…',
  groq: 'gsk_…',
  deepseek: 'sk-…',
  mistral: '32 karakter',
  xai: 'xai-…',
  together: 'karakter alfanumerik',
  cerebras: 'csk-…',
};

export function providerKeyPlaceholder(provider: RegistryProvider | null): string {
  if (!provider) return 'API key';
  if (provider.keyPattern === null) {
    return providerIsLocal(provider) ? 'Tidak perlu API key' : 'API key';
  }
  return KEY_PLACEHOLDERS[provider.id] ?? 'API key';
}

/** §2.14.1 verdict → label UI. */
export function verdictLabel(verdict: string | undefined): string {
  if (verdict === 'ok') return 'Siap';
  if (verdict === 'limited') return 'Terbatas';
  if (verdict === 'incompatible') return 'Tidak kompatibel';
  return 'Belum diuji';
}

export const USAGE_RANGE_LABELS: Record<string, string> = {
  today: 'Hari ini',
  '7d': '7 hari',
  '30d': '30 hari',
  all: 'Semua',
};

export function formatTokens(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('id-ID').format(Math.max(0, Math.trunc(value)));
}

/** Format USD indikatif (bukan tagihan). `null` → null supaya UI hanya token. */
export function formatUsd(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const abs = Math.abs(value);
  const digits = abs > 0 && abs < 0.01 ? 6 : 4;
  const fixed = value.toFixed(digits);
  const [intPart, decPart = ''] = fixed.split('.');
  const trimmed = decPart.replace(/0+$/, '');
  return `$${trimmed ? `${intPart}.${trimmed}` : `${intPart}.00`}`;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
