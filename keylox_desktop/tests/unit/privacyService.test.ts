// Unit tests — privasi & konfirmasi eksternal v1.2 (api-contract v1.2 §2.15, ADR-05).
//
// Yang dikunci di sini:
//  - mode default `standard`, validasi tiga mode, persistensi via `privacy.mode`;
//  - `local-only` memblokir SEMUA provider cloud sebelum jaringan, provider lokal lolos;
//  - provider `freeTierTraining:true` (gemini/deepseek) + `custom` wajib konfirmasi;
//  - scope `once` terkonsumsi, `session` bertahan di sesi, `always` persisten;
//  - provider tanpa risiko training (openai/mistral/cerebras) tidak butuh konfirmasi.
import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';

interface FakeStore {
  map: Map<string, unknown>;
  getPreference: (key: string) => { value: unknown };
  setPreference: (key: string, value: unknown) => { ok: true };
}

interface PrivacyService {
  getMode: () => string;
  setMode: (mode: string) => { ok: true; mode: string };
  confirmExternal: (input: Record<string, unknown>) => { ok: true; grantedAt: string };
  hasConsent: (provider: string) => boolean;
  assertCanInvoke: (provider: string, options?: { jobType?: string }) => { mode: string; provider: string };
  confirmationState: () => Record<string, { persisted: boolean }>;
  PRIVACY_MODES: string[];
}

const nodeRequire = createRequire(import.meta.url);
const privacyModule = nodeRequire('../../src/main/privacyService.js') as {
  createPrivacyService: (deps: { store: FakeStore }) => PrivacyService;
};
const errorsModule = nodeRequire('../../src/main/errors.js') as { toErrorShape: (e: unknown) => any };

function makeStore(initial: Record<string, unknown> = {}): FakeStore {
  const map = new Map<string, unknown>(Object.entries(initial));
  return {
    map,
    getPreference: (key: string) => ({ value: map.has(key) ? map.get(key) : null }),
    setPreference: (key: string, value: unknown) => {
      if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
        throw new Error('nilai setting harus primitif');
      }
      map.set(key, value);
      return { ok: true as const };
    },
  };
}

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return errorsModule.toErrorShape(error).code;
  }
  throw new Error('fungsi seharusnya melempar');
}

describe('mode privasi (§2.15)', () => {
  it('default pabrik = standard; nilai tak dikenal diabaikan', () => {
    expect(privacyModule.createPrivacyService({ store: makeStore() }).getMode()).toBe('standard');
    expect(privacyModule.createPrivacyService({ store: makeStore({ 'privacy.mode': 'super-cloud' }) }).getMode())
      .toBe('standard');
    // Store yang gagal dibaca tidak boleh membuat app crash → default.
    const broken = makeStore();
    broken.getPreference = () => { throw new Error('secure storage rusak'); };
    expect(privacyModule.createPrivacyService({ store: broken }).getMode()).toBe('standard');
  });

  it('setMode memvalidasi tiga mode & mempersist `privacy.mode`', () => {
    const store = makeStore();
    const service = privacyModule.createPrivacyService({ store });
    expect(service.PRIVACY_MODES).toEqual(['local-only', 'standard', 'cloud']);

    expect(service.setMode('local-only')).toEqual({ ok: true, mode: 'local-only' });
    expect(store.map.get('privacy.mode')).toBe('local-only');
    expect(service.getMode()).toBe('local-only');

    service.setMode('cloud');
    expect(service.getMode()).toBe('cloud');
    expect(codeOf(() => service.setMode('offline'))).toBe('ERR_VALIDATION_PAYLOAD');
    expect(store.map.get('privacy.mode')).toBe('cloud');
  });

  it('mode `cloud` tidak menghapus kewajiban konfirmasi provider training', () => {
    const service = privacyModule.createPrivacyService({ store: makeStore({ 'privacy.mode': 'cloud' }) });
    expect(codeOf(() => service.assertCanInvoke('gemini'))).toBe('ERR_PRIVACY_CONSENT_REQUIRED');
  });
});

