// Unit tests — penyimpanan rahasia BYOK (api-contract v1.1 §2.12, byok-api-key.md §3).
//
// Yang dikunci di sini:
//  - key hanya hidup di berkas TERENKRIPSI (tidak pernah plaintext di disk);
//  - renderer hanya bisa mendapat `{ hasKey, masked, model }` (tanpa key utuh);
//  - `settings:set` DILARANG untuk rahasia (ERR_VALIDATION_SECRET_IN_PLAIN_SETTING);
//  - safeStorage tidak tersedia → ERR_SECURE_STORAGE_UNAVAILABLE;
//  - baseUrl provider divalidasi allowlist (anti-SSRF §3.7).
import { createRequire } from 'node:module';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

interface StoreLike {
  isStorageAvailable: () => boolean;
  getRuntimeConfig: () => any;
  hasSecret: (p: string) => any;
  setSecret: (input: any) => any;
  clearSecret: (p: string) => any;
  getPreference: (k: string) => any;
  setPreference: (k: string, v: unknown) => any;
  _resetCache: () => void;
}

const nodeRequire = createRequire(import.meta.url);
const secretStoreModule = nodeRequire('../../src/main/secretStore.js') as {
  createSecretStore: (deps: any) => StoreLike;
  defaultSecureFilePath: (app: any) => string;
};
const errorsModule = nodeRequire('../../src/main/errors.js') as { toErrorShape: (e: unknown) => any };

const FAKE_GEMINI_KEY = `AIza${'A'.repeat(35)}`;
const FAKE_OPENAI_KEY = `sk-${'b'.repeat(24)}`;

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

function fakeSafeStorage(available = true) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plain: string) => Buffer.from(`enc:${Buffer.from(plain, 'utf8').toString('base64')}`, 'utf8'),
    decryptString: (buf: Buffer) => {
      const text = buf.toString('utf8');
      if (!text.startsWith('enc:')) throw new Error('ciphertext tidak dikenal');
      return Buffer.from(text.slice(4), 'base64').toString('utf8');
    },
  };
}

let dir: string;
let filePath: string;

function makeStore(safeStorage = fakeSafeStorage()) {
  return secretStoreModule.createSecretStore({ safeStorage, filePath, logger: silentLogger, allowLocalhostDev: true });
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'keylox-secure-'));
  filePath = path.join(dir, 'secure', 'settings.enc');
});

