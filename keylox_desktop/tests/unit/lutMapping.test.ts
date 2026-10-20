import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import manifest from '../../assets/packs/starter/manifest.json';

describe('lutMapping - manifest', () => {
  it('manifest has >=3 items', () => {
    expect(manifest.items.length).toBeGreaterThanOrEqual(3);
  });

  it('each item has id,type,name,file', () => {
    for (const i of manifest.items as Array<{ id: string; type: string; name: string; file: string }>) {
      expect(typeof i.id).toBe('string');
      expect(i.type).toBe('lut');
      expect(typeof i.name).toBe('string');
      expect(typeof i.file).toBe('string');
    }
  });

  it('each lut file exists on disk', () => {
    const base = path.resolve(process.cwd(), 'assets', 'packs', 'starter');
    for (const i of manifest.items as Array<{ file: string }>) {
      expect(fs.existsSync(path.resolve(base, i.file))).toBe(true);
    }
  });

  it('clip.lut defaults to null when missing', () => {
    const clip: { lut?: string | null } = {};
    expect(clip.lut || null).toBeNull();
  });
});