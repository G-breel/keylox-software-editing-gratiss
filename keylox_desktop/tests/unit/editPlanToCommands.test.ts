// Unit tests — jembatan EditPlan (kontrak §3.3) → perintah editor legacy.
//
// Kontrak prinsip yang diuji: op yang TIDAK punya padanan di editor legacy
// DILAPORKAN (`unsupported`), bukan ditebak atau dibuang diam-diam — renderer
// wajib bisa memberi tahu user bahwa sebagian plan belum dijalankan.
import { describe, it, expect } from 'vitest';
import { planToCommands, isEditPlanLike } from '../../src/renderer/lib/editPlanToCommands';

function plan(ops: any[], over: Record<string, unknown> = {}) {
  return {
    planId: 'plan-1',
    commandId: 'cmd-1',
    planVersion: 1,
    isDestructive: false,
    requiresConfirm: false,
    diffSummary: 'ringkasan',
    ops,
    ...over,
  };
}

function op(opType: string, params: Record<string, unknown> = {}, over: Record<string, unknown> = {}) {
  return { opId: `op-${opType}`, opType, target: { type: 'clip', id: 'clip-1' }, params, order: 1, ...over };
}

describe('isEditPlanLike — sabuk kedua di renderer (AC-8)', () => {
  it('menerima bentuk EditPlan minimum', () => {
    expect(isEditPlanLike(plan([op('trim', { inMs: 0, outMs: 1000 })]))).toBe(true);
  });

  it('menolak nilai yang bukan plan', () => {
    for (const bad of [null, undefined, 'plan', 42, [], {}, { planId: 'x' }]) {
      expect(isEditPlanLike(bad)).toBe(false);
    }
  });

  it('menolak plan tanpa ops / ops cacat', () => {
    expect(isEditPlanLike({ ...plan([]), ops: 'bukan array' })).toBe(false);
    expect(isEditPlanLike(plan([null]))).toBe(false);
    expect(isEditPlanLike(plan([{ opId: 'op-1' }]))).toBe(false);
  });
});

