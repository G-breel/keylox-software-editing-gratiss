// Unit tests — `shell:openExternal` allowlist v1.2 (api-contract v1.2 §2.12.7).
//
// Yang dikunci di sini (pelanggaran = bug keamanan):
//  - HANYA https (http/file/javascript/data/mailto ditolak);
//  - host wajib allowlist resmi (docsUrl registry + onboarding), bukan host sembarang;
//  - URL berkredensial/terlalu panjang/rusak ditolak;
//  - pesan error TIDAK memantulkan URL mentah (hanya host ternormalisasi);
//  - `openExternal` hanya dipanggil dengan URL bersih (tanpa query/hash).
import { createRequire } from 'node:module';
import { describe, it, expect, vi } from 'vitest';

interface ExternalLinks {
  validate: (url: unknown) => string;
  open: (input: unknown) => Promise<{ ok: true }>;
  allowlist: () => string[];
}

const nodeRequire = createRequire(import.meta.url);
const linksModule = nodeRequire('../../src/main/externalLinks.js') as {
  createExternalLinks: (deps?: {
    openExternal?: (url: string) => Promise<void> | void;
    extraHosts?: string[];
  }) => ExternalLinks;
  buildAllowlist: (extra?: string[]) => Set<string>;
  ONBOARDING_HOSTS: string[];
};
const registry = nodeRequire('../../src/shared/providerRegistry.js') as {
  PROVIDERS: Record<string, { docsUrl: string }>;
  PROVIDER_IDS: string[];
};
const errorsModule = nodeRequire('../../src/main/errors.js') as { toErrorShape: (e: unknown) => any };

function failure(fn: () => unknown): any {
  try {
    fn();
  } catch (error) {
    return errorsModule.toErrorShape(error);
  }
  throw new Error('fungsi seharusnya melempar');
}

describe('allowlist diturunkan dari registry (§2.12.7 butir 2)', () => {
  it('semua docsUrl 13 provider lolos validasi', () => {
    const links = linksModule.createExternalLinks();
    for (const id of registry.PROVIDER_IDS) {
      const docsUrl = registry.PROVIDERS[id].docsUrl;
      expect(links.validate(docsUrl), id).toBe(new URL(docsUrl).href.replace(/\/$/, '') || docsUrl);
    }
  });

  it('host onboarding resmi ada di allowlist & terurut unik', () => {
    const links = linksModule.createExternalLinks();
    const allowlist = links.allowlist();
    expect(allowlist).toEqual([...allowlist].sort());
    expect(new Set(allowlist).size).toBe(allowlist.length);
    for (const host of linksModule.ONBOARDING_HOSTS) expect(allowlist).toContain(host);
    expect(allowlist).toContain('aistudio.google.com');
    expect(allowlist).toContain('console.groq.com');
    expect(allowlist).not.toContain('example.com');
  });

  it('extraHosts memperluas allowlist untuk kebutuhan onboarding baru', () => {
    const links = linksModule.createExternalLinks({ extraHosts: ['Docs.Example.com.', 'docs.example.com'] });
    expect(links.validate('https://docs.example.com/start')).toBe('https://docs.example.com/start');
    expect(links.allowlist()).toContain('docs.example.com');
  });
});

describe('penolakan URL berbahaya', () => {
  it('menolak skema selain https', () => {
    const links = linksModule.createExternalLinks();
    for (const url of [
      'http://aistudio.google.com/apikey',
      'file:///C:/Windows/System32/calc.exe',
      'javascript:alert(1)',
      'data:text/html,<h1>x</h1>',
      'mailto:security@example.com',
    ]) {
      expect(failure(() => links.validate(url)).code, url).toBe('ERR_VALIDATION_PAYLOAD');
    }
  });

  it('menolak host di luar allowlist', () => {
    const links = linksModule.createExternalLinks();
    for (const url of [
      'https://evil.example/',
      'https://aistudio.google.com.evil.example/apikey',
      'https://sub.aistudio.google.com/',
    ]) {
      const shape = failure(() => links.validate(url));
      expect(shape.code).toBe('ERR_VALIDATION_PAYLOAD');
      expect(shape.details.reason).toBe('external_url_not_allowed');
    }
  });

  it('menolak URL berkredensial, rusak, kosong, dan terlalu panjang', () => {
    const links = linksModule.createExternalLinks();
    const cases: unknown[] = [
      'https://user:pass@aistudio.google.com/apikey',
      'https://user@aistudio.google.com/apikey',
      'bukan-url',
      '',
      null,
      42,
      `https://aistudio.google.com/${'a'.repeat(2050)}`,
    ];
    for (const value of cases) {
      expect(failure(() => links.validate(value)).code).toBe('ERR_VALIDATION_PAYLOAD');
    }
  });

  it('pesan error tidak memantulkan URL mentah (hanya host)', () => {
    const links = linksModule.createExternalLinks();
    const raw = 'https://evil.example/rahasia-token-123?session=abc#frag';
    const shape = failure(() => links.validate(raw));
    expect(shape.message).not.toContain('rahasia-token-123');
    expect(shape.message).not.toContain('session=abc');
    expect(shape.message).not.toContain(raw);
    expect(shape.message).toContain('evil.example');
    expect(shape.details.host).toBe('evil.example');
  });
});

describe('normalisasi & pemanggilan openExternal', () => {
  it('membuang query/hash dan menormalkan host', () => {
    const links = linksModule.createExternalLinks();
    expect(links.validate('https://AISTUDIO.Google.com/apikey?utm=1#top'))
      .toBe('https://aistudio.google.com/apikey');
    expect(links.validate('https://AISTUDIO.Google.com./apikey'))
      .toBe('https://aistudio.google.com/apikey');
    // Root path dinormalisasi tanpa slash tambahan.
    expect(links.validate('https://openrouter.ai/')).toBe('https://openrouter.ai');
  });

  it('openExternal dipanggil dengan URL bersih, bukan input mentah', async () => {
    const openExternal = vi.fn(() => Promise.resolve());
    const links = linksModule.createExternalLinks({ openExternal });
    await expect(links.open('https://aistudio.google.com/apikey?utm_source=app#x'))
      .resolves.toEqual({ ok: true });
    expect(openExternal).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledWith('https://aistudio.google.com/apikey');
  });

  it('menerima bentuk objek `{ url }`', async () => {
    const openExternal = vi.fn(() => Promise.resolve());
    const links = linksModule.createExternalLinks({ openExternal });
    await links.open({ url: 'https://console.groq.com/keys' });
    expect(openExternal).toHaveBeenCalledWith('https://console.groq.com/keys');
  });

  it('openExternal TIDAK dipanggil untuk URL yang ditolak', async () => {
    const openExternal = vi.fn(() => Promise.resolve());
    const links = linksModule.createExternalLinks({ openExternal });
    await expect(links.open('http://evil.example/x')).rejects.toMatchObject({
      code: 'ERR_VALIDATION_PAYLOAD',
    });
    await expect(links.open({ url: 42 })).rejects.toMatchObject({ code: 'ERR_VALIDATION_PAYLOAD' });
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('open tetap sukses tanpa implementasi openExternal (DI opsional)', async () => {
    const links = linksModule.createExternalLinks();
    await expect(links.open('https://ollama.com/download')).resolves.toEqual({ ok: true });
  });
});
