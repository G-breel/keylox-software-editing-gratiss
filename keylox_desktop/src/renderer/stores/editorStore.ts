import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  ProjectState, MediaItem, Clip, Track, TrackType,
  defaultFilters, defaultTransform, TextOverlay,
} from '../lib/types';

const MAX_HISTORY = 60;

function snapshot(state: ProjectState): ProjectState {
  return JSON.parse(JSON.stringify({
    name: state.name,
    aspectRatio: state.aspectRatio,
    width: state.width,
    height: state.height,
    fps: state.fps,
    tracks: state.tracks,
    media: state.media,
    selectedClipId: state.selectedClipId,
    playhead: state.playhead,
    isPlaying: false,
  }));
}

interface EditorStore extends ProjectState {
  // history
  past: ProjectState[];
  future: ProjectState[];
  // actions
  initProject: (name: string, aspectRatio?: string) => void;
  addMedia: (items: MediaItem[]) => void;
  removeMedia: (id: string) => void;
  addTrack: (type: TrackType, name?: string) => void;
  removeTrack: (id: string) => void;
  addClip: (trackId: string, clip: Clip) => void;
  updateClip: (clipId: string, patch: Partial<Clip>) => void;
  removeClip: (clipId: string) => void;
  selectClip: (clipId: string | null) => void;
  setPlayhead: (ms: number) => void;
  setPlaying: (v: boolean) => void;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  getSelectedClip: () => Clip | null;
  findClip: (id: string) => { track: Track; clip: Clip; index: number } | null;
}

export const useEditorStore = create<EditorStore>()(
  immer((set, get) => ({
    name: 'Untitled',
    aspectRatio: '16:9',
    width: 1920,
    height: 1080,
    fps: 30,
    tracks: [
      { id: 'v1', name: 'Video 1', type: 'video', clips: [], visible: true, locked: false },
      { id: 'a1', name: 'Audio 1', type: 'audio', clips: [], muted: false, locked: false },
    ],
    media: [],
    selectedClipId: null,
    playhead: 0,
    isPlaying: false,
    past: [],
    future: [],

    initProject: (name, aspectRatio = '16:9') => set((s) => {
      s.name = name;
      s.aspectRatio = aspectRatio;
      s.tracks = [
        { id: 'v1', name: 'Video 1', type: 'video', clips: [], visible: true, locked: false },
        { id: 'a1', name: 'Audio 1', type: 'audio', clips: [], muted: false, locked: false },
      ];
      s.media = [];
      s.selectedClipId = null;
      s.playhead = 0;
      s.past = [];
      s.future = [];
    }),

    pushHistory: () => set((s) => {
      s.past.push(snapshot(s as any));
      if (s.past.length > MAX_HISTORY) s.past.shift();
      s.future = [];
    }),

    addMedia: (items) => set((s) => {
      s.past.push(snapshot(s as any)); if (s.past.length > MAX_HISTORY) s.past.shift(); s.future = [];
      items.forEach((it) => {
        if (!s.media.find((m) => m.path === it.path)) s.media.push(it);
      });
    }),

    removeMedia: (id) => set((s) => {
      s.past.push(snapshot(s as any)); if (s.past.length > MAX_HISTORY) s.past.shift(); s.future = [];
      s.media = s.media.filter((m) => m.id !== id);
    }),

    addTrack: (type, name) => set((s) => {
      s.past.push(snapshot(s as any)); if (s.past.length > MAX_HISTORY) s.past.shift(); s.future = [];
      const id = `${type[0]}${s.tracks.length + 1}`;
      s.tracks.push({ id, name: name || `${type} ${s.tracks.length + 1}`, type, clips: [] });
    }),

    removeTrack: (id) => set((s) => {
      s.past.push(snapshot(s as any)); if (s.past.length > MAX_HISTORY) s.past.shift(); s.future = [];
      s.tracks = s.tracks.filter((t) => t.id !== id);
    }),

    addClip: (trackId, clip) => set((s) => {
      s.past.push(snapshot(s as any)); if (s.past.length > MAX_HISTORY) s.past.shift(); s.future = [];
      const t = s.tracks.find((tr) => tr.id === trackId);
      if (t) t.clips.push(clip);
    }),

    updateClip: (clipId, patch) => set((s) => {
      // push history once per update call
      s.past.push(snapshot(s as any)); if (s.past.length > MAX_HISTORY) s.past.shift(); s.future = [];
      for (const t of s.tracks) {
        const c = t.clips.find((cl) => cl.id === clipId);
        if (c) {
          // push history once
          // (caller should pushHistory before; but ensure)
          Object.assign(c, patch);
          return;
        }
      }
    }),

    removeClip: (clipId) => set((s) => {
      s.past.push(snapshot(s as any)); if (s.past.length > MAX_HISTORY) s.past.shift(); s.future = [];
      for (const t of s.tracks) {
        t.clips = t.clips.filter((cl) => cl.id !== clipId);
      }
      if (s.selectedClipId === clipId) s.selectedClipId = null;
    }),

    selectClip: (clipId) => set((s) => { s.selectedClipId = clipId; }),

    setPlayhead: (ms) => set((s) => { s.playhead = ms; }),

    setPlaying: (v) => set((s) => { s.isPlaying = v; }),

    undo: () => set((s) => {
      const prev = s.past.pop();
      if (!prev) return;
      s.future.push(snapshot(s as any));
      // restore
      s.name = prev.name;
      s.aspectRatio = prev.aspectRatio;
      s.width = prev.width;
      s.height = prev.height;
      s.fps = prev.fps;
      s.tracks = prev.tracks;
      s.media = prev.media;
      s.selectedClipId = prev.selectedClipId;
      s.playhead = prev.playhead;
    }),

    redo: () => set((s) => {
      const next = s.future.pop();
      if (!next) return;
      s.past.push(snapshot(s as any));
      s.name = next.name;
      s.aspectRatio = next.aspectRatio;
      s.width = next.width;
      s.height = next.height;
      s.fps = next.fps;
      s.tracks = next.tracks;
      s.media = next.media;
      s.selectedClipId = next.selectedClipId;
      s.playhead = next.playhead;
    }),

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,

    getSelectedClip: () => {
      const s = get();
      for (const t of s.tracks) {
        const c = t.clips.find((cl) => cl.id === s.selectedClipId);
        if (c) return c;
      }
      return null;
    },

    findClip: (id) => {
      const s = get();
      for (const t of s.tracks) {
        const idx = t.clips.findIndex((cl) => cl.id === id);
        if (idx >= 0) return { track: t, clip: t.clips[idx], index: idx };
      }
      return null;
    },
  }))
);