describe('planToCommands — pemetaan op', () => {
  it('trim dari params.inMs/outMs (ms → detik)', () => {
    const mapped = planToCommands(plan([op('trim', { inMs: 1000, outMs: 4000 })]));
    expect(mapped.commands).toEqual([{ a: 'trim', start: 1, end: 4 }]);
    expect(mapped.unsupported).toEqual([]);
  });

  it('trim jatuh ke timeRange bila params tidak ada', () => {
    const mapped = planToCommands(plan([op('trim', {}, { timeRange: { startMs: 500, endMs: 2500 } })]));
    expect(mapped.commands).toEqual([{ a: 'trim', start: 0.5, end: 2.5 }]);
  });

  it('trim tanpa informasi waktu → dilaporkan unsupported', () => {
    const mapped = planToCommands(plan([op('trim')]));
    expect(mapped.commands).toEqual([]);
    expect(mapped.unsupported[0].opType).toBe('trim');
  });

  it('speed valid & di-clamp; speed tidak valid → unsupported', () => {
    expect(planToCommands(plan([op('speed', { speed: 2 })])).commands).toEqual([{ a: 'speed', v: 2 }]);
    expect(planToCommands(plan([op('speed', { speed: 500 })])).commands).toEqual([{ a: 'speed', v: 100 }]);
    expect(planToCommands(plan([op('speed', { speed: 0 })])).unsupported[0].opType).toBe('speed');
  });

  it('rotate dari params.degrees, fallback params.rotation', () => {
    expect(planToCommands(plan([op('rotate', { degrees: 90 })])).commands).toEqual([{ a: 'rotate', deg: 90 }]);
    expect(planToCommands(plan([op('rotate', { rotation: -45 })])).commands).toEqual([{ a: 'rotate', deg: -45 }]);
    expect(planToCommands(plan([op('rotate', {})])).unsupported[0].opType).toBe('rotate');
  });

  it('flip horizontal/vertical', () => {
    expect(planToCommands(plan([op('flip', { axis: 'horizontal' })])).commands).toEqual([{ a: 'flipH' }]);
    expect(planToCommands(plan([op('flip', { axis: 'vertical' })])).commands).toEqual([{ a: 'flipV' }]);
    expect(planToCommands(plan([op('flip', {})])).commands).toEqual([{ a: 'flipH' }]);
  });

  it('crop & scalePosition (dobel bentuk: terbungkus / datar)', () => {
    expect(planToCommands(plan([op('crop', { crop: { x: 0, y: 10, w: 100, h: 200 } })])).commands).toEqual([
      { a: 'crop', x: 0, y: 10, w: 100, h: 200 },
    ]);
    expect(planToCommands(plan([op('crop', { x: 1, y: 2, width: 30, height: 40 })])).commands).toEqual([
      { a: 'crop', x: 1, y: 2, w: 30, h: 40 },
    ]);
    expect(planToCommands(plan([op('crop', { x: 1 })])).unsupported[0].opType).toBe('crop');
    expect(planToCommands(plan([op('scalePosition', { scale: { w: 1920, h: 1080 } })])).commands).toEqual([
      { a: 'scale', w: 1920, h: 1080 },
    ]);
  });

  it('reverse', () => {
    expect(planToCommands(plan([op('reverse')])).commands).toEqual([{ a: 'reverse' }]);
  });

  it('colorAdjust memecah brightness/contrast/saturation + clamp 0..4', () => {
    const mapped = planToCommands(plan([op('colorAdjust', { brightness: 1.5, contrast: 9, saturation: 0.8 })]));
    expect(mapped.commands).toEqual([
      { a: 'brightness', v: 1.5 },
      { a: 'contrast', v: 4 },
      { a: 'saturation', v: 0.8 },
    ]);
    expect(planToCommands(plan([op('colorAdjust', {})])).unsupported[0].opType).toBe('colorAdjust');
  });

  it('audioVolume di-clamp 0..2, audioMute & audioFade', () => {
    expect(planToCommands(plan([op('audioVolume', { volume: 5 })])).commands).toEqual([{ a: 'volume', v: 2 }]);
    expect(planToCommands(plan([op('audioVolume', {})])).unsupported[0].opType).toBe('audioVolume');
    expect(planToCommands(plan([op('audioMute')])).commands).toEqual([{ a: 'mute' }]);
    expect(planToCommands(plan([op('audioFade', { fadeInMs: 1000, fadeOutMs: 500 })])).commands).toEqual([
      { a: 'fade', in: 1, out: 0.5 },
    ]);
    expect(planToCommands(plan([op('audioFade', {})])).unsupported[0].opType).toBe('audioFade');
  });

  it('textAdd/captionGenerate butuh konten; waktu dari startMs atau timeRange', () => {
    expect(planToCommands(plan([op('textAdd', { content: 'Halo', startMs: 2000, size: 48, color: '#fff' })])).commands).toEqual([
      { a: 'text', text: 'Halo', at: 2, size: 48, color: '#fff' },
    ]);
    expect(planToCommands(plan([op('captionGenerate', { text: 'Judul' })])).commands[0].text).toBe('Judul');
    expect(planToCommands(plan([op('textAdd', { content: '   ' })])).unsupported[0].opType).toBe('textAdd');
  });
});

describe('planToCommands — urutan, laporan & flag destruktif', () => {
  it('eksekusi mengikuti `order`, bukan urutan array', () => {
    const mapped = planToCommands(
      plan([
        op('rotate', { degrees: 90 }, { opId: 'op-b', order: 2 }),
        op('speed', { speed: 2 }, { opId: 'op-a', order: 1 }),
      ])
    );
    expect(mapped.commands).toEqual([{ a: 'speed', v: 2 }, { a: 'rotate', deg: 90 }]);
  });

  it('op tanpa padanan dilaporkan, op lain tetap jalan', () => {
    const mapped = planToCommands(plan([op('trackingStart', { assetId: 'a-1' }), op('reverse')]));
    expect(mapped.commands).toEqual([{ a: 'reverse' }]);
    expect(mapped.unsupported).toEqual([{ opType: 'trackingStart', reason: expect.stringContaining('belum ada padanan') }]);
  });

  it('flag destruktif dinaikkan bila plan/isinya destruktif', () => {
    expect(planToCommands(plan([op('reverse')])).destructive).toBe(true);
    expect(planToCommands(plan([op('colorAdjust', { brightness: 1 })])).destructive).toBe(false);
    expect(planToCommands(plan([op('colorAdjust', { brightness: 1 })], { isDestructive: true })).destructive).toBe(true);
  });

  it('plan cacat → tidak ada perintah, dilaporkan (bukan crash)', () => {
    const mapped = planToCommands({ planId: 'x' });
    expect(mapped.commands).toEqual([]);
    expect(mapped.destructive).toBe(false);
    expect(mapped.unsupported).toEqual([{ opType: '(plan)', reason: expect.stringContaining('tidak dikenali') }]);
  });
});
