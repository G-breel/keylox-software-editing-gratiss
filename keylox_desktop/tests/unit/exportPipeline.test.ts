import { describe, it, expect } from 'vitest';

const m = require('../../src/main/exportPipeline') as any;
const presets = require('../../src/shared/exportPresets') as any;

const { buildExportPlan, buildExportArgs, buildAtempoFilters, validateExportInput } = m;

function baseInput(overrides: any = {}) {
  return {
    clips: [
      {
        path: 'C:/media/a.mp4',
        inMs: 0,
        outMs: 5000,
        startMs: 0,
        speed: 1,
        volume: 1,
        muted: false,
        fadeInMs: 0,
        fadeOutMs: 0,
        isImage: false,
        filters: { brightness: 1, contrast: 1, saturation: 1, hue: 0, blur: 0, grayscale: false, sepia: false },
        transform: { scaleX: 1, scaleY: 1, rotation: 0, flipH: false, flipV: false },
      },
    ],
    preset: { width: 1080, height: 1920, fps: 30, crf: 23, videoBitrateKbps: 2000, audioBitrateKbps: 128 },
    outputPath: 'C:/out/result.mp4',
    hasAudio: true,
    ...overrides,
  };
}

describe('buildAtempoFilters', () => {
  it('speed 1 → []', () => {
    expect(buildAtempoFilters(1)).toEqual([]);
  });

  it('speed 0.25 → rantai atempo 0.5, 0.5', () => {
    expect(buildAtempoFilters(0.25)).toEqual(['atempo=0.5', 'atempo=0.5']);
  });

  it('speed 4 → rantai atempo 2.0, 2.0', () => {
    expect(buildAtempoFilters(4)).toEqual(['atempo=2.0', 'atempo=2']);
  });

  it('speed 1.5 → satu atempo=1.5', () => {
    const r = buildAtempoFilters(1.5);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatch(/^atempo=/);
  });
});

describe('validateExportInput', () => {
  it('menolak clips kosong', () => {
    expect(() => validateExportInput({ clips: [], outputPath: 'x.mp4' })).toThrow();
    try { validateExportInput({ clips: [], outputPath: 'x.mp4' }); }
    catch (e: any) { expect(e.code).toBe('ERR_VALIDATION_PAYLOAD'); }
  });

  it('menolak outputPath tanpa .mp4', () => {
    try { validateExportInput(baseInput({ outputPath: 'C:/out/x.mkv' })); throw new Error('should throw'); }
    catch (e: any) { expect(e.code).toBe('ERR_VALIDATION_PAYLOAD'); }
  });

  it('menolak path dengan movie= (injeksi filter)', () => {
    const inp = baseInput();
    inp.clips[0].path = 'C:/media/movie=/etc/passwd.mp4';
    try { validateExportInput(inp); throw new Error('should throw'); }
    catch (e: any) { expect(e.code).toBe('ERR_VALIDATION_PAYLOAD'); }
  });

  it('menolak outputPath dengan karakter kontrol', () => {
    try { validateExportInput(baseInput({ outputPath: 'C:/out/x\n.mp4' })); throw new Error('should throw'); }
    catch (e: any) { expect(e.code).toBe('ERR_VALIDATION_PAYLOAD'); }
  });

  it('menolak speed di luar batas', () => {
    const inp = baseInput();
    inp.clips[0].speed = 0;
    try { validateExportInput(inp); throw new Error('should throw'); }
    catch (e: any) { expect(e.code).toBe('ERR_VALIDATION_PAYLOAD'); }
  });
});

