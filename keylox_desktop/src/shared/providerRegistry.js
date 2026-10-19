'use strict';

/**
 * Registry provider KANONIK (13 provider) — `api-contract.md` v1.2 §2.13 (ADR-03).
 *
 * **Berkas DATA MURNI — tidak ada rahasia di sini.** Tidak ada API key, tidak ada
 * skema penyimpanan; hanya identitas/routing/kapabilitas/harga indikatif/privasi.
 * Karena itu berkas ini boleh di-`require()` oleh main process, backend (paritas),
 * maupun dibaca renderer untuk menampilkan label/badge/`docsUrl` tanpa channel baru
 * (§2.13 paragraf "Registry adalah sumber kebenaran tunggal").
 *
 * Bentuk CJS (`module.exports`) — sama seperti `src/shared/editPlan.schema.js` —
 * supaya satu berkas bisa dipakai main (CJS), backend (CJS), dan unit test Node.
 *
 * Invarian:
 *  - `PROVIDERS` di-`Object.freeze()` dalam-dalam (rekursif); tidak bisa dimutasi renderer.
 *  - `id` unik & tepat 13 nilai (§2.13.1). Urutan tabel kontrak dipertahankan.
 *  - `pricePer1M` **indikatif (snapshot 2026-10)**, bukan kontrak; `null` = belum diketahui.
 *  - `capabilities`/`privacy` boleh `null` ("belum diketahui") — `null` TIDAK pernah
 *    diperlakukan sebagai `false` (§2.13.3 catatan, §2.14.3).
 *
 * @typedef {Object} ProviderCapabilities
 * @property {boolean|null} json       bisa output JSON terstruktur
 * @property {boolean|null} vision     input gambar/video (frame)
 * @property {boolean|null} audioIn    input audio (ASR)
 * @property {boolean|null} audioOut   output audio (TTS)
 * @property {boolean|null} tools      function/tool calling
 *
 * @typedef {Object} ProviderPrivacy
 * @property {boolean|null} leavesDevice       data keluar dari device?
 * @property {boolean|null} freeTierTraining   tier gratis dipakai untuk training?
 * @property {string} retentionNote            catatan retensi provider (bahasa manusia)
 *
 * @typedef {Object} ProviderRecord
 * @property {string} id
 * @property {string} label
 * @property {'gemini'|'anthropic'|'openai-compatible'} adapter
 * @property {string|null} host          host kanonik (allowlist anti-SSRF); null = ditentukan user (custom)
 * @property {string|null} baseUrl       origin default; null = wajib diisi user (custom)
 * @property {string|null} keyPattern    regex sumber; null = tanpa key (lokal) / user-defined
 * @property {string[]} modelPatterns    regex; model di luar pola → fallback `defaultModel`
 * @property {string|null} defaultModel
 * @property {string} docsUrl            https URL onboarding (allowlist `shell:openExternal`)
 * @property {boolean|null} freeTier
 * @property {ProviderCapabilities} capabilities
 * @property {{in:number,out:number}|null} pricePer1M
 * @property {ProviderPrivacy} privacy
 */

/** @param {T} value @returns {T} */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

/**
 * Rekaman provider (§2.13.1–§2.13.4). Satu baris = satu provider; menambah provider
 * baru = menambah data, bukan kode (ADR-03 aturan teknis #2).
 * @type {Record<string, ProviderRecord>}
 */
