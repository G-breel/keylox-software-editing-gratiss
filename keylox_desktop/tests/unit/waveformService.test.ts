import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const svc = require('../../src/main/waveformService') as any;

function makeWav(filePath: string, seconds = 0.5) {
  const sampleRate = 8000;
  const numSamples = Math.floor(sampleRate * seconds);
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  // RIFF header
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  // sine tone 440 Hz
  for (let i = 0; i < numSamples; i++) {
    const v = Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 32767 * 0.5);
    buf.writeInt16LE(v, 44 + i * 2);
  }
  fs.writeFileSync(filePath, buf);
}

describe('waveformService.validatePath', () => {
  it('menolak non-string / file tidak ada / ekstensi tidak didukung', () => {
    expect(svc.validatePath(null)).toBeNull();
    expect(svc.validatePath('')).toBeNull();
    expect(svc.validatePath('/tmp/no-such-file.wav')).toBeNull();
    const bad = path.join(os.tmpdir(), 'x.txt');
    fs.writeFileSync(bad, 'hi');
    expect(svc.validatePath(bad)).toBeNull();
    fs.rmSync(bad, { force: true });
  });

  it('menerima wav yang ada', () => {
    const p = path.join(os.tmpdir(), 'wf.wav');
    makeWav(p, 0.2);
    const info = svc.validatePath(p);
    expect(info).not.toBeNull();
    expect(info.resolved).toBe(path.resolve(p));
    fs.rmSync(p, { force: true });
  });
});

describe('waveformService.generateWaveform', () => {
  beforeEach(() => svc.clearCache());

  it('melempar ERR_MEDIA_UNREADABLE untuk file tidak ada', async () => {
    await expect(svc.generateWaveform('/tmp/nope-xyz.wav')).rejects.toMatchObject({ code: 'ERR_MEDIA_UNREADABLE' });
  });

  it('menghasilkan peaks + durasi untuk wav kecil', async () => {
    const p = path.join(os.tmpdir(), 'wf2.wav');
    makeWav(p, 0.5);
    const r = await svc.generateWaveform(p);
    expect(r.sampleRate).toBe(8000);
    expect(Array.isArray(r.peaks)).toBe(true);
    expect(r.peaks.length).toBeGreaterThan(0);
    expect(r.peaks.length).toBeLessThanOrEqual(svc.MAX_PEAKS);
    for (const pk of r.peaks) { expect(pk).toBeGreaterThanOrEqual(0); expect(pk).toBeLessThanOrEqual(1); }
    expect(r.durationMs).toBeGreaterThan(0);
    fs.rmSync(p, { force: true });
  });

  it('cache: panggilan kedua mengembalikan hasil yang sama', async () => {
    const p = path.join(os.tmpdir(), 'wf3.wav');
    makeWav(p, 0.3);
    const a = await svc.generateWaveform(p);
    const b = await svc.generateWaveform(p);
    expect(b).toBe(a);
    expect(svc.cacheSize()).toBe(1);
    fs.rmSync(p, { force: true });
  });

  it('clearCache mengosongkan', async () => {
    const p = path.join(os.tmpdir(), 'wf4.wav');
    makeWav(p, 0.2);
    await svc.generateWaveform(p);
    svc.clearCache();
    expect(svc.cacheSize()).toBe(0);
    fs.rmSync(p, { force: true });
  });
});

describe('waveformService.computePeaks', () => {
  it('peaks dari buffer kosong → [] dan durasi 0', () => {
    const r = svc.computePeaks(Buffer.alloc(0));
    expect(r.peaks).toEqual([]);
    expect(r.durationMs).toBe(0);
  });

  it('peaks dari 1 detik audio 8000 Hz → 20 peak', () => {
    const samples = 8000;
    const buf = Buffer.alloc(samples * 2);
    for (let i = 0; i < samples; i++) {
      buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / 8000) * 32767 * 0.5), i * 2);
    }
    const r = svc.computePeaks(buf);
    expect(r.peaks.length).toBe(20); // 8000/400
    expect(r.durationMs).toBe(1000);
  });
});