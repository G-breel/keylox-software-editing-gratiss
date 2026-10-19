// Unit tests — transparansi token & biaya v1.2 (api-contract v1.2 §2.16, ADR-04).
//
// Yang dikunci di sini:
//  - estCostUsd = pricePer1M × token, presisi 6 desimal, `null` bila harga tak diketahui;
//  - UsageSummary memenuhi skema kanonik (dipakai juga oleh guard internal service);
//  - filter range (today/7d/30d/all) dan filter provider/model;
//  - `wipe()` mengosongkan riwayat (dipakai `data:wipeLocal({scope:'usage'})`).
import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';

interface UsageRecordInput {
  recordedAt?: string;
  provider?: string;
  model?: string;
  jobType?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheHit?: boolean;
  latencyMs?: number;
}

interface UsageSummary {
  range: string;
  totals: { calls: number; inputTokens: number; outputTokens: number; estCostUsd: number | null };
  items: Array<{
    recordedAt: string;
    provider: string;
    model: string;
    jobType: string;
    inputTokens: number;
    outputTokens: number;
    estCostUsd: number | null;
    cacheHit: boolean;
  }>;
}

interface UsageService {
  record: (entry: UsageRecordInput) => UsageSummary['items'][number] & { latencyMs: number | null };
  summary: (options?: { range?: string; provider?: string; model?: string }) => UsageSummary;
  wipe: () => { deleted: number; freedBytes: number };
  count: () => number;
  estimateCostUsd: (provider: string, input: number, output: number) => number | null;
}

const nodeRequire = createRequire(import.meta.url);
const usageModule = nodeRequire('../../src/main/usageService.js') as {
  createUsageService: (deps?: { now?: () => number }) => UsageService;
  estimateCostUsd: (provider: string, input: number, output: number) => number | null;
};
const usageSchema = nodeRequire('../../src/shared/usage.schema.js') as {
  validateUsageSummary: (value: unknown) => { ok: boolean };
  USAGE_RANGES: string[];
};

const FIXED_NOW = Date.parse('2026-10-19T12:00:00.000Z');

function makeService() {
  return usageModule.createUsageService({ now: () => FIXED_NOW });
}

describe('estimateCostUsd (§2.16 butir 1–2)', () => {
  it('menghitung harga registry: gemini 1J token in+out = 2.8 USD', () => {
    expect(usageModule.estimateCostUsd('gemini', 1_000_000, 1_000_000)).toBe(2.8);
    expect(usageModule.estimateCostUsd('gemini', 1000, 500)).toBe(0.00155);
  });

  it('together memakai harga in/out yang sama', () => {
    expect(usageModule.estimateCostUsd('together', 1_000_000, 1_000_000)).toBe(1.76);
  });

  it('provider tanpa harga → null (bukan 0)', () => {
    expect(usageModule.estimateCostUsd('openrouter', 1000, 1000)).toBeNull();
    expect(usageModule.estimateCostUsd('custom', 1000, 1000)).toBeNull();
    expect(usageModule.estimateCostUsd('cohere', 1000, 1000)).toBeNull();
  });

  it('angka tidak valid/negatif → null', () => {
    expect(usageModule.estimateCostUsd('gemini', Number.NaN, 10)).toBeNull();
    expect(usageModule.estimateCostUsd('gemini', -1_000_000, 0)).toBeNull();
    expect(usageModule.estimateCostUsd('gemini', Infinity, 0)).toBeNull();
  });

  it('provider lokal gratis = 0', () => {
    expect(usageModule.estimateCostUsd('ollama', 1234, 5678)).toBe(0);
  });
});