const PROVIDERS = deepFreeze({
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    adapter: 'gemini',
    host: 'generativelanguage.googleapis.com',
    baseUrl: 'https://generativelanguage.googleapis.com',
    keyPattern: '^AIza[0-9A-Za-z_-]{35}$|^AQ\\.[A-Za-z0-9_-]{25,}$',
    modelPatterns: ['^gemini-', '^models/gemini-', '^gemma-', '^imagen-', '^text-embedding-'],
    defaultModel: 'gemini-2.5-flash',
    docsUrl: 'https://aistudio.google.com/apikey',
    freeTier: true,
    capabilities: { json: true, vision: true, audioIn: true, audioOut: true, tools: true },
    pricePer1M: { in: 0.3, out: 2.5 },
    privacy: {
      leavesDevice: true,
      freeTierTraining: true,
      retentionNote: 'Tier gratis dapat dipakai melatih model; pakai akun billing untuk opt-out',
    },
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    adapter: 'openai-compatible',
    host: 'api.openai.com',
    baseUrl: 'https://api.openai.com/v1',
    keyPattern: '^sk-[A-Za-z0-9-]{20,}$',
    modelPatterns: ['^gpt-', '^o[1-9]', '^chatgpt-', '^text-embedding-', '^dall-e-'],
    defaultModel: 'gpt-4o-mini',
    docsUrl: 'https://platform.openai.com/api-keys',
    freeTier: false,
    capabilities: { json: true, vision: true, audioIn: true, audioOut: true, tools: true },
    pricePer1M: { in: 0.15, out: 0.6 },
    privacy: {
      leavesDevice: true,
      freeTierTraining: false,
      retentionNote: 'API tidak dipakai training secara default; retensi ≤ 30 hari untuk abuse monitoring',
    },
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    adapter: 'anthropic',
    host: 'api.anthropic.com',
    baseUrl: 'https://api.anthropic.com/v1',
    keyPattern: '^sk-ant-[A-Za-z0-9_-]{20,}$',
    modelPatterns: ['^claude-'],
    defaultModel: 'claude-3-5-haiku-latest',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    freeTier: false,
    capabilities: { json: true, vision: true, audioIn: false, audioOut: false, tools: true },
    pricePer1M: { in: 0.8, out: 4.0 },
    privacy: {
      leavesDevice: true,
      freeTierTraining: false,
      retentionNote: 'Tidak dipakai training secara default; retensi terbatas (kebijakan Anthropic)',
    },
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter (router)',
    adapter: 'openai-compatible',
    host: 'openrouter.ai',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyPattern: '^sk-or-[A-Za-z0-9-]{20,}$',
    modelPatterns: ['^[\\w.-]+/[\\w.:-]+$'],
    defaultModel: 'google/gemini-2.5-flash',
    docsUrl: 'https://openrouter.ai/keys',
    freeTier: true,
    capabilities: { json: true, vision: true, audioIn: false, audioOut: false, tools: true },
    pricePer1M: null,
    privacy: {
      leavesDevice: true,
      freeTierTraining: null,
      retentionNote: 'Router — privasi mengikuti provider upstream terpilih',
    },
  },
  groq: {
    id: 'groq',
    label: 'Groq (LPU)',
    adapter: 'openai-compatible',
    host: 'api.groq.com',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyPattern: '^gsk_[A-Za-z0-9]{20,}$',
    modelPatterns: ['^llama', '^mixtral-', '^gemma', '^qwen', '^deepseek-', '^whisper-'],
    defaultModel: 'llama-3.3-70b-versatile',
    docsUrl: 'https://console.groq.com/keys',
    freeTier: true,
    capabilities: { json: true, vision: false, audioIn: true, audioOut: false, tools: true },
    pricePer1M: { in: 0.59, out: 0.79 },
    privacy: {
      leavesDevice: true,
      freeTierTraining: false,
      retentionNote: 'Tidak dipakai training; penyimpanan terbatas',
    },
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    adapter: 'openai-compatible',
    host: 'api.deepseek.com',
    baseUrl: 'https://api.deepseek.com/v1',
    keyPattern: '^sk-[A-Za-z0-9]{20,}$',
    modelPatterns: ['^deepseek-'],
    defaultModel: 'deepseek-chat',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    freeTier: false,
    capabilities: { json: true, vision: false, audioIn: false, audioOut: false, tools: true },
    pricePer1M: { in: 0.27, out: 1.1 },
    privacy: {
      leavesDevice: true,
      freeTierTraining: true,
      retentionNote: 'Data dapat dipakai peningkatan layanan — butuh konfirmasi pengguna',
    },
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral AI',
    adapter: 'openai-compatible',
    host: 'api.mistral.ai',
    baseUrl: 'https://api.mistral.ai/v1',
    keyPattern: '^[A-Za-z0-9]{32}$',
    modelPatterns: ['^mistral-', '^codestral-', '^pixtral-', '^ministral-'],
    defaultModel: 'mistral-small-latest',
    docsUrl: 'https://console.mistral.ai/api-keys',
    freeTier: true,
    capabilities: { json: true, vision: true, audioIn: false, audioOut: false, tools: true },
    pricePer1M: { in: 0.2, out: 0.6 },
    privacy: {
      leavesDevice: true,
      freeTierTraining: false,
      retentionNote: 'Tier gratis dibatasi; API berbayar tidak dipakai training secara default',
    },
  },
  xai: {
    id: 'xai',
    label: 'xAI Grok',
    adapter: 'openai-compatible',
    host: 'api.x.ai',
    baseUrl: 'https://api.x.ai/v1',
    keyPattern: '^xai-[A-Za-z0-9]{20,}$',
    modelPatterns: ['^grok-'],
    defaultModel: 'grok-2-latest',
    docsUrl: 'https://console.x.ai',
    freeTier: false,
    capabilities: { json: true, vision: true, audioIn: false, audioOut: false, tools: true },
    pricePer1M: { in: 2.0, out: 10.0 },
    privacy: {
      leavesDevice: true,
      freeTierTraining: false,
      retentionNote: 'Tidak dipakai training secara default',
    },
  },
  together: {
    id: 'together',
    label: 'Together AI',
    adapter: 'openai-compatible',
    host: 'api.together.xyz',
    baseUrl: 'https://api.together.xyz/v1',
    keyPattern: '^[A-Za-z0-9_-]{20,}$',
    modelPatterns: ['^[\\w.-]+/[\\w.:-]+$'],
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    docsUrl: 'https://api.together.xyz/settings/api-keys',
    freeTier: false,
    capabilities: { json: true, vision: true, audioIn: false, audioOut: false, tools: true },
    pricePer1M: { in: 0.88, out: 0.88 },
    privacy: {
      leavesDevice: true,
      freeTierTraining: false,
      retentionNote: 'Tidak dipakai training secara default',
    },
  },
  cerebras: {
    id: 'cerebras',
    label: 'Cerebras',
    adapter: 'openai-compatible',
    host: 'api.cerebras.ai',
    baseUrl: 'https://api.cerebras.ai/v1',
    keyPattern: '^csk-[A-Za-z0-9]{20,}$',
    modelPatterns: ['^llama', '^qwen', '^mixtral-'],
    defaultModel: 'llama3.1-8b',
    docsUrl: 'https://cloud.cerebras.ai',
    freeTier: true,
    capabilities: { json: true, vision: false, audioIn: false, audioOut: false, tools: true },
    pricePer1M: { in: 0.1, out: 0.1 },
    privacy: {
      leavesDevice: true,
      freeTierTraining: null,
      retentionNote: 'Tier gratis dapat memakai data untuk peningkatan; cek kebijakan',
    },
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama (lokal)',
    adapter: 'openai-compatible',
    host: 'localhost',
    baseUrl: 'http://localhost:11434/v1',
    keyPattern: null,
    modelPatterns: ['^[\\w.:-]+$'],
    defaultModel: 'llama3.2',
    docsUrl: 'https://ollama.com/download',
    freeTier: true,
    capabilities: { json: true, vision: true, audioIn: false, audioOut: false, tools: true },
    pricePer1M: { in: 0, out: 0 },
    privacy: {
      leavesDevice: false,
      freeTierTraining: false,
      retentionNote: 'Semua inferensi di perangkat — tidak ada data keluar',
    },
  },
  lmstudio: {
    id: 'lmstudio',
    label: 'LM Studio (lokal)',
    adapter: 'openai-compatible',
    host: 'localhost',
    baseUrl: 'http://localhost:1234/v1',
    keyPattern: null,
    modelPatterns: ['^[\\w.:/-]+$'],
    defaultModel: 'qwen2.5-7b-instruct',
    docsUrl: 'https://lmstudio.ai/docs/local-server',
    freeTier: true,
    capabilities: { json: true, vision: true, audioIn: false, audioOut: false, tools: true },
    pricePer1M: { in: 0, out: 0 },
    privacy: {
      leavesDevice: false,
      freeTierTraining: false,
      retentionNote: 'Semua inferensi di perangkat — tidak ada data keluar',
    },
  },
  custom: {
    id: 'custom',
    label: 'Kustom (OpenAI-compatible)',
    adapter: 'openai-compatible',
    // `custom` = host/baseUrl ditentukan user → divalidasi anti-SSRF (§3.7 butir 3).
    host: null,
    baseUrl: null,
    keyPattern: null,
    modelPatterns: [],
    defaultModel: null,
    docsUrl: 'https://platform.openai.com/docs/api-reference',
    freeTier: null,
    capabilities: { json: null, vision: null, audioIn: null, audioOut: null, tools: null },
    pricePer1M: null,
    privacy: {
      leavesDevice: null,
      freeTierTraining: null,
      retentionNote: 'Tidak diketahui — diperlakukan konservatif sebagai "keluar device" + butuh konfirmasi',
    },
  },
});