describe('buildExportPlan', () => {
  it('1 klip trim → filterGraph memuat trim + setpts', () => {
    const plan = buildExportPlan(baseInput());
    expect(plan.filterGraph).toContain('trim=start=0:end=5');
    expect(plan.filterGraph).toContain('setpts=PTS-STARTPTS');
    expect(plan.durationMs).toBe(5000);
    expect(plan.warnings).toHaveLength(0);
  });

  it('1 klip speed 2x → durationMs setengah + atempo', () => {
    const inp = baseInput();
    inp.clips[0].speed = 2;
    const plan = buildExportPlan(inp);
    expect(plan.durationMs).toBe(2500);
    expect(plan.filterGraph).toContain('setpts=(PTS-STARTPTS)/2');
    expect(plan.filterGraph).toContain('atempo=2');
  });

  it('multi-clip → concat=n=2', () => {
    const inp = baseInput();
    inp.clips.push({ ...inp.clips[0], path: 'C:/media/b.mp4' });
    const plan = buildExportPlan(inp);
    expect(plan.filterGraph).toContain('concat=n=2:v=1:a=1');
    expect(plan.filterGraph).toContain('[v0][a0][v1][a1]');
  });

  it('klip tanpa audio → anullsrc + warning', () => {
    const inp = baseInput({ hasAudio: false });
    const plan = buildExportPlan(inp);
    expect(plan.filterGraph).toContain('anullsrc');
    expect(plan.warnings.some((w: string) => /audio/i.test(w))).toBe(true);
  });

  it('mute → volume=0', () => {
    const inp = baseInput();
    inp.clips[0].muted = true;
    const plan = buildExportPlan(inp);
    expect(plan.filterGraph).toContain('volume=0');
  });

  it('fade in/out → afade', () => {
    const inp = baseInput();
    inp.clips[0].fadeInMs = 500;
    inp.clips[0].fadeOutMs = 300;
    const plan = buildExportPlan(inp);
    expect(plan.filterGraph).toContain('afade=t=in');
    expect(plan.filterGraph).toContain('afade=t=out');
  });

  it('preset 9:16 → scale+pad', () => {
    const plan = buildExportPlan(baseInput());
    expect(plan.filterGraph).toContain('scale=w=1080:h=1920:force_original_aspect_ratio=decrease');
    expect(plan.filterGraph).toContain('pad=1080:1920');
  });

  it('grayscale + sepia → format=gray + colorchannelmixer', () => {
    const inp = baseInput();
    inp.clips[0].filters.grayscale = true;
    inp.clips[0].filters.sepia = true;
    const plan = buildExportPlan(inp);
    expect(plan.filterGraph).toContain('format=gray');
    expect(plan.filterGraph).toContain('colorchannelmixer=');
  });

  it('rotasi & flip → hflip/vflip/rotate', () => {
    const inp = baseInput();
    inp.clips[0].transform.flipH = true;
    inp.clips[0].transform.flipV = true;
    inp.clips[0].transform.rotation = 90;
    const plan = buildExportPlan(inp);
    expect(plan.filterGraph).toContain('hflip');
    expect(plan.filterGraph).toContain('vflip');
    expect(plan.filterGraph).toContain('rotate=90');
  });

  it('gambar statis → warning + anullsrc', () => {
    const inp = baseInput();
    inp.clips[0].isImage = true;
    inp.clips[0].outMs = null;
    const plan = buildExportPlan(inp);
    expect(plan.warnings.some((w: string) => /gambar statis/i.test(w))).toBe(true);
    expect(plan.filterGraph).toContain('anullsrc');
  });
});

describe('buildExportArgs', () => {
  it('argv lengkap & aman (array, bukan shell string)', () => {
    const inp = baseInput();
    const plan = buildExportPlan(inp);
    const args = buildExportArgs(plan, inp);
    expect(Array.isArray(args)).toBe(true);
    expect(args[0]).toBe('-y');
    expect(args).toContain('-i');
    expect(args).toContain('C:/media/a.mp4');
    expect(args).toContain('-filter_complex');
    expect(args).toContain('-map');
    expect(args).toContain('[v]');
    expect(args).toContain('[a]');
    expect(args).toContain('-c:v');
    expect(args).toContain('libx264');
    expect(args).toContain('-crf');
    expect(args).toContain('-movflags');
    expect(args).toContain('+faststart');
    expect(args[args.length - 1]).toBe('C:/out/result.mp4');
  });
});

describe('exportPresets', () => {
  it('minimal 7 preset & getExportPreset fallback', () => {
    const list = presets.listExportPresets();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(7);
    const p = presets.getExportPreset('tidak-ada');
    expect(p).toBeTruthy();
    expect(p.id).toBe('youtube-1080p');
  });

  it('preset 9:16 ada', () => {
    const p = presets.getExportPreset('tiktok-1080x1920');
    expect(p.width).toBe(1080);
    expect(p.height).toBe(1920);
  });
});