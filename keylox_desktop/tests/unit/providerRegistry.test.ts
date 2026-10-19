// Unit tests — registry provider kanonik v1.2 (api-contract v1.2 §2.13, ADR-03).
//
// Yang dikunci di sini:
//  - tepat 13 provider dengan id unik sesuai tabel §2.13.1 (bukan 11/12, bukan tebakan);
//  - setiap record lengkap: adapter dikenal, docsUrl https, regex valid, kapabilitas/privacy;
//  - registry di-deep-freeze (renderer tidak bisa memutasi sumber kebenaran);
//  - provider lokal & provider yang boleh menimpa baseUrl diturunkan dari privacy;
//  - wrapper main (resolveProvider/resolveModel/modelsFor) + validasi key format baru (groq).
import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';

interface ProviderRecord {
  id: string;
  label: string;
  adapter: string;
  host: string | null;
  baseUrl: string | null;
  keyPattern: string | null;
  modelPatterns: string[];
  defaultModel: string | null;
  docsUrl: string;
  freeTier: boolean | null;
  capabilities: Record<string, boolean | null>;
  pricePer1M: { in: number; out: number } | null;
  privacy: { leavesDevice: boolean | null; freeTierTraining: boolean | null; retentionNote: string };
}

interface SharedRegistry {
  PROVIDERS: Record<string, ProviderRecord>;
  PROVIDER_IDS: string[];
  DEFAULT_PROVIDER: string;
  ADAPTERS: string[];
  LOCAL_PROVIDER_IDS: string[];
  CLIENT_BASE_URL_PROVIDER_IDS: string[];
  getProvider: (id: unknown) => ProviderRecord | null;
  hasProvider: (id: unknown) => boolean;
  docsHosts: () => string[];
}

interface MainRegistry extends SharedRegistry {
  resolveProvider: (id: string) => ProviderRecord | null;
  resolveModel: (id: string, model?: string | null) => string | null;
  modelsFor: (id: string) => string[];
}

interface ProviderPolicy {
  validateApiKey: (provider: string, apiKey: unknown) => string;
  validateProvider: (provider: unknown) => string;
}

const nodeRequire = createRequire(import.meta.url);
const shared = nodeRequire('../../src/shared/providerRegistry.js') as SharedRegistry;
const mainRegistry = nodeRequire('../../src/main/providerRegistry.js') as MainRegistry;
const providerPolicy = nodeRequire('../../src/main/providerPolicy.js') as ProviderPolicy;
const errorsModule = nodeRequire('../../src/main/errors.js') as { toErrorShape: (e: unknown) => any };

// Key palsu dibangun programatik: berkas sumber tidak memuat literal yang
// menyerupai rahasia (scripts/secret-scan.mjs memindai seluruh repo).
const GROQ_KEY = ['gsk_', 'q'.repeat(24)].join('');

const EXPECTED_PROVIDER_IDS = [
  'gemini', 'openai', 'anthropic', 'openrouter', 'groq', 'deepseek', 'mistral',
  'xai', 'together', 'cerebras', 'ollama', 'lmstudio', 'custom',
];

const RECORD_FIELDS = [
  'id', 'label', 'adapter', 'host', 'baseUrl', 'keyPattern', 'modelPatterns',
  'defaultModel', 'docsUrl', 'freeTier', 'capabilities', 'pricePer1M', 'privacy',
];

const CAPABILITY_KEYS = ['json', 'vision', 'audioIn', 'audioOut', 'tools'];
const PRIVACY_KEYS = ['leavesDevice', 'freeTierTraining', 'retentionNote'];