/** Daftar `id` kanonik, urutan tabel §2.13.1. */
const PROVIDER_IDS = deepFreeze(Object.keys(PROVIDERS));

/** Default pabrik bila `X-Provider`/`provider` tidak diberikan (§3.7). */
// Default = OpenRouter: satu key = 500+ model + tier gratis, dan mendukung semua
// provider lain via routing (ADR-07). Gemini tetap selectable, bukan default.
const DEFAULT_PROVIDER = 'openrouter';

/** Adapter wire yang dikenal (§2.13 bentuk record). */
const ADAPTERS = deepFreeze(['gemini', 'anthropic', 'openai-compatible']);

/** Provider yang inferensinya TIDAK keluar perangkat (§2.13.4 → `leavesDevice:false`). */
const LOCAL_PROVIDER_IDS = deepFreeze(
  PROVIDER_IDS.filter((id) => PROVIDERS[id].privacy.leavesDevice === false)
);

/** Provider yang `baseUrl`-nya boleh ditentukan klien (`custom`/lokal) — §3.7 butir 3 & §3.8 butir 5. */
const CLIENT_BASE_URL_PROVIDER_IDS = deepFreeze(['custom', ...LOCAL_PROVIDER_IDS]);

/**
 * Ambil rekaman provider (tanpa validasi). `null` bila tidak dikenal.
 * @param {string} id
 * @returns {ProviderRecord|null}
 */