describe('usageService.record + summary (§2.16)', () => {
  it('mencatat satu panggilan dan menghasilkan UsageSummary valid', () => {
    const service = makeService();
    const rec = service.record({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      jobType: 'parse_command',
      inputTokens: 100,
      outputTokens: 40,
      cacheHit: false,
      latencyMs: 321,
    });
    expect(rec.estCostUsd).toBeCloseTo(0.00013, 8);
    expect(rec.latencyMs).toBe(321);
    expect(rec.recordedAt).toBe(new Date(FIXED_NOW).toISOString());

    const summary = service.summary();
    expect(usageSchema.validateUsageSummary(summary).ok).toBe(true);
    expect(summary.range).toBe('all');
    expect(summary.totals).toEqual({
      calls: 1, inputTokens: 100, outputTokens: 40, estCostUsd: 0.00013,
    });
    expect(summary.items[0]).not.toHaveProperty('latencyMs');
    expect(summary.items[0].cacheHit).toBe(false);
  });

  it('menjumlahkan token/biaya lintas provider dan mempertahankan cacheHit', () => {
    const service = makeService();
    service.record({ provider: 'gemini', model: 'gemini-2.5-flash', jobType: 'scene_detect', inputTokens: 1000, outputTokens: 0, cacheHit: true });
    service.record({ provider: 'together', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', jobType: 'chat', inputTokens: 0, outputTokens: 1000 });
    service.record({ provider: 'openrouter', model: 'google/gemini-2.5-flash', jobType: 'chat', inputTokens: 500, outputTokens: 500 });

    const summary = service.summary();
    expect(summary.totals.calls).toBe(3);
    expect(summary.totals.inputTokens).toBe(1500);
    expect(summary.totals.outputTokens).toBe(1500);
    // 0.0003 (gemini in) + 0.00088 (together out) + null (openrouter) = 0.00118
    expect(summary.totals.estCostUsd).toBe(0.00118);
    expect(summary.items.map((i) => i.cacheHit)).toEqual([true, false, false]);
    expect(summary.items[2].estCostUsd).toBeNull();
  });

  it('semua provider tanpa harga → totals.estCostUsd null', () => {
    const service = makeService();
    service.record({ provider: 'openrouter', model: 'm', jobType: 'chat', inputTokens: 10, outputTokens: 20 });
    service.record({ provider: 'custom', model: 'm', jobType: 'chat', inputTokens: 5, outputTokens: 5 });
    const summary = service.summary();
    expect(summary.totals.estCostUsd).toBeNull();
    expect(summary.items.every((i) => i.estCostUsd === null)).toBe(true);
  });

  it('range today/7d/30d/all memfilter berdasarkan recordedAt', () => {
    const service = makeService();
    const push = (recordedAt: string, provider = 'gemini') => service.record({
      recordedAt, provider, model: 'm', jobType: 'chat', inputTokens: 1, outputTokens: 1,
    });
    push('2026-10-19T01:00:00.000Z'); // hari ini (UTC)
    push('2026-10-15T01:00:00.000Z'); // 4 hari lalu
    push('2026-09-15T01:00:00.000Z'); // 34 hari lalu
    push('2026-10-18T23:00:00.000Z'); // kemarin

    expect(service.summary({ range: 'today' }).totals.calls).toBe(1);
    expect(service.summary({ range: '7d' }).totals.calls).toBe(3);
    expect(service.summary({ range: '30d' }).totals.calls).toBe(3);
    expect(service.summary({ range: 'all' }).totals.calls).toBe(4);
    // Range tak dikenal → default `all` (§2.16).
    expect(service.summary({ range: 'tahun-ini' as any }).range).toBe('all');
    expect(service.summary({ range: 'tahun-ini' as any }).totals.calls).toBe(4);
  });

  it('filter provider & model bersifat AND', () => {
    const service = makeService();
    service.record({ provider: 'gemini', model: 'gemini-2.5-flash', jobType: 'chat', inputTokens: 1, outputTokens: 1 });
    service.record({ provider: 'gemini', model: 'gemini-2.5-pro', jobType: 'chat', inputTokens: 2, outputTokens: 2 });
    service.record({ provider: 'openai', model: 'gpt-4o-mini', jobType: 'chat', inputTokens: 3, outputTokens: 3 });

    expect(service.summary({ provider: 'gemini' }).totals.calls).toBe(2);
    expect(service.summary({ provider: 'gemini', model: 'gemini-2.5-pro' }).totals).toMatchObject({
      calls: 1, inputTokens: 2, outputTokens: 2,
    });
    expect(service.summary({ model: 'gpt-4o-mini' }).totals.calls).toBe(1);
    expect(service.summary({ provider: 'openai', model: 'gemini-2.5-flash' }).totals.calls).toBe(0);
  });

  it('token negatif/NaN dinormalkan ke 0 dan payload kosong tidak melempar', () => {
    const service = makeService();
    const rec = service.record({ inputTokens: -10, outputTokens: Number.NaN });
    expect(rec.inputTokens).toBe(0);
    expect(rec.outputTokens).toBe(0);
    expect(rec.provider).toBe('unknown');
    expect(rec.estCostUsd).toBeNull();
    expect(usageSchema.validateUsageSummary(service.summary()).ok).toBe(true);
  });

  it('wipe mengosongkan riwayat dan melaporkan jumlah yang dihapus', () => {
    const service = makeService();
    service.record({ provider: 'gemini', model: 'm', jobType: 'chat' });
    service.record({ provider: 'gemini', model: 'm', jobType: 'chat' });
    expect(service.count()).toBe(2);
    expect(service.wipe()).toEqual({ deleted: 2, freedBytes: 0 });
    expect(service.count()).toBe(0);
    expect(service.summary().totals).toEqual({ calls: 0, inputTokens: 0, outputTokens: 0, estCostUsd: null });
    expect(usageSchema.USAGE_RANGES).toEqual(['today', '7d', '30d', 'all']);
  });

  it('estimasi service sama dengan fungsi modul', () => {
    const service = makeService();
    expect(service.estimateCostUsd('groq', 2_000_000, 1_000_000))
      .toBe(usageModule.estimateCostUsd('groq', 2_000_000, 1_000_000));
  });
});