describe('local-only memblokir cloud, bukan provider lokal (§2.15)', () => {
  it('menolak gemini/openai/custom sebelum jaringan', () => {
    const service = privacyModule.createPrivacyService({ store: makeStore({ 'privacy.mode': 'local-only' }) });
    for (const provider of ['gemini', 'openai', 'anthropic', 'custom']) {
      const shape = (() => {
        try {
          service.assertCanInvoke(provider, { jobType: 'chat' });
        } catch (error) {
          return errorsModule.toErrorShape(error);
        }
        return null;
      })();
      expect(shape?.code, provider).toBe('ERR_PRIVACY_LOCAL_ONLY_BLOCKED');
      expect(shape?.details).toMatchObject({ provider, mode: 'local-only', jobType: 'chat' });
    }
  });

  it('ollama/lmstudio tetap lolos di local-only (tanpa konfirmasi)', () => {
    const service = privacyModule.createPrivacyService({ store: makeStore({ 'privacy.mode': 'local-only' }) });
    expect(service.assertCanInvoke('ollama')).toEqual({ mode: 'local-only', provider: 'ollama' });
    expect(service.assertCanInvoke('lmstudio')).toEqual({ mode: 'local-only', provider: 'lmstudio' });
  });

  it('provider tak dikenal → ERR_PROVIDER_UNSUPPORTED (bukan error privasi)', () => {
    const service = privacyModule.createPrivacyService({ store: makeStore() });
    expect(codeOf(() => service.assertCanInvoke('cohere'))).toBe('ERR_PROVIDER_UNSUPPORTED');
  });
});