function getProvider(id) {
  if (typeof id !== 'string') return null;
  return PROVIDERS[id] || null;
}

/** `true` bila `id` ada di registry. @param {unknown} id */
function hasProvider(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(PROVIDERS, id);
}

/**
 * Host dari `docsUrl` semua provider — dipakai sebagai allowlist `shell:openExternal`
 * (`api-contract.md` §2.12.7 butir 2). Diturunkan dari registry, bukan didaftar ulang.
 * @returns {string[]} host unik (lowercase, tanpa titik akhir)
 */
function docsHosts() {
  const hosts = new Set();
  for (const id of PROVIDER_IDS) {
    const docsUrl = PROVIDERS[id].docsUrl;
    try {
      const host = new URL(docsUrl).hostname.toLowerCase().replace(/\.$/, '');
      if (host) hosts.add(host);
    } catch {
      /* docsUrl invalid diabaikan — registry diuji terpisah */
    }
  }
  return [...hosts].sort();
}

module.exports = {
  PROVIDERS,
  PROVIDER_IDS,
  DEFAULT_PROVIDER,
  ADAPTERS,
  LOCAL_PROVIDER_IDS,
  CLIENT_BASE_URL_PROVIDER_IDS,
  getProvider,
  hasProvider,
  docsHosts,
  deepFreeze,
};
