import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  ProjectState, MediaItem, Clip, Track, TrackType,
} from '../lib/types';
import {
  clampPps, duplicateClipAtEnd, nearestFreeStart, splitClipAt,
} from '../lib/timeline';

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
    lastExport: state.lastExport ?? null,
  }));
}

/**
 * Catat history SEBELUM mutasi diterapkan.
 *
 * - Di luar grup: satu entri per aksi (perilaku lama, diuji
 *   `editorStore.undo-redo.test.ts`).
 * - Di dalam grup (`beginGroup`..`endGroup`): hanya SATU entri untuk seluruh
 *   grup, memakai snapshot yang diambil saat `beginGroup` — 1 perintah AI =
 *   1 grup undo (api-contract v1.2 §4.3 butir 7, R6.1).
 */
function recordHistory(s: any): void {
  if (s.groupDepth > 0) {
    if (s.groupRecorded) return;
    s.past.push(s.groupSnapshot ?? snapshot(s as ProjectState));
    if (s.past.length > MAX_HISTORY) s.past.shift();
    s.future = [];
    s.groupRecorded = true;
    return;
  }
  s.past.push(snapshot(s as ProjectState));
  if (s.past.length > MAX_HISTORY) s.past.shift();
  s.future = [];
}

function nextTrackId(s: any, type: TrackType): string {
  let n = 1;
  let id = `${type[0]}${n}`;
  const used = new Set<string>(s.tracks.map((t: Track) => t.id));
  while (used.has(id)) {
    n += 1;
    id = `${type[0]}${n}`;
  }
  return id;
}

