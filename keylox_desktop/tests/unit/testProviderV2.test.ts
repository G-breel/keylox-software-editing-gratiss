// Unit tests — `settings:testProvider` v2 (api-contract v1.2 §2.14).
//
// Yang dikunci di sini:
//  - bentuk respons v2 lengkap (provider/model/capabilities/verdict/privacy/errors);
//  - `error` = `errors[0]` (kompatibel v1.1) dan `error:null` saat sukses;
//  - tingkat 2 benar-benar mengeluarkan ERR_PROVIDER_MODEL_UNSUPPORTED untuk model
//    di luar pola, dan verdict menjadi `limited` (bukan `ok`);
//  - `custom` mengecho kapabilitas `null` (belum diketahui), bukan `false`.
import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';

interface FakeResponse {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}
type FetchImpl = ((url: string, init?: Record<string, any>) => Promise<FakeResponse>) & {
  calls: Array<{ url: string; init: Record<string, any> }>;
};

const nodeRequire = createRequire(import.meta.url);
const aiClientModule = nodeRequire('../../src/main/aiClient.js') as {
  createAiClient: (deps: any) => { testProvider: (input: any) => Promise<any> };
};

const GEMINI_KEY = ['AIza', 'v'.repeat(35)].join('');
const OPENAI_KEY = ['sk-', 'w'.repeat(24)].join('');
const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

function jsonResponse(body: unknown, status = 200): FakeResponse {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text };
}

function makeFetch(handler: (url: string, init: Record<string, any>, n: number) => FakeResponse): FetchImpl {
  const calls: FetchImpl['calls'] = [];
  const impl = (async (url: string, init: Record<string, any> = {}) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init, calls.length);
  }) as FetchImpl;
  impl.calls = calls;
  return impl;
}

function config(overrides: Record<string, unknown> = {}) {
  const providers = {
    gemini: { apiKey: GEMINI_KEY, model: 'gemini-2.5-flash', baseUrl: null },
    openai: { apiKey: OPENAI_KEY, model: 'gpt-4o-mini', baseUrl: null },
    custom: { apiKey: ['k', 'x'.repeat(20)].join(''), model: 'model-lokal', baseUrl: 'https://llm.example.com/v1' },
  };
  return {
    provider: 'gemini', apiKey: GEMINI_KEY, model: 'gemini-2.5-flash', baseUrl: null,
    providers, backendBaseUrl: '', mode: 'direct', deviceId: null,
    ...overrides,
  };
}

function makeClient(fetchImpl: FetchImpl, overrides: Record<string, unknown> = {}) {
  return aiClientModule.createAiClient({
    getConfig: () => config(overrides),
    fetchImpl,
    logger: silentLogger,
    allowLocalhostDev: true,
    pingTimeoutMs: 100,
    timeoutMs: 100,
  });
}

