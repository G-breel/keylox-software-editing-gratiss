import { createRequire } from 'node:module';
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { relinkProject, toProjectSnapshot } from '../../src/renderer/lib/projectState';

const nodeRequire = createRequire(import.meta.url);
const projectFile = nodeRequire('../../src/main/projectFile.js') as any;
const { KeyloxError } = nodeRequire('../../src/main/errors.js') as any;

const tempDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'keylox-project-'));
  tempDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function baseProject(mediaPath = '') {
  return {
    name: 'Proyek Uji',
    aspectRatio: '16:9',
    width: 1920,
    height: 1080,
    fps: 30,
    playhead: 2500,
    selectedClipId: 'c1',
    lastExport: { format: 'mp4', fps: '30' },
    tracks: [
      {
        id: 'v1', name: 'Video 1', type: 'video', visible: true, locked: false,
        clips: [{
          id: 'c1', mediaId: 'm1', name: 'klip.mp4', path: mediaPath, trackId: 'v1',
          start: 1, end: 6, in: 2, out: 7, speed: 1, volume: 1, muted: false,
          filters: { brightness: 1, contrast: 1, saturation: 1, hue: 0, blur: 0, sharpen: 0, grayscale: false, sepia: false },
          transform: { rotate: 0, flipH: false, flipV: false, crop: null, scale: null, reverse: false },
          textOverlays: [], fadeIn: 0, fadeOut: 0, removeAudio: false, chroma: false, chromaSim: 0.3,
        }],
      },
    ],
    media: [{ id: 'm1', name: 'klip.mp4', path: mediaPath, duration: 30 }],
  };
}

describe('manifest proyek', () => {
  it('membangun manifest lengkap (versi, track, clip in/out, playhead, export)', () => {
    const manifest = projectFile.buildManifest({
      project: baseProject('C:/media/klip.mp4'),
      appVersion: '1.0.0',
      now: '2026-10-19T12:00:00.000Z',
      projectId: 'pid-1',
      platform: 'win32',
      mediaHashes: { 'C:/media/klip.mp4': 'abc123' },
    });
    expect(manifest.format).toBe('keylox.project');
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.schemaVersion).toBe(3);
    expect(manifest.projectId).toBe('pid-1');
    expect(manifest.mediaMode).toBe('reference');
    expect(manifest.updatedAt).toBe('2026-10-19T12:00:00.000Z');
    expect(manifest.project.playhead).toBe(2500);
    expect(manifest.project.lastExport).toEqual({ format: 'mp4', fps: '30' });
    expect(manifest.tracks[0].clips[0].in).toBe(2);
    expect(manifest.tracks[0].clips[0].out).toBe(7);
    expect(manifest.media[0].hash).toBe('abc123');
    expect(manifest.settings.lastExport).toEqual({ format: 'mp4', fps: '30' });
  });

  it('tidak menulis field rahasia & menolak nilai yang menyerupai API key', () => {
    const project: any = baseProject('C:/media/klip.mp4');
    project.apiKey = 'harus-dihapus';
    project.tracks[0].clips[0].secret = 'harus-dihapus';
    const manifest = projectFile.buildManifest({ project });
    expect(JSON.stringify(manifest)).not.toContain('harus-dihapus');

    const leaky = baseProject('C:/media/klip.mp4');
    leaky.name = `AIza${'A'.repeat(35)}`;
    expect(() => projectFile.buildManifest({ project: leaky })).toThrowError(KeyloxError);
  });

  it('round-trip ZIP: pack → read mengembalikan proyek ternormalisasi', () => {
    const project = baseProject('C:/media/klip.mp4');
    const manifest = projectFile.buildManifest({ project, projectId: 'pid-rt' });
    const buffer = projectFile.packProject(manifest);
    const parsed = projectFile.readProjectArchive(buffer);
    expect(parsed.manifest.projectId).toBe('pid-rt');
    expect(parsed.project.name).toBe('Proyek Uji');
    expect(parsed.project.playhead).toBe(2500);
    expect(parsed.project.tracks[0].clips[0].in).toBe(2);
    expect(parsed.entryNames).toContain('manifest.json');
  });

  it('menolak manifest dengan versi format lebih baru', () => {
    const manifest = projectFile.buildManifest({ project: baseProject('') });
    manifest.formatVersion = 99;
    const buffer = projectFile.packProject(manifest);
    expect(() => projectFile.readProjectArchive(buffer)).toThrowError(/lebih baru/i);
  });

  it('menolak entri ZIP berbahaya (zip-slip)', () => {
    const manifest = projectFile.buildManifest({ project: baseProject('') });
    const bad = Buffer.from(zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
      '../evil.txt': strToU8('x'),
    }));
    expect(() => projectFile.readProjectArchive(bad)).toThrowError(/zip-slip/i);
  });

  it('menolak arsip tanpa manifest.json', () => {
    const bad = Buffer.from(zipSync({ 'lain.txt': strToU8('x') }));
    expect(() => projectFile.readProjectArchive(bad)).toThrowError(/manifest/i);
  });
});

