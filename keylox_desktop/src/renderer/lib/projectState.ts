import { ProjectState, Track, MediaItem, Clip } from './types';
import { MissingMedia, ProjectSnapshotLike } from './ipc';

/**
 * Snapshot proyek yang dikirim ke MAIN untuk disimpan sebagai manifest.
 * Sengaja hanya memuat data non-rahasia (tidak ada API key/setting provider).
 */
export function toProjectSnapshot(state: ProjectState): ProjectSnapshotLike {
  return {
    name: state.name,
    aspectRatio: state.aspectRatio,
    width: state.width,
    height: state.height,
    fps: state.fps,
    tracks: JSON.parse(JSON.stringify(state.tracks)),
    media: JSON.parse(JSON.stringify(state.media)),
    playhead: state.playhead,
    selectedClipId: state.selectedClipId,
    lastExport: state.lastExport ? JSON.parse(JSON.stringify(state.lastExport)) : null,
  };
}

/**
 * Relink media: `pathsByMediaId` memetakan id media ke path baru.
 * Mengembalikan proyek BARU (tidak memutasi input) agar mudah diuji.
 */
export function relinkProject(
  project: Pick<ProjectState, 'media' | 'tracks'>,
  pathsByMediaId: Record<string, string>,
): { media: MediaItem[]; tracks: Track[] } {
  const media = project.media.map((item) => {
    const next = pathsByMediaId[item.id];
    if (!next) return { ...item };
    return {
      ...item,
      path: next,
      name: next.split(/[\\/]/).pop() || item.name,
    };
  });
  const tracks = project.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      const next = pathsByMediaId[clip.mediaId];
      return next ? { ...clip, path: next } : { ...clip };
    }),
  }));
  return { media, tracks };
}

/** Media yang masih hilang setelah relink (id tanpa path baru). */
export function remainingMissing(
  missing: MissingMedia[],
  pathsByMediaId: Record<string, string>,
): MissingMedia[] {
  return missing.filter((item) => !pathsByMediaId[item.id]);
}

/** Nama berkas pendek untuk indikator proyek di TopBar. */
export function projectFileName(filePath: string | null): string {
  if (!filePath) return 'Belum disimpan';
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || filePath;
}

/** Salin klip dengan id baru untuk drop/duplikat di timeline. */
export function cloneClipWithId(clip: Clip, id: string): Clip {
  return { ...JSON.parse(JSON.stringify(clip)), id };
}