describe('registry 13 provider (§2.13.1)', () => {
  it('memuat tepat 13 id unik dengan urutan tabel kontrak', () => {
    expect(shared.PROVIDER_IDS).toEqual(EXPECTED_PROVIDER_IDS);
    expect(new Set(shared.PROVIDER_IDS).size).toBe(13);
    expect(Object.keys(shared.PROVIDERS)).toEqual(EXPECTED_PROVIDER_IDS);
  });

  it('setiap record lengkap & konsisten', () => {
    for (const id of shared.PROVIDER_IDS) {
      const p = shared.PROVIDERS[id];
      expect(p, id).toBeTruthy();
      expect(Object.keys(p).sort()).toEqual([...RECORD_FIELDS].sort());
      expect(p.id).toBe(id);
      expect(typeof p.label).toBe('string');
      expect(p.label.length).toBeGreaterThan(1);
      expect(shared.ADAPTERS).toContain(p.adapter);
      expect(p.docsUrl.startsWith('https://')).toBe(true);

      // `custom` menyerahkan host/baseUrl ke pengguna; sisanya wajib punya host+baseUrl.
      if (id === 'custom') {
        expect(p.host).toBeNull();
        expect(p.baseUrl).toBeNull();
        expect(p.defaultModel).toBeNull();
      } else {
        expect(typeof p.host).toBe('string');
        expect(p.host && p.host.length).toBeGreaterThan(0);
        expect(p.baseUrl.startsWith('https://') || p.baseUrl.startsWith('http://')).toBe(true);
        expect(typeof p.defaultModel).toBe('string');
      }

      // Provider lokal tidak memakai key; provider lain wajib punya pola key.
      if (shared.LOCAL_PROVIDER_IDS.includes(id)) {
        expect(p.keyPattern).toBeNull();
      } else if (id !== 'custom') {
        expect(typeof p.keyPattern).toBe('string');
      }

      expect(Object.keys(p.capabilities).sort()).toEqual([...CAPABILITY_KEYS].sort());
      expect(Object.keys(p.privacy).sort()).toEqual([...PRIVACY_KEYS].sort());
      expect(typeof p.privacy.retentionNote).toBe('string');
      expect(p.privacy.retentionNote.length).toBeGreaterThan(0);
    }
  });

  it('semua regex registry valid & defaultModel cocok dengan polanya', () => {
    for (const id of shared.PROVIDER_IDS) {
      const p = shared.PROVIDERS[id];
      expect(() => new RegExp(p.keyPattern || '^$')).not.toThrow();
      for (const src of p.modelPatterns) expect(() => new RegExp(src, 'i')).not.toThrow();
      if (p.defaultModel && p.modelPatterns.length > 0) {
        expect(p.modelPatterns.some((src) => new RegExp(src, 'i').test(p.defaultModel as string))).toBe(true);
      }
    }
  });

  it('harga indikatif konsisten & provider tanpa harga = null', () => {
    for (const id of shared.PROVIDER_IDS) {
      const price = shared.PROVIDERS[id].pricePer1M;
      if (price === null) continue;
      expect(Number.isFinite(price.in)).toBe(true);
      expect(Number.isFinite(price.out)).toBe(true);
      expect(price.in).toBeGreaterThanOrEqual(0);
      expect(price.out).toBeGreaterThanOrEqual(0);
    }
    expect(shared.PROVIDERS.openrouter.pricePer1M).toBeNull();
    expect(shared.PROVIDERS.custom.pricePer1M).toBeNull();
    expect(shared.PROVIDERS.ollama.pricePer1M).toEqual({ in: 0, out: 0 });
  });

  it('deep-freeze rekursif: tidak ada mutasi yang lolos', () => {
    expect(Object.isFrozen(shared.PROVIDERS)).toBe(true);
    expect(Object.isFrozen(shared.PROVIDER_IDS)).toBe(true);
    for (const id of shared.PROVIDER_IDS) {
      const p = shared.PROVIDERS[id];
      expect(Object.isFrozen(p)).toBe(true);
      expect(Object.isFrozen(p.capabilities)).toBe(true);
      expect(Object.isFrozen(p.privacy)).toBe(true);
      expect(Object.isFrozen(p.modelPatterns)).toBe(true);
      if (p.pricePer1M) expect(Object.isFrozen(p.pricePer1M)).toBe(true);
    }
    expect(() => {
      (shared.PROVIDERS.gemini as any).defaultModel = 'dirusak';
    }).toThrow(TypeError);
    expect(shared.PROVIDERS.gemini.defaultModel).toBe('gemini-2.5-flash');
  });
});

describe('provider lokal, baseUrl klien & allowlist docs', () => {
  it('LOCAL_PROVIDER_IDS diturunkan dari privacy.leavesDevice === false', () => {
    expect(shared.LOCAL_PROVIDER_IDS).toEqual(['ollama', 'lmstudio']);
    for (const id of shared.LOCAL_PROVIDER_IDS) {
      expect(shared.PROVIDERS[id].privacy.leavesDevice).toBe(false);
    }
    for (const id of shared.PROVIDER_IDS) {
      if (shared.LOCAL_PROVIDER_IDS.includes(id)) continue;
      expect(shared.PROVIDERS[id].privacy.leavesDevice).not.toBe(false);
    }
  });

  it('CLIENT_BASE_URL_PROVIDER_IDS = custom + provider lokal', () => {
    expect(shared.CLIENT_BASE_URL_PROVIDER_IDS).toEqual(['custom', 'ollama', 'lmstudio']);
  });

  it('docsHosts menurunkan host unik dari docsUrl (untuk shell:openExternal)', () => {
    const hosts = shared.docsHosts();
    expect(hosts).toEqual([...hosts].sort());
    expect(new Set(hosts).size).toBe(hosts.length);
    for (const host of hosts) {
      expect(host).toBe(host.toLowerCase());
      expect(host.includes('/')).toBe(false);
    }
    // Semua docsUrl provider wajib ada di allowlist turunan.
    for (const id of shared.PROVIDER_IDS) {
      const host = new URL(shared.PROVIDERS[id].docsUrl).hostname.toLowerCase();
      expect(hosts).toContain(host);
    }
    expect(hosts).toContain('aistudio.google.com');
    expect(hosts).toContain('console.groq.com');
    expect(hosts).toContain('api.together.xyz');
    expect(hosts).toContain('ollama.com');
  });

  it('getProvider/hasProvider aman untuk input non-string', () => {
    expect(shared.DEFAULT_PROVIDER).toBe('openrouter');
    expect(shared.getProvider('gemini')?.id).toBe('gemini');
    expect(shared.getProvider('cohere')).toBeNull();
    expect(shared.getProvider(null)).toBeNull();
    expect(shared.getProvider(42)).toBeNull();
    expect(shared.hasProvider('xai')).toBe(true);
    expect(shared.hasProvider('grok')).toBe(false);
    expect(shared.hasProvider('__proto__')).toBe(false);
  });
});