describe('media reference, hash & relink', () => {
  it('hashProjectMedia + mediaStatus mendeteksi media hilang dan hash berubah', () => {
    const dir = tempDir();
    const mediaPath = path.join(dir, 'klip.mp4');
    writeFileSync(mediaPath, 'konten-media');
    const project = baseProject(mediaPath);
    const hashes = projectFile.hashProjectMedia(project);
    const manifest = projectFile.buildManifest({ project, mediaHashes: hashes });

    expect(projectFile.mediaStatus(manifest).missing).toHaveLength(0);

    writeFileSync(mediaPath, 'konten-berubah');
    const changed = projectFile.mediaStatus(manifest).missing;
    expect(changed).toHaveLength(1);
    expect(changed[0].reason).toBe('hash_mismatch');

    rmSync(mediaPath);
    const gone = projectFile.mediaStatus(manifest).missing;
    expect(gone[0].reason).toBe('missing');
  });

  it('pack dengan includeMedia menaruh media di folder media/ dan menandai bundled', () => {
    const dir = tempDir();
    const mediaPath = path.join(dir, 'klip.mp4');
    writeFileSync(mediaPath, 'abc');
    const project = baseProject(mediaPath);
    const manifest = projectFile.buildManifest({ project, mediaHashes: projectFile.hashProjectMedia(project) });
    const buffer = projectFile.packProject(manifest, { includeMedia: true });
    const parsed = projectFile.readProjectArchive(buffer);
    expect(parsed.manifest.mediaMode).toBe('bundled');
    expect(parsed.manifest.media[0].bundledPath).toMatch(/^media\//);
    expect(parsed.entryNames.some((name: string) => name.startsWith('media/'))).toBe(true);
  });

  it('relinkProject memperbarui media + semua klip (immutable)', () => {
    const project = baseProject('C:/lama/klip.mp4');
    const result = relinkProject(project as any, { m1: 'D:/baru/klip.mp4' });
    expect(result.media[0].path).toBe('D:/baru/klip.mp4');
    expect(result.media[0].name).toBe('klip.mp4');
    expect(result.tracks[0].clips[0].path).toBe('D:/baru/klip.mp4');
    // input tidak berubah
    expect(project.media[0].path).toBe('C:/lama/klip.mp4');
  });

  it('toProjectSnapshot hanya memuat field proyek (tanpa UI/rahasia)', () => {
    const snapshot = toProjectSnapshot({
      ...baseProject('C:/media/klip.mp4'),
      isPlaying: true,
      selectedClipId: 'c1',
    } as any);
    expect(snapshot.isPlaying).toBeUndefined();
    expect((snapshot as any).pxPerSec).toBeUndefined();
    expect(JSON.stringify(snapshot)).not.toMatch(/apiKey/i);
  });
});

describe('path & autosave', () => {
  it('autosavePathFor berada di userData/autosave.keylox', () => {
    const dir = tempDir();
    expect(projectFile.autosavePathFor(dir)).toBe(path.join(dir, 'autosave.keylox'));
    expect(projectFile.recentPathFor(dir)).toBe(path.join(dir, 'recent-projects.json'));
  });

  it('validasi path proyek: absolut + ekstensi .keylox, tolak UNC/device/relatif', () => {
    expect(projectFile.validateProjectPath('C:/proyek/uji.keylox')).toContain('uji.keylox');
    expect(() => projectFile.validateProjectPath('relatif.keylox')).toThrowError(KeyloxError);
    expect(() => projectFile.validateProjectPath('C:/proyek/uji.mp4')).toThrowError(KeyloxError);
    expect(() => projectFile.validateProjectPath('\\\\server\\share\\uji.keylox')).toThrowError(KeyloxError);
    expect(projectFile.ensureProjectExtension('C:/proyek/uji')).toBe('C:/proyek/uji.keylox');
  });

  it('writeProjectFile menulis atomik dan hanya ke path valid', () => {
    const dir = tempDir();
    mkdirSync(dir, { recursive: true });
    const manifest = projectFile.buildManifest({ project: baseProject('') });
    const buffer = projectFile.packProject(manifest);
    const target = path.join(dir, 'hasil.keylox');
    const written = projectFile.writeProjectFile(target, buffer);
    expect(written.filePath).toBe(target);
    expect(projectFile.readProjectFile(target).project.name).toBe('Proyek Uji');
  });

  it('daftar recent: dedupe, urut terbaru, dibatasi 10', () => {
    let list: any[] = [];
    for (let i = 0; i < 12; i++) {
      list = projectFile.updateRecentList(list, {
        filePath: `C:/p/${i}.keylox`,
        name: `P${i}`,
        savedAt: `2026-10-19T00:00:${String(i).padStart(2, '0')}.000Z`,
      });
    }
    expect(list).toHaveLength(10);
    expect(list[0].filePath).toBe('C:/p/11.keylox');

    const deduped = projectFile.updateRecentList(list, { filePath: 'C:/p/5.keylox', name: 'P5 baru' });
    expect(deduped).toHaveLength(10);
    expect(deduped[0].filePath).toBe('C:/p/5.keylox');
    expect(deduped.filter((item: any) => item.filePath === 'C:/p/5.keylox')).toHaveLength(1);
  });
});
