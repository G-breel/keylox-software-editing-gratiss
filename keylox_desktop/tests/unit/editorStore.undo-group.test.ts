import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../../src/renderer/stores/editorStore';
import type { Clip } from '../../src/renderer/lib/types';

// ---------------------------------------------------------------------------
// Unit tests: grouped undo (R6.1 / api-contract v1.2 §4.3 butir 7).
//
// Satu perintah AI boleh menghasilkan banyak operasi, tetapi HARUS menjadi
// SATU entri undo. `beginGroup` .. `endGroup` membungkus semuanya.
// ---------------------------------------------------------------------------

function makeClip(id: string, over: Partial<Clip> = {}): Clip {
  return {
    id,
    mediaId: 'm1',
    name: `${id}.mp4`,
    path: 'C:/videos/' + id + '.mp4',
    trackId: 'v1',
    start: 0,
    end: 10,
    speed: 1,
    volume: 1,
    muted: false,
    filters: { brightness: 1, contrast: 1, saturation: 1, hue: 0, blur: 0, sharpen: 0, grayscale: false, sepia: false },
    transform: { rotate: 0, flipH: false, flipV: false, crop: null, scale: null, reverse: false },
    textOverlays: [],
    fadeIn: 0,
    fadeOut: 0,
    removeAudio: false,
    chroma: false,
    chromaSim: 0,
    ...over,
  };
}

const s = () => useEditorStore.getState();

beforeEach(() => {
  s().initProject('Undo Group Test');
});

describe('editorStore — grouped undo', () => {
  it('5 operasi dalam satu grup = 1 undo yang mengembalikan semuanya', () => {
    s().addClip('v1', makeClip('c1'));
    const beforeGroup = s().past.length;

    s().beginGroup('Perintah AI');
    s().updateClip('c1', { speed: 2 });
    s().updateClip('c1', { volume: 0.25 });
    s().updateClip('c1', { muted: true });
    s().updateClip('c1', { filters: { ...s().findClip('c1')!.clip.filters, brightness: 1.5, contrast: 1.2 } });
    s().updateClip('c1', { transform: { ...s().findClip('c1')!.clip.transform, rotate: 90, flipH: true } });
    s().endGroup();

    // Lima mutasi, tetapi hanya satu entri history tambahan.
    expect(s().past.length).toBe(beforeGroup + 1);

    const grouped = s().findClip('c1')!.clip;
    expect(grouped.speed).toBe(2);
    expect(grouped.volume).toBe(0.25);
    expect(grouped.muted).toBe(true);
    expect(grouped.filters.brightness).toBe(1.5);
    expect(grouped.transform.rotate).toBe(90);
    expect(grouped.transform.flipH).toBe(true);

    s().undo();

    // Satu undo mengembalikan SELURUH grup ke keadaan sebelum beginGroup.
    const restored = s().findClip('c1')!.clip;
    expect(restored.speed).toBe(1);
    expect(restored.volume).toBe(1);
    expect(restored.muted).toBe(false);
    expect(restored.filters.brightness).toBe(1);
    expect(restored.filters.contrast).toBe(1);
    expect(restored.transform.rotate).toBe(0);
    expect(restored.transform.flipH).toBe(false);

    // Clip dari aksi sebelumnya tetap ada (undo grup tidak menghapusnya).
    expect(s().tracks[0].clips).toHaveLength(1);
    expect(s().canUndo()).toBe(true);
  });

  it('grup bersarang tetap menghasilkan satu entri undo', () => {
    s().addClip('v1', makeClip('c1'));
    const beforeGroup = s().past.length;

    s().beginGroup('Luar');
    s().updateClip('c1', { speed: 1.5 });
    s().beginGroup('Dalam');
    s().updateClip('c1', { volume: 0.5 });
    s().endGroup(); // menutup grup dalam
    s().updateClip('c1', { muted: true });
    s().endGroup(); // menutup grup luar

    expect(s().past.length).toBe(beforeGroup + 1);
    expect(s().groupDepth).toBe(0);

    s().undo();
    const restored = s().findClip('c1')!.clip;
    expect(restored.speed).toBe(1);
    expect(restored.volume).toBe(1);
    expect(restored.muted).toBe(false);
  });

  it('grup kosong tidak menambah entri history', () => {
    s().addClip('v1', makeClip('c1'));
    const before = s().past.length;

    s().beginGroup('Kosong');
    s().endGroup();

    expect(s().past.length).toBe(before);
    expect(s().canUndo()).toBe(true);
  });

  it('redo memulihkan seluruh hasil grup dalam satu langkah', () => {
    s().addClip('v1', makeClip('c1'));

    s().beginGroup('Perintah AI');
    s().updateClip('c1', { speed: 3 });
    s().updateClip('c1', { muted: true });
    s().endGroup();

    s().undo();
    expect(s().findClip('c1')!.clip.speed).toBe(1);

    s().redo();
    expect(s().findClip('c1')!.clip.speed).toBe(3);
    expect(s().findClip('c1')!.clip.muted).toBe(true);
  });

  it('mutasi setelah endGroup kembali menjadi entri terpisah', () => {
    s().addClip('v1', makeClip('c1'));
    const beforeGroup = s().past.length;

    s().beginGroup('Grup');
    s().updateClip('c1', { speed: 2 });
    s().endGroup();
    s().updateClip('c1', { speed: 3 });

    expect(s().past.length).toBe(beforeGroup + 2);

    s().undo(); // membatalkan aksi di luar grup
    expect(s().findClip('c1')!.clip.speed).toBe(2);

    s().undo(); // membatalkan grup
    expect(s().findClip('c1')!.clip.speed).toBe(1);
  });

  it('endGroup tanpa beginGroup adalah no-op yang aman', () => {
    s().addClip('v1', makeClip('c1'));
    const before = s().past.length;

    expect(() => s().endGroup()).not.toThrow();

    expect(s().groupDepth).toBe(0);
    expect(s().past.length).toBe(before);
  });

  it('pushHistory di dalam grup tidak menambah entri ganda', () => {
    s().addClip('v1', makeClip('c1'));
    const beforeGroup = s().past.length;

    s().beginGroup('Grup');
    s().pushHistory();
    s().updateClip('c1', { speed: 2 });
    s().pushHistory();
    s().endGroup();

    expect(s().past.length).toBe(beforeGroup + 1);
  });
});
