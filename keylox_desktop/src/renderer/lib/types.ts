export type TrackType = 'video' | 'overlay' | 'text' | 'audio';

export interface FilterState {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  blur: number;
  sharpen: number;
  grayscale: boolean;
  sepia: boolean;
}

export interface TransformState {
  rotate: number;
  flipH: boolean;
  flipV: boolean;
  crop: { x: number; y: number; w: number; h: number } | null;
  scale: { w: number; h: number } | null;
  reverse: boolean;
}

export interface TextOverlay {
  id: string;
  text: string;
  start: number;
  end: number;
  size: number;
  color: string;
  x: number;
  y: number;
}

export interface MediaItem {
  id: string;
  name: string;
  path: string;
  duration?: number;
}

export interface Clip {
  id: string;
  mediaId: string;
  name: string;
  path: string;
  trackId: string;
  start: number;
  end: number;
  /** Titik masuk di media sumber (detik). Default 0. */
  in?: number;
  /** Titik keluar di media sumber (detik). Default `in + (end - start)`. */
  out?: number;
  speed: number;
  volume: number;
  muted: boolean;
  filters: FilterState;
  transform: TransformState;
  textOverlays: TextOverlay[];
  fadeIn: number;
  fadeOut: number;
  removeAudio: boolean;
  chroma: boolean;
  chromaSim: number;
}

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  clips: Clip[];
  muted?: boolean;
  locked?: boolean;
  visible?: boolean;
}

export interface ProjectState {
  name: string;
  aspectRatio: string;
  width: number;
  height: number;
  fps: number;
  tracks: Track[];
  media: MediaItem[];
  selectedClipId: string | null;
  playhead: number;
  isPlaying: boolean;
  /** Pengaturan export terakhir (disimpan di manifest proyek). */
  lastExport?: Record<string, unknown> | null;
}

export const defaultFilters: FilterState = {
  brightness: 1, contrast: 1, saturation: 1, hue: 0, blur: 0, sharpen: 0, grayscale: false, sepia: false,
};

export const defaultTransform: TransformState = {
  rotate: 0, flipH: false, flipV: false, crop: null, scale: null, reverse: false,
};
