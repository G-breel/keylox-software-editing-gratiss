import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../../src/renderer/stores/editorStore';
import type { Clip, MediaItem } from '../../src/renderer/lib/types';

// ---------------------------------------------------------------------------
// Unit tests: editor store — undo / redo + core invariants
// Mirrors spec P-05 ("Undo / redo multi-level: >= 50 langkah, operasi AI = 1
// entri") and AC-4 (reversibilitas). MAX_HISTORY in the store is 60.
// ---------------------------------------------------------------------------

const MAX_HISTORY = 60;

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

function makeMedia(id: string, path: string): MediaItem {
  return { id, name: path.split('/').pop() || id, path };
}

const s = () => useEditorStore.getState();

beforeEach(() => {
  s().initProject('Test Project');
});

describe('editorStore — initial state', () => {
  it('starts with two default tracks and an empty history', () => {
    expect(s().tracks).toHaveLength(2);
    expect(s().tracks[0].type).toBe('video');
    expect(s().tracks[1].type).toBe('audio');
    expect(s().media).toHaveLength(0);
    expect(s().past).toHaveLength(0);
    expect(s().future).toHaveLength(0);
    expect(s().canUndo()).toBe(false);
    expect(s().canRedo()).toBe(false);
  });
});

describe('editorStore — media', () => {
  it('adds media and dedupes by path', () => {
    s().addMedia([makeMedia('a', 'C:/v/x.mp4')]);
    s().addMedia([makeMedia('b', 'C:/v/x.mp4'), makeMedia('c', 'C:/v/y.mp4')]);
    expect(s().media.map((m) => m.path)).toEqual(['C:/v/x.mp4', 'C:/v/y.mp4']);
  });

  it('removeMedia deletes only the target item', () => {
    s().addMedia([makeMedia('a', 'C:/v/x.mp4'), makeMedia('b', 'C:/v/y.mp4')]);
    s().removeMedia('a');
    expect(s().media.map((m) => m.id)).toEqual(['b']);
  });
});

describe('editorStore — clips', () => {
  it('addClip, findClip and selectClip work together', () => {
    s().addClip('v1', makeClip('c1'));
    s().addClip('v1', makeClip('c2'));

    expect(s().tracks[0].clips).toHaveLength(2);
    const found = s().findClip('c2');
    expect(found).not.toBeNull();
    expect(found!.clip.id).toBe('c2');
    expect(found!.index).toBe(1);
    expect(found!.track.id).toBe('v1');

    s().selectClip('c2');
    expect(s().selectedClipId).toBe('c2');
    expect(s().getSelectedClip()!.id).toBe('c2');
  });

  it('removeClip drops the clip and clears the selection', () => {
    s().addClip('v1', makeClip('c1'));
    s().selectClip('c1');
    s().removeClip('c1');
    expect(s().tracks[0].clips).toHaveLength(0);
    expect(s().selectedClipId).toBeNull();
    expect(s().getSelectedClip()).toBeNull();
  });

  it('findClip returns null for unknown ids', () => {
    expect(s().findClip('nope')).toBeNull();
  });
});

describe('editorStore — undo / redo', () => {
  it('undoes a media add and redoes it', () => {
    s().addMedia([makeMedia('a', 'C:/v/x.mp4')]);
    expect(s().media).toHaveLength(1);
    expect(s().canUndo()).toBe(true);

    s().undo();
    expect(s().media).toHaveLength(0);
    expect(s().canRedo()).toBe(true);

    s().redo();
    expect(s().media).toHaveLength(1);
    expect(s().canRedo()).toBe(false);
  });

  it('restores the exact previous clip value on undo of updateClip', () => {
    s().addClip('v1', makeClip('c1'));
    s().updateClip('c1', { speed: 2, muted: true, start: 3 });

    expect(s().findClip('c1')!.clip.speed).toBe(2);

    s().undo();
    const afterUndo = s().findClip('c1')!.clip;
    expect(afterUndo.speed).toBe(1);
    expect(afterUndo.muted).toBe(false);
    expect(afterUndo.start).toBe(0);

    s().redo();
    expect(s().findClip('c1')!.clip.speed).toBe(2);
  });

  it('records exactly ONE history entry per mutating action', () => {
    const before = s().past.length;
    s().addMedia([makeMedia('a', 'C:/v/x.mp4')]);
    expect(s().past.length).toBe(before + 1);

    const before2 = s().past.length;
    s().addClip('v1', makeClip('c1'));
    expect(s().past.length).toBe(before2 + 1);

    const before3 = s().past.length;
    s().updateClip('c1', { speed: 3 });
    expect(s().past.length).toBe(before3 + 1);
  });

  it('a new action clears the redo (future) stack', () => {
    s().addMedia([makeMedia('a', 'C:/v/x.mp4')]);
    s().undo();
    expect(s().future).toHaveLength(1);

    s().addClip('v1', makeClip('c1'));
    expect(s().future).toHaveLength(0);
    expect(s().canRedo()).toBe(false);
  });

  it('undo is a safe no-op when history is empty', () => {
    const snapshot = JSON.stringify(s().tracks);
    expect(s().canUndo()).toBe(false);
    expect(() => s().undo()).not.toThrow();
    expect(JSON.stringify(s().tracks)).toBe(snapshot);
  });

  it('redo is a safe no-op when the future stack is empty', () => {
    expect(s().canRedo()).toBe(false);
    expect(() => s().redo()).not.toThrow();
    expect(s().media).toHaveLength(0);
  });

  it('caps the past stack at MAX_HISTORY (60) entries', () => {
    for (let i = 0; i < MAX_HISTORY + 10; i++) {
      s().addTrack('video', `t${i}`);
    }
    expect(s().past.length).toBe(MAX_HISTORY);
  });

  it('supports >= 50 sequential undo steps (P-05 floor)', () => {
    for (let i = 0; i < 50; i++) {
      s().addTrack('overlay', `o${i}`);
    }
    const tracksAfterAdds = s().tracks.length;
    for (let i = 0; i < 50; i++) s().undo();
    expect(s().tracks.length).toBe(tracksAfterAdds - 50);
    expect(s().tracks.length).toBe(2); // back to the two default tracks
  });

  it('initProject resets the history stacks', () => {
    s().addClip('v1', makeClip('c1'));
    expect(s().canUndo()).toBe(true);
    s().initProject('Fresh');
    expect(s().past).toHaveLength(0);
    expect(s().future).toHaveLength(0);
    expect(s().canUndo()).toBe(false);
  });

  it('undo/redo round-trips a transform patch without losing fields', () => {
    s().addClip('v1', makeClip('c1'));
    s().updateClip('c1', { transform: { rotate: 90, flipH: true, flipV: false, crop: null, scale: null, reverse: false } });
    s().undo();
    expect(s().findClip('c1')!.clip.transform.rotate).toBe(0);
    s().redo();
    expect(s().findClip('c1')!.clip.transform.rotate).toBe(90);
    expect(s().findClip('c1')!.clip.transform.flipH).toBe(true);
  });
});
