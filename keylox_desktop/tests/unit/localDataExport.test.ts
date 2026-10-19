// Unit tests — `data:exportLocal` v1.2 (api-contract v1.2 §2.15.5).
//
// Kontrak keras: `includeSecrets:true` TIDAK BOLEH menulis nilai API key utuh.
// Modul hanya pernah menulis `{ provider, hasKey, masked, model }`.
// Catatan deviasi: ekspor ditulis sebagai JSON (bukan ZIP) karena repo tidak
// memiliki dependensi arsip — isi & jaminan rahasia tetap sesuai kontrak.
import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

type ExportPayload = {
  format: string;
  formatVersion: number;
  exportedAt: string;
  appVersion: string | null;
  settings: Record<string, unknown>;
  usage: unknown;
  providerStatus?: Array<Record<string, unknown>>;
};

const nodeRequire = createRequire(import.meta.url);
const exportModule = nodeRequire('../../src/main/localDataExport.js') as {
  buildExportPayload: (input?: Record<string, unknown>) => ExportPayload;
  writeExportFile: (input: {
    filePath: string;
    payload: unknown;
    fsImpl?: Record<string, any>;
  }) => { filePath: string; size: number };
};
const errorsModule = nodeRequire('../../src/main/errors.js') as { toErrorShape: (e: unknown) => any };

// Key palsu dibangun programatik (secret-scan memindai repo).
const FAKE_KEY = ['AIza', 'z'.repeat(35)].join('');

describe('buildExportPayload — default tanpa rahasia (§2.15.5)', () => {
  it('bentuk dasar & tanpa providerStatus bila secrets tidak diminta', () => {
    const payload = exportModule.buildExportPayload({
      settings: { provider: 'gemini', model: 'gemini-2.5-flash' },
      now: () => '2026-10-19T12:00:00.000Z',
      appVersion: '1.0.0',
    });
    expect(payload).toEqual({
      format: 'keylox.local-export',
      formatVersion: 1,
      exportedAt: '2026-10-19T12:00:00.000Z',
      appVersion: '1.0.0',
      settings: { provider: 'gemini', model: 'gemini-2.5-flash' },
      usage: null,
    });
    expect(payload).not.toHaveProperty('providerStatus');
  });

  it('payload kosong tetap valid & tidak berbagi referensi settings', () => {
    const settings = { mode: 'standard' };
    const payload = exportModule.buildExportPayload({ settings });
    expect(payload.settings).toEqual({ mode: 'standard' });
    expect(payload.settings).not.toBe(settings);
    expect(payload.appVersion).toBeNull();
    expect(payload.usage).toBeNull();
    expect(JSON.parse(JSON.stringify(payload)).format).toBe('keylox.local-export');
  });

  it('includeSecrets (secrets diberikan) HANYA menulis status termask', () => {
    const payload = exportModule.buildExportPayload({
      secrets: [
        { provider: 'gemini', hasKey: true, masked: 'AIza••••••••', model: 'gemini-2.5-flash', apiKey: FAKE_KEY },
        { provider: 'ollama', hasKey: false, masked: null, model: 'llama3.2' },
      ],
    });
    expect(payload.providerStatus).toEqual([
      { provider: 'gemini', hasKey: true, masked: 'AIza••••••••', model: 'gemini-2.5-flash' },
      { provider: 'ollama', hasKey: false, masked: null, model: 'llama3.2' },
    ]);
    expect(JSON.stringify(payload)).not.toContain(FAKE_KEY);
    expect(JSON.stringify(payload)).not.toContain('apiKey');
  });

  it('field tak dikenal pada secret tidak pernah disalin', () => {
    const payload = exportModule.buildExportPayload({
      secrets: [{ provider: 'openai', hasKey: true, masked: 'sk-••••', apiKey: FAKE_KEY, raw: FAKE_KEY }],
    });
    expect(payload.providerStatus?.[0]).toEqual({
      provider: 'openai', hasKey: true, masked: 'sk-••••', model: null,
    });
    expect(JSON.stringify(payload)).not.toContain(FAKE_KEY);
  });
});

describe('writeExportFile — tulis JSON & pemetaan error (§2.15.5)', () => {
  it('menulis JSON valid dan mengembalikan {filePath,size}', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'keylox-export-'));
    const filePath = path.join(dir, 'nested', 'keylox-export.json');
    try {
      const payload = exportModule.buildExportPayload({
        secrets: [{ provider: 'gemini', hasKey: true, masked: 'AIza••••••••', model: 'gemini-2.5-flash' }],
        now: () => '2026-10-19T12:00:00.000Z',
      });
      const result = exportModule.writeExportFile({ filePath, payload });
      expect(result.filePath).toBe(filePath);
      expect(existsSync(filePath)).toBe(true);

      const text = readFileSync(filePath, 'utf8');
      expect(result.size).toBe(Buffer.byteLength(text, 'utf8'));
      const parsed = JSON.parse(text);
      expect(parsed.format).toBe('keylox.local-export');
      expect(parsed.providerStatus[0].masked).toBe('AIza••••••••');
      expect(text).not.toContain(FAKE_KEY);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('filePath kosong/bukan string → ERR_FS_PERMISSION', () => {
    for (const filePath of ['', null, 42]) {
      const shape = (() => {
        try {
          exportModule.writeExportFile({ filePath: filePath as any, payload: {} });
        } catch (error) {
          return errorsModule.toErrorShape(error);
        }
        return null;
      })();
      expect(shape?.code).toBe('ERR_FS_PERMISSION');
    }
  });

  it('payload tak dapat diserialisasi → ERR_FS_PERMISSION', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    let caught: unknown;
    try {
      exportModule.writeExportFile({ filePath: path.join(tmpdir(), 'x.json'), payload: circular });
    } catch (error) {
      caught = error;
    }
    expect(errorsModule.toErrorShape(caught).code).toBe('ERR_FS_PERMISSION');
  });

  it('kegagalan FS dipetakan ke ERR_FS_PERMISSION tanpa membocorkan isi', () => {
    const failingFs = {
      mkdirSync: () => {},
      writeFileSync: () => { throw new Error(`gagal menulis ${FAKE_KEY}`); },
    };
    let caught: unknown;
    try {
      exportModule.writeExportFile({
        filePath: path.join(tmpdir(), 'keylox-export-x.json'),
        payload: { format: 'keylox.local-export' },
        fsImpl: failingFs,
      });
    } catch (error) {
      caught = error;
    }
    const shape = errorsModule.toErrorShape(caught);
    expect(shape.code).toBe('ERR_FS_PERMISSION');
    expect(shape.details).toEqual({ reason: 'write_failed' });
    expect(JSON.stringify(shape)).not.toContain(FAKE_KEY);
  });
});