describe('wrapper main: resolusi provider & model (§2.13.2)', () => {
  it('re-export registry yang sama (bukan salinan)', () => {
    expect(mainRegistry.PROVIDERS).toBe(shared.PROVIDERS);
    expect(mainRegistry.PROVIDER_IDS).toBe(shared.PROVIDER_IDS);
    expect(mainRegistry.resolveProvider('openai')?.id).toBe('openai');
    expect(mainRegistry.resolveProvider('cohere')).toBeNull();
  });

  it('resolveModel mempertahankan model yang cocok', () => {
    expect(mainRegistry.resolveModel('gemini', 'gemini-2.5-pro')).toBe('gemini-2.5-pro');
    expect(mainRegistry.resolveModel('openai', 'gpt-4o')).toBe('gpt-4o');
    expect(mainRegistry.resolveModel('xai', 'grok-4')).toBe('grok-4');
    expect(mainRegistry.resolveModel('deepseek', '  deepseek-reasoner  ')).toBe('deepseek-reasoner');
  });

  it('resolveModel fallback diam-diam ke defaultModel (§2.13.2)', () => {
    expect(mainRegistry.resolveModel('gemini', 'gpt-4o')).toBe('gemini-2.5-flash');
    expect(mainRegistry.resolveModel('gemini', '')).toBe('gemini-2.5-flash');
    expect(mainRegistry.resolveModel('gemini', null)).toBe('gemini-2.5-flash');
    expect(mainRegistry.resolveModel('anthropic', 'gemini-2.5-pro')).toBe('claude-3-5-haiku-latest');
    // Provider `custom` menerima model bebas (modelPatterns kosong).
    expect(mainRegistry.resolveModel('custom', 'model-lokal')).toBe('model-lokal');
    expect(mainRegistry.resolveModel('custom', '')).toBeNull();
    expect(mainRegistry.resolveModel('cohere', 'apa-saja')).toBeNull();
  });

  it('modelsFor mengembalikan default statis (atau kosong)', () => {
    expect(mainRegistry.modelsFor('gemini')).toEqual(['gemini-2.5-flash']);
    expect(mainRegistry.modelsFor('custom')).toEqual([]);
    expect(mainRegistry.modelsFor('cohere')).toEqual([]);
  });
});

describe('validasi key & provider (providerPolicy)', () => {
  it('menerima format groq yang sah', () => {
    expect(providerPolicy.validateApiKey('groq', GROQ_KEY)).toBe(GROQ_KEY);
  });

  it('menolak key yang bentuknya milik provider lain tanpa membocorkan nilainya', () => {
    const wrong = ['sk-', 'p'.repeat(24)].join('');
    let caught: unknown;
    try {
      providerPolicy.validateApiKey('groq', wrong);
    } catch (error) {
      caught = error;
    }
    const shape = errorsModule.toErrorShape(caught);
    expect(shape.code).toBe('ERR_PROVIDER_KEY_INVALID');
    expect(shape.message).not.toContain(wrong);
  });

  it('provider lokal boleh tanpa key; custom hanya batas panjang', () => {
    expect(providerPolicy.validateApiKey('ollama', '')).toBe('');
    expect(providerPolicy.validateApiKey('lmstudio', null)).toBe('');
    expect(providerPolicy.validateApiKey('custom', ['x', 'y'.repeat(9)].join(''))).toHaveLength(10);
    expect(() => providerPolicy.validateApiKey('custom', 'pendek')).toThrow();
  });

  it('provider di luar registry → ERR_PROVIDER_UNSUPPORTED', () => {
    let caught: unknown;
    try {
      providerPolicy.validateProvider('cohere');
    } catch (error) {
      caught = error;
    }
    expect(errorsModule.toErrorShape(caught).code).toBe('ERR_PROVIDER_UNSUPPORTED');
    expect(() => providerPolicy.validateProvider('xai')).not.toThrow();
  });
});
