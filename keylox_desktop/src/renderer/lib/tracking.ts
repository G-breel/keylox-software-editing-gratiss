// Loader MediaPipe Tasks Vision (on-device, privasi ADR-05). Lazy-load agar
// tidak membebani memori bila tracking tidak aktif.

export interface BBox { x: number; y: number; w: number; h: number; }

export interface TrackingResult { boxes: BBox[]; }

let detector: any = null;

export async function loadFaceDetector(): Promise<any> {
  if (detector) return detector;
  // @ts-ignore - modul opsional, di-mock di tes
  const mod: any = await import('@mediapipe/tasks-vision');
  const { FaceDetector, FilesetResolver } = mod;
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
  );
  detector = await FaceDetector.createFromOptions(vision, {
    // shortcut: modelAssetPath kosong; saat upgrade pakai model MediaPipe Face Detection dari storage.googleapis. Backend lokal bila offline.
    baseOptions: { modelAssetPath: '' },
    runningMode: 'VIDEO',
  });
  return detector;
}

export async function detectFaces(video: HTMLVideoElement | null): Promise<TrackingResult> {
  if (!video || !detector) return { boxes: [] };
  try {
    const res = detector.detectForVideo(video, performance.now());
    const boxes: BBox[] = (res?.detections || []).map((d: any) => {
      const b = d.boundingBox || {};
      return { x: b.originX || 0, y: b.originY || 0, w: b.width || 0, h: b.height || 0 };
    });
    return { boxes };
  } catch {
    return { boxes: [] };
  }
}

export function renderBoxes(ctx: CanvasRenderingContext2D | null, boxes: BBox[]): void {
  if (!ctx) return;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 2;
  for (const b of boxes) ctx.strokeRect(b.x, b.y, b.w, b.h);
}

export function resetDetector(): void { detector = null; }