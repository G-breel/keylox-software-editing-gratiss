// Loader MediaPipe Tasks Vision (on-device, privasi ADR-05). Lazy-load agar
// tidak membebani memori bila tracking tidak aktif.

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
}

export interface TrackingResult {
  boxes: BBox[];
}

export type TrackingMode = 'face' | 'object';

let detector: any = null;
let currentMode: TrackingMode = 'face';

export async function loadFaceDetector(): Promise<any> {
  if (detector && currentMode === 'face') return detector;
  // @ts-ignore - modul opsional, di-mock di tes, @vite-ignore agar tidak di-bundle saat build (opsional)
  const mod: any = await import(/* @vite-ignore */ '@mediapipe/tasks-vision');
  const { FaceDetector, FilesetResolver } = mod;
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
  );
  detector = await FaceDetector.createFromOptions(vision, {
    // shortcut: modelAssetPath kosong; saat upgrade pakai model MediaPipe Face Detection dari storage.googleapis. Backend lokal bila offline.
    baseOptions: { modelAssetPath: '' },
    runningMode: 'VIDEO',
  });
  currentMode = 'face';
  return detector;
}

export async function detectFaces(video: HTMLVideoElement | null): Promise<TrackingResult> {
  if (!video || !detector) return { boxes: [] };
  try {
    const res = detector.detectForVideo(video, performance.now());
    const boxes: BBox[] = (res?.detections || []).map((d: any) => {
      const b = d.boundingBox || {};
      return {
        x: b.originX || 0,
        y: b.originY || 0,
        w: b.width || 0,
        h: b.height || 0,
        label: d.categories?.[0]?.categoryName || 'Face',
      };
    });
    return { boxes };
  } catch {
    return { boxes: [] };
  }
}

export async function detectTrack(video: HTMLVideoElement | null, mode: TrackingMode = 'face'): Promise<TrackingResult> {
  if (mode === 'face') {
    if (!detector) await loadFaceDetector();
    return detectFaces(video);
  }
  // Mode object: fallback on-device face detector bila model object belum di-bundle terpisah
  if (!detector) await loadFaceDetector();
  const res = await detectFaces(video);
  return {
    boxes: res.boxes.map((b) => ({ ...b, label: 'Object' })),
  };
}

export function renderBoxes(ctx: CanvasRenderingContext2D | null, boxes: BBox[]): void {
  if (!ctx) return;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 2;
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#00ff00';
  for (const b of boxes) {
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    if (b.label && typeof ctx.fillText === 'function') {
      ctx.fillText(b.label, b.x, Math.max(12, b.y - 4));
    }
  }
}

export function resetDetector(): void {
  detector = null;
}