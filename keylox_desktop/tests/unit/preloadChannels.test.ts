// Unit tests — kontrak preload v1.2 (api-contract v1.2 §2.11.2, §2.12.7, §2.15, §2.16).
//
// Preload berjalan dengan `sandbox:true` sehingga TIDAK boleh `require()` berkas
// `src/shared/**`. Karena itu daftar 13 provider + konstanta v1.2 sengaja
// di-inline; tes ini menjaga paritasnya dengan registry shared dan memastikan
// 7 channel baru benar-benar ada di allowlist.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const nodeRequire = createRequire(import.meta.url);
const registry = nodeRequire('../../src/shared/providerRegistry.js') as {
  PROVIDER_IDS: string[];
};
const sharedConstants = nodeRequire('../../src/shared/constants.js') as {
  NEW_CHANNELS_V12: string[];
  PRIVACY_MODES: string[];
  CONFIRM_SCOPES: string[];
  WIPE_SCOPES: string[];
  CLIENT_JOB_TYPES: string[];
};
const usageSchema = nodeRequire('../../src/shared/usage.schema.js') as {
  USAGE_RANGES: string[];
};

const preloadSource = readFileSync(new URL('../../preload.js', import.meta.url), 'utf8');

function blockAfter(marker: string): string {
  const start = preloadSource.indexOf(marker);
  expect(start, marker).toBeGreaterThanOrEqual(0);
  // Literal diakhiri `]);` (array) atau `});` (object) — ambil yang terdekat.
  const ends = [preloadSource.indexOf(']);', start), preloadSource.indexOf('});', start)]
    .filter((index) => index > start);
  expect(ends.length, marker).toBeGreaterThan(0);
  return preloadSource.slice(start, Math.min(...ends));
}

function quotedValues(block: string): string[] {
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('allowlist channel preload (§2.11.2)', () => {
  it('memuat 7 channel baru v1.2', () => {
    const invokeBlock = blockAfter('const INVOKE_CHANNELS = Object.freeze({');
    for (const channel of sharedConstants.NEW_CHANNELS_V12) {
      expect(invokeBlock, channel).toContain(`'${channel}': true`);
    }
    expect(sharedConstants.NEW_CHANNELS_V12).toHaveLength(7);
  });

  it('tetap memuat channel BYOK & inti dari v1.1', () => {
    const invokeBlock = blockAfter('const INVOKE_CHANNELS = Object.freeze({');
    for (const channel of [
      'settings:setSecret', 'settings:hasSecret', 'settings:clearSecret',
      'settings:testProvider', 'ai:invoke', 'dialog:openFiles', 'fs:readDir',
      'ffmpeg:export', 'settings:get', 'settings:set',
    ]) {
      expect(invokeBlock, channel).toContain(`'${channel}': true`);
    }
  });

  it('tidak membuka channel wildcard/berbahaya', () => {
    const invokeBlock = blockAfter('const INVOKE_CHANNELS = Object.freeze({');
    expect(invokeBlock).not.toContain('*');
    expect(invokeBlock).not.toContain('eval');
    expect(invokeBlock).not.toContain('shell:openExternalPath');
  });
});

describe('daftar 13 provider inline (sandbox:true)', () => {
  it('sama persis dengan registry shared', () => {
    const block = blockAfter('const PROVIDERS = Object.freeze([');
    const inlineIds = quotedValues(block);
    expect(inlineIds).toEqual(registry.PROVIDER_IDS);
    expect(inlineIds).toHaveLength(13);
  });

  it('jobType, mode privasi & rentang usage inline sesuai shared', () => {
    expect(quotedValues(blockAfter('const JOB_TYPES = Object.freeze([')))
      .toEqual(sharedConstants.CLIENT_JOB_TYPES);
    expect(quotedValues(blockAfter('const PRIVACY_MODES = Object.freeze([')))
      .toEqual(sharedConstants.PRIVACY_MODES);
    expect(quotedValues(blockAfter('const CONFIRM_SCOPES = Object.freeze([')))
      .toEqual(sharedConstants.CONFIRM_SCOPES);
    expect(quotedValues(blockAfter('const WIPE_SCOPES = Object.freeze([')))
      .toEqual(sharedConstants.WIPE_SCOPES);
    expect(quotedValues(blockAfter('const USAGE_RANGES = Object.freeze([')))
      .toEqual(usageSchema.USAGE_RANGES);
  });
});

describe('isolasi sandbox preload', () => {
  it('hanya me-require modul `electron` (tidak ada require lintas berkas)', () => {
    const requires = [...preloadSource.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    expect(requires).toEqual(['electron']);
    expect(requires.some((id) => id.includes('shared'))).toBe(false);
  });

  it('mengekspos permukaan `window.keylox.*` + alias deprecated v1.2', () => {
    for (const ns of ['dialog', 'fs', 'shell', 'ffmpeg', 'project', 'settings', 'ai', 'usage', 'privacy', 'data']) {
      expect(preloadSource).toContain(`${ns}: {`);
    }
    for (const alias of [
      'openExternal:', 'usageGet:', 'privacyGetMode:', 'privacySetMode:',
      'privacyConfirmExternal:', 'wipeLocal:', 'exportLocal:',
    ]) {
      expect(preloadSource, alias).toContain(alias);
    }
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('keylox', keylox)");
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('api', Object.freeze(legacyApi))");
  });

  it('tidak memuat nilai key atau helper rahasia', () => {
    expect(preloadSource).not.toMatch(/AIza[0-9A-Za-z]/);
    expect(preloadSource).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
    expect(preloadSource).not.toMatch(/safeStorage\s*\./);
  });
});
