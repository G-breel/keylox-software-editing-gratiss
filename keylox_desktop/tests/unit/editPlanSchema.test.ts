// Unit tests — EditPlanOutputSchema (kontrak v1.1 §3.3).
// Menutup SEC-PROMPT-01: output AI WAJIB tervalidasi & op destruktif tanpa
// konfirmasi DITOLAK (bukan disanitasi diam-diam).
//
// Modul CJS `src/shared/editPlan.schema.js` dimuat via createRequire (dipakai juga
// oleh main.js dan Stage 5 backend).
import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';

interface ValidateResult {
  ok: boolean;
  plan?: any;
  code?: string;
  message?: string;
  issues?: Array<{ path: Array<string | number>; message: string }>;
}
interface SchemaModule {
  EditPlanOutputSchema: { safeParse: (v: unknown) => { success: boolean; error?: any } };
  OP_TYPES: string[];
  OP_TARGET_TYPES: string[];
  DESTRUCTIVE_OP_TYPES: string[];
  validateEditPlan: (v: unknown) => ValidateResult;
  MAX_OPS: number;
}

const nodeRequire = createRequire(import.meta.url);
const mod = nodeRequire('../../src/shared/editPlan.schema.js') as SchemaModule;
const { EditPlanOutputSchema, OP_TYPES, validateEditPlan, MAX_OPS } = mod;

function validPlan(over: Record<string, unknown> = {}) {
  return {
    planId: 'plan-1',
    commandId: 'cmd-1',
    planVersion: 1,
    isDestructive: false,
    requiresConfirm: false,
    diffSummary: 'Trim 5 detik lalu tambah teks',
    ops: [
      {
        opId: 'op-1',
        opType: 'colorAdjust',
        target: { type: 'clip', id: 'clip-1' },
        params: { brightness: 1.2 },
        timeRange: { startMs: 0, endMs: 5000 },
        order: 1,
      },
    ],
    ...over,
  };
}

describe('EditPlanOutputSchema — bentuk & batas kontrak', () => {
  it('menerima plan yang sesuai kontrak', () => {
    expect(EditPlanOutputSchema.safeParse(validPlan()).success).toBe(true);
  });

  it('menerima plan tanpa ops (preview/no-op)', () => {
    expect(EditPlanOutputSchema.safeParse(validPlan({ ops: [] })).success).toBe(true);
  });

  it('menerima params opsional (diisi {})', () => {
    const plan = validPlan();
    delete (plan.ops[0] as any).params;
    const parsed = EditPlanOutputSchema.safeParse(plan);
    expect(parsed.success).toBe(true);
  });

  it('menolak opType di luar daftar kanonik §3.3', () => {
    const plan = validPlan();
    (plan.ops[0] as any).opType = 'makeItViral';
    expect(EditPlanOutputSchema.safeParse(plan).success).toBe(false);
  });

  it('menolak target type di luar clip|track|project|asset|text|effect', () => {
    const plan = validPlan();
    (plan.ops[0] as any).target = { type: 'person', id: 'x' };
    expect(EditPlanOutputSchema.safeParse(plan).success).toBe(false);
  });

  it('menolak field tak dikenal (strict — bukan sanitasi)', () => {
    const plan = validPlan({ unexpected: true });
    expect(EditPlanOutputSchema.safeParse(plan).success).toBe(false);
  });

  it(`menolak lebih dari ${MAX_OPS} ops`, () => {
    const ops = Array.from({ length: MAX_OPS + 1 }, (_, i) => ({
      opId: `op-${i}`,
      opType: 'trim',
      target: { type: 'clip', id: 'clip-1' },
      params: { inMs: 0, outMs: 1000 },
      order: i,
    }));
    const parsed = EditPlanOutputSchema.safeParse(validPlan({ ops, isDestructive: true, requiresConfirm: true }));
    expect(parsed.success).toBe(false);
  });

  it('menegakkan diffSummary <= 200 char (batas)', () => {
    expect(EditPlanOutputSchema.safeParse(validPlan({ diffSummary: 'x'.repeat(200) })).success).toBe(true);
    expect(EditPlanOutputSchema.safeParse(validPlan({ diffSummary: 'x'.repeat(201) })).success).toBe(false);
  });

  it('menegakkan timeRange: startMs >= 0 dan endMs >= startMs', () => {
    const bad = validPlan();
    (bad.ops[0] as any).timeRange = { startMs: 5000, endMs: 1000 };
    expect(EditPlanOutputSchema.safeParse(bad).success).toBe(false);

    const negative = validPlan();
    (negative.ops[0] as any).timeRange = { startMs: -1, endMs: 10 };
    expect(EditPlanOutputSchema.safeParse(negative).success).toBe(false);
  });

  it('menegakkan planVersion integer >= 1', () => {
    expect(EditPlanOutputSchema.safeParse(validPlan({ planVersion: 0 })).success).toBe(false);
    expect(EditPlanOutputSchema.safeParse(validPlan({ planVersion: 1.5 })).success).toBe(false);
  });

  it('menegakkan commandRef 1..251 bila ada', () => {
    expect(EditPlanOutputSchema.safeParse(validPlan({ commandRef: 251 })).success).toBe(true);
    expect(EditPlanOutputSchema.safeParse(validPlan({ commandRef: 252 })).success).toBe(false);
    expect(EditPlanOutputSchema.safeParse(validPlan({ commandRef: null })).success).toBe(true);
  });

  it('setiap opType kanonik diterima (tidak ada typo di daftar)', () => {
    expect(new Set(OP_TYPES).size).toBe(OP_TYPES.length);
  });
});