describe('konfirmasi freeTierTraining (§2.15.3)', () => {
  it('gemini & deepseek butuh konfirmasi; openai/mistral/cerebras tidak', () => {
    const service = privacyModule.createPrivacyService({ store: makeStore() });
    expect(codeOf(() => service.assertCanInvoke('gemini'))).toBe('ERR_PRIVACY_CONSENT_REQUIRED');
    expect(codeOf(() => service.assertCanInvoke('deepseek'))).toBe('ERR_PRIVACY_CONSENT_REQUIRED');
    expect(service.assertCanInvoke('openai')).toEqual({ mode: 'standard', provider: 'openai' });
    expect(service.assertCanInvoke('mistral')).toEqual({ mode: 'standard', provider: 'mistral' });
    expect(service.assertCanInvoke('cerebras')).toEqual({ mode: 'standard', provider: 'cerebras' });
  });

  it('scope `session` bertahan sampai service dibuang', () => {
    const store = makeStore();
    const service = privacyModule.createPrivacyService({ store });
    const granted = service.confirmExternal({ provider: 'gemini', purpose: 'transkripsi', scope: 'session' });
    expect(granted.ok).toBe(true);
    expect(service.hasConsent('gemini')).toBe(true);

    expect(service.assertCanInvoke('gemini')).toEqual({ mode: 'standard', provider: 'gemini' });
    expect(service.assertCanInvoke('gemini')).toEqual({ mode: 'standard', provider: 'gemini' });
    // `session` TIDAK dipersistenkan ke settings.enc.
    expect(store.map.has('privacy.confirm.gemini')).toBe(false);

    // Service baru (sesi baru) → konfirmasi hilang.
    expect(privacyModule.createPrivacyService({ store }).hasConsent('gemini')).toBe(false);
  });

  it('scope `once` terkonsumsi setelah satu panggilan sukses', () => {
    const service = privacyModule.createPrivacyService({ store: makeStore() });
    service.confirmExternal({ provider: 'deepseek', scope: 'once' });
    expect(service.assertCanInvoke('deepseek')).toEqual({ mode: 'standard', provider: 'deepseek' });
    expect(codeOf(() => service.assertCanInvoke('deepseek'))).toBe('ERR_PRIVACY_CONSENT_REQUIRED');
  });

  it('scope `always` dipersist sebagai JSON string & dipakai sesi berikutnya', () => {
    const store = makeStore();
    const first = privacyModule.createPrivacyService({ store });
    first.confirmExternal({ provider: 'gemini', scope: 'always' });
    const raw = store.map.get('privacy.confirm.gemini');
    expect(typeof raw).toBe('string');
    // Preferensi hanya memuat status konfirmasi — tidak ada rahasia/konten.
    expect(JSON.parse(raw as string)).toMatchObject({ scope: 'always', purpose: null });

    const second = privacyModule.createPrivacyService({ store });
    expect(second.hasConsent('gemini')).toBe(true);
    expect(second.assertCanInvoke('gemini')).toEqual({ mode: 'standard', provider: 'gemini' });
  });

  it('job media (frame/audio) butuh konfirmasi walau provider tidak training', () => {
    const service = privacyModule.createPrivacyService({ store: makeStore() });
    // OpenAI freeTierTraining=false, tetapi vision job mengirim frame → tetap butuh consent.
    const shape = (() => {
      try {
        service.assertCanInvoke('openai', { jobType: 'scene_detect' });
      } catch (error) {
        return errorsModule.toErrorShape(error);
      }
      return null;
    })();
    expect(shape?.code).toBe('ERR_PRIVACY_CONSENT_REQUIRED');
    expect(shape?.details).toMatchObject({ provider: 'openai', reason: 'media_content', jobType: 'scene_detect' });

    service.confirmExternal({ provider: 'openai', scope: 'session' });
    expect(service.assertCanInvoke('openai', { jobType: 'scene_detect' })).toEqual({
      mode: 'standard', provider: 'openai',
    });
    // Job teks ke provider yang sama tidak meminta konfirmasi tambahan.
    expect(service.assertCanInvoke('openai', { jobType: 'chat' }).provider).toBe('openai');
  });

  it('transcribe (audio) juga butuh konfirmasi; job teks tidak', () => {
    const service = privacyModule.createPrivacyService({ store: makeStore() });
    expect(codeOf(() => service.assertCanInvoke('groq', { jobType: 'transcribe' })))
      .toBe('ERR_PRIVACY_CONSENT_REQUIRED');
    expect(service.assertCanInvoke('groq', { jobType: 'chat' }).provider).toBe('groq');
    service.confirmExternal({ provider: 'groq', scope: 'once' });
    expect(service.assertCanInvoke('groq', { jobType: 'transcribe' }).provider).toBe('groq');
    expect(codeOf(() => service.assertCanInvoke('groq', { jobType: 'transcribe' })))
      .toBe('ERR_PRIVACY_CONSENT_REQUIRED');
  });

  it('provider lokal tidak pernah butuh konfirmasi media', () => {
    const service = privacyModule.createPrivacyService({ store: makeStore() });
    expect(service.assertCanInvoke('ollama', { jobType: 'scene_detect' })).toEqual({
      mode: 'standard', provider: 'ollama',
    });
  });

  it('custom selalu butuh konfirmasi (privasi tak diketahui), termasuk sesi baru', () => {
    const store = makeStore();
    const service = privacyModule.createPrivacyService({ store });
    expect(codeOf(() => service.assertCanInvoke('custom'))).toBe('ERR_PRIVACY_CONSENT_REQUIRED');
    service.confirmExternal({ provider: 'custom', scope: 'once' });
    expect(service.assertCanInvoke('custom')).toEqual({ mode: 'standard', provider: 'custom' });
    expect(codeOf(() => privacyModule.createPrivacyService({ store }).assertCanInvoke('custom')))
      .toBe('ERR_PRIVACY_CONSENT_REQUIRED');
  });

  it('payload confirmExternal divalidasi ketat', () => {
    const service = privacyModule.createPrivacyService({ store: makeStore() });
    expect(codeOf(() => service.confirmExternal({ provider: 'gemini' }))).toBe('ERR_VALIDATION_PAYLOAD');
    expect(codeOf(() => service.confirmExternal({ provider: 'gemini', scope: 'selamanya' })))
      .toBe('ERR_VALIDATION_PAYLOAD');
    expect(codeOf(() => service.confirmExternal({ provider: '', scope: 'once' })))
      .toBe('ERR_VALIDATION_PAYLOAD');
    expect(codeOf(() => service.confirmExternal({ provider: 'gemini', scope: 'once', extra: 1 })))
      .toBe('ERR_VALIDATION_PAYLOAD');
  });

  it('confirmationState hanya memuat konfirmasi sesi (tanpa nilai sensitif)', () => {
    const service = privacyModule.createPrivacyService({ store: makeStore() });
    service.confirmExternal({ provider: 'gemini', scope: 'session' });
    const state = service.confirmationState();
    expect(Object.keys(state)).toEqual(['gemini']);
    expect(state.gemini.persisted).toBe(false);
    expect(JSON.stringify(state)).not.toContain('apiKey');
  });

  it('service tanpa store yang valid gagal cepat', () => {
    expect(() => privacyModule.createPrivacyService({} as any)).toThrow();
  });
});