interface EditorStore extends ProjectState {
  // history
  past: ProjectState[];
  future: ProjectState[];
  /** Kedalaman grup undo (0 = tidak ada grup aktif). */
  groupDepth: number;
  /** Label grup aktif (mis. "Perintah AI"). */
  groupLabel: string | null;
  /** Snapshot keadaan sebelum grup dimulai (dipakai entri history pertama). */
  groupSnapshot: ProjectState | null;
  /** true bila entri history grup sudah ditulis. */
  groupRecorded: boolean;
  // UI timeline (tidak ikut snapshot/undo)
  pxPerSec: number;
  snapEnabled: boolean;
  // actions
  initProject: (name: string, aspectRatio?: string) => void;
  loadProject: (project: Partial<ProjectState>) => void;
  setProjectName: (name: string) => void;
  setLastExport: (settings: Record<string, unknown> | null) => void;
  addMedia: (items: MediaItem[]) => void;
  removeMedia: (id: string) => void;
  addTrack: (type: TrackType, name?: string) => void;
  removeTrack: (id: string) => void;
  updateTrack: (id: string, patch: Partial<Track>) => void;
  moveTrack: (id: string, direction: -1 | 1) => void;
  addClip: (trackId: string, clip: Clip) => void;
  updateClip: (clipId: string, patch: Partial<Clip>) => void;
  /** Pindah klip antar track + ubah posisi dalam satu aksi. */
  moveClip: (clipId: string, targetTrackId: string, start: number, end: number) => void;
  removeClip: (clipId: string) => void;
  duplicateClip: (clipId: string, newId: string) => void;
  splitClip: (clipId: string, atSec: number, rightId: string) => void;
  /** Relink media berdasarkan `mediaId` → path baru (1 entri undo). */
  relinkMedia: (pathsByMediaId: Record<string, string>) => void;
  selectClip: (clipId: string | null) => void;
  setPlayhead: (ms: number) => void;
  setPlaying: (v: boolean) => void;
  setZoom: (pps: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  toggleSnap: () => void;
  setSnapEnabled: (v: boolean) => void;
  pushHistory: () => void;
  /** Mulai grup undo. Semua mutasi sampai `endGroup` = satu entri history. */
  beginGroup: (label?: string) => void;
  /** Tutup grup undo. Grup bersarang hanya ditutup oleh `endGroup` terluar. */
  endGroup: () => void;
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
    lastExport: null,
    past: [],
    future: [],
    groupDepth: 0,
    groupLabel: null,
    groupSnapshot: null,
    groupRecorded: false,
    pxPerSec: 40,
    snapEnabled: true,

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
      s.isPlaying = false;
      s.lastExport = null;
      s.past = [];
      s.future = [];
      s.groupDepth = 0;
      s.groupLabel = null;
      s.groupSnapshot = null;
      s.groupRecorded = false;
    }),

    loadProject: (project) => set((s) => {
      const tracks = Array.isArray(project.tracks)
        ? JSON.parse(JSON.stringify(project.tracks))
        : s.tracks;
      s.name = typeof project.name === 'string' && project.name ? project.name : 'Untitled';
      s.aspectRatio = typeof project.aspectRatio === 'string' ? project.aspectRatio : '16:9';
      s.width = Number.isFinite(project.width) ? Number(project.width) : 1920;
      s.height = Number.isFinite(project.height) ? Number(project.height) : 1080;
      s.fps = Number.isFinite(project.fps) ? Number(project.fps) : 30;
      s.tracks = tracks;
      s.media = Array.isArray(project.media) ? JSON.parse(JSON.stringify(project.media)) : [];
      s.selectedClipId = typeof project.selectedClipId === 'string' ? project.selectedClipId : null;
      s.playhead = Number.isFinite(project.playhead) ? Math.max(0, Number(project.playhead)) : 0;
      s.isPlaying = false;
      s.lastExport = project.lastExport && typeof project.lastExport === 'object'
        ? JSON.parse(JSON.stringify(project.lastExport))
        : null;
      s.past = [];
      s.future = [];
      s.groupDepth = 0;
      s.groupLabel = null;
      s.groupSnapshot = null;
      s.groupRecorded = false;
    }),

    setProjectName: (name) => set((s) => { s.name = name; }),

    // Metadata export bukan bagian dari riwayat edit.
    setLastExport: (settings) => set((s) => { s.lastExport = settings; }),

    pushHistory: () => set((s) => {
      // Di dalam grup, entri grup sudah mewakili seluruh perubahan.
      if (s.groupDepth > 0) return;
      recordHistory(s);
    }),

    beginGroup: (label) => set((s) => {
      if (s.groupDepth === 0) {
        s.groupSnapshot = snapshot(s as any);
        s.groupRecorded = false;
        s.groupLabel = label || 'Perintah AI';
      }
      s.groupDepth += 1;
    }),

    endGroup: () => set((s) => {
      if (s.groupDepth === 0) return;
      s.groupDepth -= 1;
      if (s.groupDepth === 0) {
        s.groupSnapshot = null;
        s.groupRecorded = false;
        s.groupLabel = null;
      }
    }),

    addMedia: (items) => set((s) => {
      recordHistory(s);
      items.forEach((it) => {
        if (!s.media.find((m) => m.path === it.path)) s.media.push(it);
      });
    }),

    removeMedia: (id) => set((s) => {
      recordHistory(s);
      s.media = s.media.filter((m) => m.id !== id);
    }),

    addTrack: (type, name) => set((s) => {
      recordHistory(s);
      const id = nextTrackId(s, type);
      s.tracks.push({
        id,
        name: name || `${type} ${s.tracks.length + 1}`,
        type,
        clips: [],
        ...(type === 'audio' ? { muted: false } : { visible: true }),
        locked: false,
      });
    }),

    removeTrack: (id) => set((s) => {
      recordHistory(s);
      s.tracks = s.tracks.filter((t) => t.id !== id);
      const selected = s.tracks.flatMap((t) => t.clips).find((c) => c.id === s.selectedClipId);
      if (!selected) s.selectedClipId = null;
    }),

    updateTrack: (id, patch) => set((s) => {
      const track = s.tracks.find((t) => t.id === id);
      if (!track) return;
      recordHistory(s);
      Object.assign(track, patch);
    }),

    moveTrack: (id, direction) => set((s) => {
      const index = s.tracks.findIndex((t) => t.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= s.tracks.length) return;
      recordHistory(s);
      const [track] = s.tracks.splice(index, 1);
      s.tracks.splice(target, 0, track);
    }),

    addClip: (trackId, clip) => set((s) => {
      recordHistory(s);
      const t = s.tracks.find((tr) => tr.id === trackId);
      if (t) t.clips.push(clip);
    }),

    updateClip: (clipId, patch) => set((s) => {
      for (const t of s.tracks) {
        const c = t.clips.find((cl) => cl.id === clipId);
        if (c) {
          recordHistory(s);
          Object.assign(c, patch);
          return;
        }
      }
    }),

    moveClip: (clipId, targetTrackId, start, end) => set((s) => {
      const target = s.tracks.find((t) => t.id === targetTrackId);
      if (!target || target.locked) return;
      let source: Track | null = null;
      let found: Clip | null = null;
      for (const t of s.tracks) {
        const c = t.clips.find((cl) => cl.id === clipId);
        if (c) { source = t; found = c; break; }
      }
      if (!source || !found) return;
      recordHistory(s);
      const duration = Math.max(0, end - start);
      const startSafe = Math.max(0, start);
      const moved: Clip = { ...found, trackId: targetTrackId, start: startSafe, end: startSafe + duration };
      if (source.id !== targetTrackId) {
        source.clips = source.clips.filter((c) => c.id !== clipId);
      }
      target.clips = target.clips.filter((c) => c.id !== clipId);
      target.clips.push(moved);
    }),

    removeClip: (clipId) => set((s) => {
      let found = false;
      for (const t of s.tracks) {
        if (t.clips.some((cl) => cl.id === clipId)) found = true;
      }
      if (!found) return;
      recordHistory(s);
      for (const t of s.tracks) {
        t.clips = t.clips.filter((cl) => cl.id !== clipId);
      }
      if (s.selectedClipId === clipId) s.selectedClipId = null;
    }),

    duplicateClip: (clipId, newId) => set((s) => {
      for (const t of s.tracks) {
        const index = t.clips.findIndex((c) => c.id === clipId);
        if (index < 0) continue;
        const source = t.clips[index];
        recordHistory(s);
        const copy = duplicateClipAtEnd(source, newId);
        const others = t.clips
          .filter((c) => c.id !== source.id)
          .map((c) => ({ start: c.start, end: c.end }));
        const start = nearestFreeStart(others, copy.start, copy.end - copy.start);
        copy.start = start;
        copy.end = start + (source.end - source.start);
        copy.trackId = t.id;
        t.clips.push(copy);
        s.selectedClipId = newId;
        return;
      }
    }),

    splitClip: (clipId, atSec, rightId) => set((s) => {
      for (const t of s.tracks) {
        if (t.locked) continue;
        const index = t.clips.findIndex((c) => c.id === clipId);
        if (index < 0) continue;
        const source = t.clips[index];
        const parts = splitClipAt(source, atSec, rightId);
        if (!parts) return;
        recordHistory(s);
        t.clips[index] = parts[0];
        t.clips.push(parts[1]);
        s.selectedClipId = rightId;
        return;
      }
    }),

    relinkMedia: (pathsByMediaId) => set((s) => {
      const ids = Object.keys(pathsByMediaId);
      if (ids.length === 0) return;
      recordHistory(s);
      for (const item of s.media) {
        const next = pathsByMediaId[item.id];
        if (typeof next === 'string' && next) {
          item.path = next;
          item.name = next.split(/[\\/]/).pop() || item.name;
        }
      }
      for (const t of s.tracks) {
        for (const c of t.clips) {
          const next = pathsByMediaId[c.mediaId];
          if (typeof next === 'string' && next) c.path = next;
        }
      }
    }),

    selectClip: (clipId) => set((s) => { s.selectedClipId = clipId; }),

    setPlayhead: (ms) => set((s) => {
      s.playhead = Number.isFinite(ms) ? Math.max(0, ms) : 0;
    }),

    setPlaying: (v) => set((s) => { s.isPlaying = v; }),

    setZoom: (pps) => set((s) => { s.pxPerSec = clampPps(pps); }),
    zoomIn: () => set((s) => { s.pxPerSec = clampPps(s.pxPerSec * 1.25); }),
    zoomOut: () => set((s) => { s.pxPerSec = clampPps(s.pxPerSec / 1.25); }),
    toggleSnap: () => set((s) => { s.snapEnabled = !s.snapEnabled; }),
    setSnapEnabled: (v) => set((s) => { s.snapEnabled = v; }),

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
      s.lastExport = prev.lastExport ?? null;
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
      s.lastExport = next.lastExport ?? null;
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
