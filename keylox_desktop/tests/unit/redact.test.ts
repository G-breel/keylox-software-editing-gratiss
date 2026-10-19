// Unit tests — redaksi rahasia (api-contract §2.12 invarian #4, §8).
// Key TIDAK PERNAH boleh muncul di log/telemetri/crash report.
import { createRequire } from 'node:module';
import { describe, it, expect, vi } from 'vitest';

interface RedactModule {
  redact: (v: unknown, depth?: number) => any;
  redactText: (v: string) => string;
  maskSecret: (key: string, dots?: string) => string;
  isSecretField: (name: string) => boolean;
  createLogger: (sink?: any) => { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void };
  installConsoleRedaction: (target?: any) => any;
  MASK_DOTS: string;
}

const nodeRequire = createRequire(import.meta.url);
const redactModule = nodeRequire('../../src/main/redact.js') as RedactModule;
const { redact, redactText, maskSecret, isSecretField, createLogger, installConsoleRedaction } = redactModule;

// Key palsu dibuat programatik (tidak pernah ada literal key di repo).
const FAKE_GEMINI_KEY = `AIza${'A'.repeat(35)}`;
const FAKE_OPENAI_KEY = `sk-${'b'.repeat(24)}`;

describe('redactText', () => {
  it('menyensor pola Google API key', () => {
    const out = redactText(`key=${FAKE_GEMINI_KEY}`);
    expect(out).not.toContain(FAKE_GEMINI_KEY);
    expect(out).toContain('[REDACTED_KEY]');
  });

  it('menyensor pola OpenAI key', () => {
    expect(redactText(FAKE_OPENAI_KEY)).not.toContain(FAKE_OPENAI_KEY);
  });

  it('menyensor header Authorization', () => {
    expect(redactText('Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456')).not.toContain('abcdefghijklmnopqrstuvwxyz123456');
  });

  it('menyensor blok private key PEM', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----';
    expect(redactText(pem)).not.toContain('MIIabc');
  });

  it('tidak mengubah teks biasa', () => {
    expect(redactText('trim 5 detik pertama')).toBe('trim 5 detik pertama');
  });
});

describe('redact (nilai kompleks)', () => {
  it('menyensor field rahasia utuh apa pun isinya', () => {
    const out = redact({ apiKey: 'apa-saja', X_Provider_Key: 'x', total: 3 });
    expect(out.apiKey).toBe('[REDACTED_KEY]');
    expect(out.X_Provider_Key).toBe('[REDACTED_KEY]');
    expect(out.total).toBe(3);
  });

  it('menyensor string bersarang & array', () => {
    const out = redact({ headers: { nested: [`prefix ${FAKE_OPENAI_KEY}`] } });
    expect(JSON.stringify(out)).not.toContain(FAKE_OPENAI_KEY);
  });

  it('menyensor message Error tanpa menghilangkan kode', () => {
    const err: any = new Error(`gagal dengan ${FAKE_GEMINI_KEY}`);
    err.code = 'ERR_PROVIDER_KEY_INVALID';
    const out = redact(err);
    expect(out.message).not.toContain(FAKE_GEMINI_KEY);
    expect(out.code).toBe('ERR_PROVIDER_KEY_INVALID');
  });

  it('tidak rekursi tanpa batas pada objek siklik', () => {
    const cyclic: any = { name: 'a' };
    cyclic.self = cyclic;
    expect(() => redact(cyclic)).not.toThrow();
  });
});

describe('maskSecret (kontrak §2.12 invarian #6)', () => {
  it('format 4 + 8 titik + 4 karakter terakhir', () => {
    expect(maskSecret('ABCDEFGHIJKLMNOP1234')).toBe('ABCD••••••••1234');
  });

  it('key < 12 karakter → hanya titik (tanpa sisa)', () => {
    expect(maskSecret('short')).toBe('••••••••');
  });

  it('TIDAK pernah mengembalikan key utuh', () => {
    for (const key of [FAKE_GEMINI_KEY, FAKE_OPENAI_KEY, 'a'.repeat(64)]) {
      expect(maskSecret(key)).not.toBe(key);
      expect(maskSecret(key)).not.toContain(key);
    }
  });

  it('mask Gemini tampak seperti pada dokumentasi (AIza••••••••1234)', () => {
    const masked = maskSecret(`AIza${'X'.repeat(28)}1234`);
    expect(masked.startsWith('AIza')).toBe(true);
    expect(masked.endsWith('1234')).toBe(true);
    expect(masked).toContain('••••••••');
  });
});

describe('isSecretField', () => {
  it('mengenali nama field rahasia', () => {
    for (const name of ['apiKey', 'api_key', 'APIKEY', 'x-provider-key', 'authorization', 'token', 'password', 'secret']) {
      expect(isSecretField(name)).toBe(true);
    }
  });

  it('tidak menyensor field biasa', () => {
    for (const name of ['model', 'provider', 'diffSummary', 'ops']) {
      expect(isSecretField(name)).toBe(false);
    }
  });
});

describe('logger & console redaction', () => {
  it('createLogger menyensor argumen sebelum keluar', () => {
    const sink = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const logger = createLogger(sink);
    logger.warn('gagal', { apiKey: FAKE_GEMINI_KEY });
    const printed = JSON.stringify(sink.warn.mock.calls);
    expect(printed).not.toContain(FAKE_GEMINI_KEY);
  });

  it('installConsoleRedaction menyensor console.error (idempoten)', () => {
    const target: any = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const originalError = target.error;
    installConsoleRedaction(target);
    installConsoleRedaction(target); // tidak menimpa dua kali
    target.error('boom', FAKE_OPENAI_KEY, { token: 'abc' });
    const printed = JSON.stringify(originalError.mock.calls);
    expect(printed).not.toContain(FAKE_OPENAI_KEY);
    expect(printed).toContain('[REDACTED_KEY]');
  });
});
