// Security regression tests — guard IPC main process (Stage 8).
// Memuat modul CJS src/main/securityGuards.js (dipakai oleh main.js) dari test TS.
import { createRequire } from 'node:module';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

interface PathGuards {
  isDeniedPath: (p: string) => boolean;
  safeResolve: (p: unknown) => string | null;
  safeMediaFile: (p: unknown) => string | null;
  safeDirectory: (p: unknown) => string | null;
  safeOutputPath: (p: unknown) => string | null;
  safeFilter: (v: unknown) => string | null;
  safeNumber: (v: unknown, o: { min: number; max: number; fallback: number }) => number;
}

const nodeRequire = createRequire(import.meta.url);
const guards = nodeRequire('../../src/main/securityGuards.js') as PathGuards;

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'keylox-guards-'));
  mkdirSync(path.join(dir, 'sub'), { recursive: true });
  writeFileSync(path.join(dir, 'clip.mp4'), 'not-a-real-video');
  writeFileSync(path.join(dir, 'notes.txt'), 'plain text');
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('safeResolve / path guards', () => {
  it('menerima path absolut yang ada', () => {
    expect(guards.safeResolve(path.join(dir, 'clip.mp4'))).toBeTruthy();
  });

  it('menolak path relatif', () => {
    expect(guards.safeResolve('clip.mp4')).toBeNull();
  });

  it('menolak UNC / device path', () => {
    expect(guards.safeResolve('\\\\?\\C:\\Windows\\win.ini')).toBeNull();
    expect(guards.safeResolve('\\\\.\\PIPE\\name')).toBeNull();
    expect(guards.safeResolve('//server/share/file.mp4')).toBeNull();
  });

  it('menolak pseudo-fs POSIX dan null byte', () => {
    expect(guards.safeResolve('/dev/zero')).toBeNull();
    expect(guards.safeResolve('/proc/self/environ')).toBeNull();
    expect(guards.safeResolve(`${dir}${path.sep}clip.mp4\0.png`)).toBeNull();
  });

  it('menolak direktori penyimpanan kredensial', () => {
    expect(guards.isDeniedPath(path.join(dir, '.ssh', 'id_rsa'))).toBe(true);
    expect(guards.isDeniedPath(path.join(dir, 'movies', 'clip.mp4'))).toBe(false);
  });

  it('menolak tipe non-string, string kosong, dan argumen hilang', () => {
    expect(guards.safeResolve(undefined)).toBeNull();
    expect(guards.safeResolve(42)).toBeNull();
    expect(guards.safeResolve('')).toBeNull();
  });
});

describe('safeMediaFile / safeDirectory / safeOutputPath', () => {
  it('hanya menerima berkas media dengan ekstensi di allowlist', () => {
    expect(guards.safeMediaFile(path.join(dir, 'clip.mp4'))).toBeTruthy();
    expect(guards.safeMediaFile(path.join(dir, 'notes.txt'))).toBeNull();
    expect(guards.safeMediaFile(path.join(dir, 'sub'))).toBeNull();
    expect(guards.safeMediaFile(path.join(dir, 'missing.mp4'))).toBeNull();
  });

  it('hanya menerima direktori untuk enumerasi', () => {
    expect(guards.safeDirectory(path.join(dir, 'sub'))).toBeTruthy();
    expect(guards.safeDirectory(path.join(dir, 'clip.mp4'))).toBeNull();
  });

  it('output export harus absolut, ekstensi container, induk ada', () => {
    expect(guards.safeOutputPath(path.join(dir, 'render.mp4'))).toBeTruthy();
    expect(guards.safeOutputPath(path.join(dir, 'render.webm'))).toBeTruthy();
    expect(guards.safeOutputPath(path.join(dir, 'render.txt'))).toBeNull();
    expect(guards.safeOutputPath('render.mp4')).toBeNull();
    expect(guards.safeOutputPath(path.join(dir, 'missing-dir', 'render.mp4'))).toBeNull();
  });
});

describe('safeFilter — anti FFmpeg filter injection', () => {
  it('menerima filter normal dari UI', () => {
    expect(guards.safeFilter("drawtext=text='halo':fontsize=24")).toContain('drawtext');
    expect(guards.safeFilter('crop=100:100:0:0,eq=brightness=0.1')).toContain('crop=');
    expect(guards.safeFilter('')).toBe('');
  });

  it('menolak filter pembaca berkas/URL (file disclosure & SSRF)', () => {
    const evil = [
      'movie=/etc/passwd',
      'drawtext=textfile=/etc/passwd',
      'subtitles=http://evil.example/x.srt',
      'amovie=/tmp/secret.wav',
      'movie=https://evil.example/payload.mp4',
    ];
    for (const e of evil) {
      expect(guards.safeFilter(e), e).toBeNull();
    }
  });

  it('menolak karakter kontrol (newline/NUL) dan tipe non-string', () => {
    expect(guards.safeFilter('crop=1:1:0:0\nmovie=/etc/passwd')).toBeNull();
    expect(guards.safeFilter('crop=1:1:0:0\0')).toBeNull();
    expect(guards.safeFilter(123)).toBeNull();
    expect(guards.safeFilter('x'.repeat(5000))).toBeNull();
  });
});

describe('safeNumber — pembatas nilai numerik', () => {
  it('memakai fallback saat NaN / di luar batas', () => {
    expect(guards.safeNumber('2', { min: 0, max: 10, fallback: 1 })).toBe(2);
    expect(guards.safeNumber('abc', { min: 0, max: 10, fallback: 1 })).toBe(1);
    expect(guards.safeNumber(1e9, { min: 0, max: 86400, fallback: 0 })).toBe(0);
    expect(guards.safeNumber(Infinity, { min: 0, max: 10, fallback: 5 })).toBe(5);
  });
});