afterAll(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('settings:setSecret / hasSecret (§2.12.1–§2.12.2)', () => {
  it('menyimpan key dan mengembalikan mask (bukan key)', () => {
    const store = makeStore();
    const saved = store.setSecret({ provider: 'gemini', apiKey: FAKE_GEMINI_KEY });

    expect(saved.ok).toBe(true);
    expect(saved.masked).toMatch(/^AIza/);
    expect(saved.masked).toContain('••••••••');
    expect(JSON.stringify(saved)).not.toContain(FAKE_GEMINI_KEY);

    const status = store.hasSecret('gemini');
    expect(status).toEqual({ hasKey: true, masked: saved.masked, model: 'gemini-2.5-flash' });
    expect(JSON.stringify(status)).not.toContain(FAKE_GEMINI_KEY);
  });

  it('menulis berkas terenkripsi: key TIDAK ada sebagai plaintext di disk', () => {
    const store = makeStore();
    store.setSecret({ provider: 'gemini', apiKey: FAKE_GEMINI_KEY, model: 'gemini-2.5-pro' });

    expect(existsSync(filePath)).toBe(true);
    const raw = readFileSync(filePath, 'utf8');
    expect(raw).not.toContain(FAKE_GEMINI_KEY);
    expect(raw).not.toContain('gemini-2.5-pro');
    expect(raw.startsWith('enc:')).toBe(true);
  });

  it('mengembalikan hasKey:false (mask null) sebelum ada key', () => {
    expect(makeStore().hasSecret('gemini')).toEqual({ hasKey: false, masked: null, model: null });
  });

  it('provider lain → hasKey:false (satu key aktif, ditimpa)', () => {
    const store = makeStore();
    store.setSecret({ provider: 'gemini', apiKey: FAKE_GEMINI_KEY });
    expect(store.hasSecret('openai').hasKey).toBe(false);
  });

  it('menolak key yang formatnya salah → ERR_PROVIDER_KEY_INVALID', () => {
    const store = makeStore();
    try {
      store.setSecret({ provider: 'gemini', apiKey: 'bukan-key-gemini-panjang' });
      throw new Error('seharusnya menolak');
    } catch (error: any) {
      const shape = errorsModule.toErrorShape(error);
      expect(shape.code).toBe('ERR_PROVIDER_KEY_INVALID');
      expect(shape.retryable).toBe(false);
      expect(shape.message).not.toContain('bukan-key-gemini-panjang');
    }
  });

  it('menerima key OpenAI-compatible pada provider openai', () => {
    const store = makeStore();
    const saved = store.setSecret({ provider: 'openai', apiKey: FAKE_OPENAI_KEY, model: 'gpt-4o-mini' });
    expect(saved.ok).toBe(true);
    expect(store.hasSecret('openai').hasKey).toBe(true);
  });

  it('menolak provider tak dikenal → ERR_PROVIDER_UNSUPPORTED', () => {
    const store = makeStore();
    try {
      // `cohere` bukan salah satu dari 13 provider registry (§2.13.1).
      store.setSecret({ provider: 'cohere', apiKey: FAKE_OPENAI_KEY });
      throw new Error('seharusnya menolak');
    } catch (error: any) {
      expect(errorsModule.toErrorShape(error).code).toBe('ERR_PROVIDER_UNSUPPORTED');
    }
  });

  it('menolak baseUrl provider di luar allowlist (anti-SSRF §3.7)', () => {
    const store = makeStore();
    for (const baseUrl of ['https://evil.example.com/v1', 'http://169.254.169.254/latest', 'https://10.0.0.5/v1']) {
      try {
        store.setSecret({ provider: 'openai', apiKey: FAKE_OPENAI_KEY, baseUrl });
        throw new Error(`seharusnya menolak ${baseUrl}`);
      } catch (error: any) {
        expect(errorsModule.toErrorShape(error).code).toBe('ERR_PROVIDER_UNSUPPORTED');
      }
    }
  });
});

describe('settings:clearSecret (§2.12.3)', () => {
  it('menghapus key tetapi berkas tetap ada', () => {
    const store = makeStore();
    store.setSecret({ provider: 'gemini', apiKey: FAKE_GEMINI_KEY });
    expect(store.clearSecret('gemini')).toEqual({ ok: true });

    expect(store.hasSecret('gemini')).toEqual({ hasKey: false, masked: null, model: null });
    expect(existsSync(filePath)).toBe(true);
  });
});

describe('safeStorage tidak tersedia (§5.2.1 ERR_SECURE_STORAGE_UNAVAILABLE)', () => {
  it('hasSecret tidak melempar — melaporkan hasKey:false + kode error', () => {
    const store = makeStore(fakeSafeStorage(false));
    const status = store.hasSecret('gemini');
    expect(status.hasKey).toBe(false);
    expect(status.masked).toBeNull();
    expect(status.error?.code).toBe('ERR_SECURE_STORAGE_UNAVAILABLE');
  });

  it('setSecret melempar ERR_SECURE_STORAGE_UNAVAILABLE (retryable)', () => {
    const store = makeStore(fakeSafeStorage(false));
    try {
      store.setSecret({ provider: 'gemini', apiKey: FAKE_GEMINI_KEY });
      throw new Error('seharusnya melempar');
    } catch (error: any) {
      const shape = errorsModule.toErrorShape(error);
      expect(shape.code).toBe('ERR_SECURE_STORAGE_UNAVAILABLE');
      expect(shape.retryable).toBe(true);
    }
  });

  it('berkas rusak/terdekripsi gagal → dianggap belum ada key (tidak menebak isi)', () => {
    const store = makeStore();
    store.setSecret({ provider: 'gemini', apiKey: FAKE_GEMINI_KEY });
    store._resetCache();

    const broken = makeStore({
      isEncryptionAvailable: () => true,
      encryptString: () => Buffer.from('enc:x', 'utf8'),
      decryptString: () => { throw new Error('kunci OS berubah'); },
    });
    const status = broken.hasSecret('gemini');
    expect(status.hasKey).toBe(false);
    expect(status.error?.code).toBe('ERR_SECURE_STORAGE_UNAVAILABLE');
  });
});

describe('preferensi non-rahasia (§2.7)', () => {
  it('menyimpan & membaca backendBaseUrl, mode diturunkan otomatis (§6.4)', () => {
    const store = makeStore();
    expect(store.getRuntimeConfig().mode).toBe('direct');

    store.setPreference('backendBaseUrl', 'http://localhost:8787');
    expect(store.getPreference('backendBaseUrl')).toEqual({ value: 'http://localhost:8787' });
    expect(store.getRuntimeConfig().mode).toBe('proxy');

    store.setPreference('backendBaseUrl', '');
    expect(store.getRuntimeConfig().mode).toBe('direct');
  });

  it('menolak menulis rahasia lewat settings:set (§2.7)', () => {
    const store = makeStore();
    for (const key of ['apiKey', 'geminiKey', 'userToken', 'password']) {
      try {
        store.setPreference(key, FAKE_GEMINI_KEY);
        throw new Error(`seharusnya menolak ${key}`);
      } catch (error: any) {
        expect(errorsModule.toErrorShape(error).code).toBe('ERR_VALIDATION_SECRET_IN_PLAIN_SETTING');
      }
    }
  });

  it('menolak membaca rahasia lewat settings:get', () => {
    const store = makeStore();
    try {
      store.getPreference('apiKey');
      throw new Error('seharusnya menolak');
    } catch (error: any) {
      expect(errorsModule.toErrorShape(error).code).toBe('ERR_VALIDATION_SECRET_IN_PLAIN_SETTING');
    }
  });

  it('menolak nilai non-primitif & backend URL tidak aman', () => {
    const store = makeStore();
    expect(() => store.setPreference('theme', { nested: true })).toThrow();
    expect(() => store.setPreference('backendBaseUrl', 'http://evil.example.com')).toThrow();
  });

  it('mode proxy tanpa backend URL ditolak', () => {
    const store = makeStore();
    expect(() => store.setPreference('mode', 'proxy')).toThrow();
  });
});

describe('getRuntimeConfig', () => {
  it('membuat deviceId sekali & menyimpan key untuk pemakaian main process', () => {
    const store = makeStore();
    store.setSecret({ provider: 'gemini', apiKey: FAKE_GEMINI_KEY });
    const first = store.getRuntimeConfig();
    expect(first.apiKey).toBe(FAKE_GEMINI_KEY);
    expect(first.deviceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(store.getRuntimeConfig().deviceId).toBe(first.deviceId);
  });
});