describe('op destruktif wajib konfirmasi (SEC-PROMPT-01)', () => {
  it('menolak "hapus semua clip" tanpa requiresConfirm — prompt injection', () => {
    const plan = validPlan({
      diffSummary: 'Hapus semua klip',
      ops: [{
        opId: 'op-1',
        opType: 'delete',
        target: { type: 'project', id: 'all' },
        params: {},
        order: 1,
      }],
    });
    const parsed = EditPlanOutputSchema.safeParse(plan);
    expect(parsed.success).toBe(false);
    const messages = parsed.error.issues.map((i: any) => i.message).join(' ');
    expect(messages).toMatch(/destruktif/i);
  });

  it('menolak plan destruktif dengan requiresConfirm=true tapi isDestructive=false', () => {
    const plan = validPlan({
      requiresConfirm: true,
      ops: [{ opId: 'o', opType: 'trim', target: { type: 'clip', id: 'c1' }, params: {}, order: 1 }],
    });
    expect(EditPlanOutputSchema.safeParse(plan).success).toBe(false);
  });

  it('menerima plan destruktif dengan kedua flag konsisten', () => {
    const plan = validPlan({
      isDestructive: true,
      requiresConfirm: true,
      ops: [{ opId: 'o', opType: 'delete', target: { type: 'clip', id: 'c1' }, params: {}, order: 1 }],
    });
    expect(EditPlanOutputSchema.safeParse(plan).success).toBe(true);
  });

  it('menolak isDestructive=true tanpa requiresConfirm (inkonsistensi)', () => {
    expect(EditPlanOutputSchema.safeParse(validPlan({ isDestructive: true })).success).toBe(false);
  });
});

describe('validateEditPlan()', () => {
  it('mengembalikan plan ternormalisasi saat valid', () => {
    const result = validateEditPlan(validPlan());
    expect(result.ok).toBe(true);
    expect(result.plan?.planId).toBe('plan-1');
  });

  it('menerima string JSON (output mentah provider)', () => {
    const result = validateEditPlan(JSON.stringify(validPlan()));
    expect(result.ok).toBe(true);
  });

  it('mengembalikan ERR_AI_INVALID_RESPONSE (retryable di kontrak) untuk JSON rusak', () => {
    const result = validateEditPlan('{bukan json');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('ERR_AI_INVALID_RESPONSE');
  });

  it('menolak nilai non-objek (array/null/angka)', () => {
    for (const bad of [[], null, 42, 'plain']) {
      const result = validateEditPlan(bad);
      expect(result.ok).toBe(false);
      expect(result.code).toBe('ERR_AI_INVALID_RESPONSE');
    }
  });

  it('pesan error tidak memuat nilai rahasia apa pun', () => {
    const plan = validPlan({ apiKey: 'SHOULD-NEVER-BE-HERE' } as any);
    const result = validateEditPlan(plan);
    expect(result.ok).toBe(false);
    expect(result.message).not.toContain('SHOULD-NEVER-BE-HERE');
    expect(JSON.stringify(result.issues || [])).not.toContain('SHOULD-NEVER-BE-HERE');
  });
});