describe('testProvider v2 — bentuk respons (§2.14.1)', () => {
  it('sukses gemini: verdict ok, capabilities/privacy diecho, error null', async () => {
    const fetchImpl = makeFetch(() => jsonResponse({
      candidates: [{ content: { parts: [{ text: '{"ops":[]}' }] } }],
    }));
    const result = await makeClient(fetchImpl).testProvider({ provider: 'gemini' });

    expect(result.ok).toBe(true);
    expect(result.provider).toBe('gemini');
    expect(result.model).toBe('gemini-2.5-flash');
    expect(result.verdict).toBe('ok');
    expect(result.error).toBeNull();
    expect(Object.keys(result.capabilities).sort()).toEqual(['audioIn', 'audioOut', 'json', 'tools', 'vision']);
    expect(result.capabilities.json).toBe(true);
    expect(result.privacy).toMatchObject({ leavesDevice: true, freeTierTraining: true });
    // Dua panggilan: ping tingkat 1 + JSON mini tingkat 3.
    expect(fetchImpl.calls).toHaveLength(2);
  });

  it('provider tak dikenal → verdict incompatible + errors[0] (bukan throw)', async () => {
    const fetchImpl = makeFetch(() => jsonResponse({}));
    const result = await makeClient(fetchImpl).testProvider({ provider: 'cohere' });

    expect(result.ok).toBe(false);
    expect(result.verdict).toBe('incompatible');
    expect(result.errors[0].code).toBe('ERR_PROVIDER_UNSUPPORTED');
    expect(result.error).toEqual({ code: 'ERR_PROVIDER_UNSUPPORTED', message: result.errors[0].message });
    expect(fetchImpl.calls).toHaveLength(0);
  });

  it('tanpa key → ERR_AI_NO_KEY tanpa jaringan', async () => {
    const fetchImpl = makeFetch(() => jsonResponse({}));
    const result = await makeClient(fetchImpl, {
      providers: {
        gemini: { apiKey: GEMINI_KEY, model: 'gemini-2.5-flash', baseUrl: null },
        openai: { apiKey: null, model: 'gpt-4o-mini', baseUrl: null },
      },
    }).testProvider({ provider: 'openai' });

    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe('ERR_AI_NO_KEY');
    expect(fetchImpl.calls).toHaveLength(0);
  });

  it('custom mengecho kapabilitas null (belum diketahui), bukan false', async () => {
    const fetchImpl = makeFetch((_url, init) => {
      if (init.method === 'GET') return jsonResponse({ data: [] });
      return jsonResponse({ choices: [{ message: { content: '{"ops":[]}' } }] });
    });
    const result = await makeClient(fetchImpl).testProvider({ provider: 'custom', model: 'model-lokal' });

    expect(result.capabilities).toEqual({
      json: null, vision: null, audioIn: null, audioOut: null, tools: null,
    });
    expect(result.privacy.leavesDevice).toBeNull();
  });
});

describe('testProvider v2 — prosedur 3 tingkat (§2.14.2)', () => {
  it('model di luar pola → ERR_PROVIDER_MODEL_UNSUPPORTED, verdict limited', async () => {
    const fetchImpl = makeFetch((url) => {
      if (url.endsWith('/models/gpt-4o-mini')) return jsonResponse({ data: [] });
      return jsonResponse({ choices: [{ message: { content: '{"ops":[]}' } }] });
    });
    const result = await makeClient(fetchImpl).testProvider({ provider: 'openai', model: 'llama-3.3-70b' });

    expect(result.ok).toBe(true); // tingkat 1 lolos
    expect(result.verdict).toBe('limited');
    expect(result.errors.map((e: any) => [e.level, e.code])).toEqual([
      [2, 'ERR_PROVIDER_MODEL_UNSUPPORTED'],
    ]);
    // Tingkat 3 dilewati karena tingkat 2 sudah menandai masalah.
    expect(fetchImpl.calls).toHaveLength(1);
    expect(result.model).toBe('gpt-4o-mini'); // fallback yang benar-benar diuji
    expect(JSON.stringify(result)).not.toContain(OPENAI_KEY);
  });

  it('tingkat 1 gagal → berhenti, tidak memanggil tingkat 2/3', async () => {
    const fetchImpl = makeFetch(() => jsonResponse({ error: { message: 'invalid key' } }, 401));
    const result = await makeClient(fetchImpl).testProvider({ provider: 'gemini' });

    expect(result.ok).toBe(false);
    expect(result.verdict).toBe('incompatible');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].level).toBe(1);
    expect(fetchImpl.calls).toHaveLength(1);
  });

  it('mode PROXY menguji /v1/health, bukan provider langsung', async () => {
    const fetchImpl = makeFetch(() => jsonResponse({ ok: true }));
    const result = await makeClient(fetchImpl, { backendBaseUrl: 'http://localhost:8787' })
      .testProvider({ provider: 'gemini' });

    expect(result.ok).toBe(true);
    expect(fetchImpl.calls[0].url).toBe('http://localhost:8787/v1/health');
    expect(result.verdict).toBe('ok');
  });
});
