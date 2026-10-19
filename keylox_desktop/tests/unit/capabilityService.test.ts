// Unit tests — gate kapabilitas provider v1.2 (api-contract v1.2 §2.14.3, ADR-04).
//
// Yang dikunci di sini:
//  - kapabilitas eksplisit `false` → ERR_PROVIDER_INCOMPATIBLE (tanpa jaringan);
//  - kapabilitas `null` (mis. `custom`) → DIIZINKAN + `verified:false`;
//  - alias `asr` dinormalisasi ke `transcribe` (menutup REJ-05);
//  - override hasil uji boleh mempersempit registry;
//  - provider di luar registry → ERR_PROVIDER_UNSUPPORTED.
import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';

type CheckResult = {
  ok: true;
  provider: string;
  jobType: string;
  capability: string | null;
  verified: boolean;
};

const nodeRequire = createRequire(import.meta.url);
const capabilityModule = nodeRequire('../../src/main/capabilityService.js') as {
  check: (provider: string, jobType: string, override?: Record<string, unknown>) => CheckResult;
  capabilityFor: (jobType: string) => string | null;
  canonicalJobType: (jobType: string) => string;
};
const errorsModule = nodeRequire('../../src/main/errors.js') as { toErrorShape: (e: unknown) => any };

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return errorsModule.toErrorShape(error).code;
  }
  throw new Error('fungsi seharusnya melempar');
}

describe('capabilityService.check — penolakan & izin (§2.14.3)', () => {
  it('deepseek tanpa audioIn → transcribe ditolak', () => {
    const shape = (() => {
      try {
        capabilityModule.check('deepseek', 'transcribe');
      } catch (error) {
        return errorsModule.toErrorShape(error);
      }
      return null;
    })();
    expect(shape?.code).toBe('ERR_PROVIDER_INCOMPATIBLE');
    expect(shape?.details).toMatchObject({
      provider: 'deepseek',
      jobType: 'transcribe',
      capability: 'audioIn',
      verdict: 'incompatible',
    });
  });

  it('anthropic tanpa audioOut → tts ditolak; gemini lolos terverifikasi', () => {
    expect(codeOf(() => capabilityModule.check('anthropic', 'tts'))).toBe('ERR_PROVIDER_INCOMPATIBLE');
    expect(capabilityModule.check('gemini', 'tts')).toEqual({
      ok: true, provider: 'gemini', jobType: 'tts', capability: 'audioOut', verified: true,
    });
  });

  it('deepseek tanpa vision → scene_detect & thumbnail ditolak', () => {
    expect(codeOf(() => capabilityModule.check('deepseek', 'scene_detect'))).toBe('ERR_PROVIDER_INCOMPATIBLE');
    expect(codeOf(() => capabilityModule.check('deepseek', 'thumbnail'))).toBe('ERR_PROVIDER_INCOMPATIBLE');
  });

  it('custom (kapabilitas null) DIIZINKAN dan ditandai belum terverifikasi', () => {
    for (const jobType of ['scene_detect', 'transcribe', 'tts', 'parse_command']) {
      const result = capabilityModule.check('custom', jobType);
      expect(result.ok).toBe(true);
      expect(result.verified).toBe(false);
    }
  });

  it('json terverifikasi untuk parse_command/chat/refine', () => {
    for (const jobType of ['parse_command', 'chat', 'refine', 'moderation']) {
      const result = capabilityModule.check('gemini', jobType);
      expect(result.capability).toBe('json');
      expect(result.verified).toBe(true);
    }
  });

  it('provider lokal lolos untuk jobType yang didukung', () => {
    expect(capabilityModule.check('ollama', 'scene_detect').verified).toBe(true);
    expect(capabilityModule.check('ollama', 'chat').verified).toBe(true);
    // vision false pada groq → scene_detect ditolak.
    expect(codeOf(() => capabilityModule.check('groq', 'scene_detect'))).toBe('ERR_PROVIDER_INCOMPATIBLE');
    expect(capabilityModule.check('groq', 'transcribe').verified).toBe(true);
  });
});

describe('capabilityService — alias, override & input tak dikenal', () => {
  it('alias `asr` dinormalisasi ke `transcribe`', () => {
    const result = capabilityModule.check('gemini', 'asr');
    expect(result.jobType).toBe('transcribe');
    expect(result.capability).toBe('audioIn');
    expect(result.verified).toBe(true);
    expect(codeOf(() => capabilityModule.check('deepseek', 'asr'))).toBe('ERR_PROVIDER_INCOMPATIBLE');
  });

  it('capabilityFor/canonicalJobType konsisten untuk 18 jobType kanonik + alias', () => {
    expect(capabilityModule.capabilityFor('parse_command')).toBe('json');
    expect(capabilityModule.capabilityFor('scene_detect')).toBe('vision');
    expect(capabilityModule.capabilityFor('transcribe')).toBe('audioIn');
    expect(capabilityModule.capabilityFor('tts')).toBe('audioOut');
    expect(capabilityModule.capabilityFor('tidak_ada')).toBeNull();
    expect(capabilityModule.canonicalJobType('asr')).toBe('transcribe');
    expect(capabilityModule.canonicalJobType('chat')).toBe('chat');
  });

  it('override hasil uji boleh mempersempit registry (false menang)', () => {
    expect(codeOf(() => capabilityModule.check('gemini', 'transcribe', { audioIn: false })))
      .toBe('ERR_PROVIDER_INCOMPATIBLE');
    // Override juga boleh menandai terverifikasi walau registry null (custom).
    expect(capabilityModule.check('custom', 'scene_detect', { vision: true })).toMatchObject({
      ok: true, verified: true, capability: 'vision',
    });
    // Override null/undefined tidak boleh dianggap false.
    expect(capabilityModule.check('custom', 'scene_detect', { vision: null }).verified).toBe(false);
  });

  it('provider tak dikenal → ERR_PROVIDER_UNSUPPORTED', () => {
    expect(codeOf(() => capabilityModule.check('cohere', 'chat'))).toBe('ERR_PROVIDER_UNSUPPORTED');
    expect(codeOf(() => capabilityModule.check('', 'chat'))).toBe('ERR_PROVIDER_UNSUPPORTED');
  });

  it('jobType tak dikenal bukan urusan gate kapabilitas', () => {
    expect(capabilityModule.check('gemini', 'job_tidak_dikenal')).toEqual({
      ok: true, provider: 'gemini', jobType: 'job_tidak_dikenal', capability: null, verified: false,
    });
  });
});
