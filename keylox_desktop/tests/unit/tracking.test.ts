import { describe, it, expect, vi } from 'vitest';

// Mock MediaPipe module sebelum import tracking.
vi.mock('@mediapipe/tasks-vision', () => ({
  FaceDetector: { createFromOptions: async () => ({ detectForVideo: () => ({ detections: [{ boundingBox: { originX: 1, originY: 2, width: 3, height: 4 } }] }) }) },
  FilesetResolver: { forVisionTasks: async () => ({}) },
}));

describe('tracking', () => {
  it('render bounding-box untuk 1 frame dummy', async () => {
    const mod = await import('../../src/renderer/lib/tracking');
    await mod.loadFaceDetector();
    const res = await mod.detectFaces({} as any);
    expect(res.boxes).toHaveLength(1);
    const canvas = { width: 10, height: 10 } as any;
    const ctx: any = { canvas, clearRect: vi.fn(), strokeRect: vi.fn(), strokeStyle: '', lineWidth: 0 };
    mod.renderBoxes(ctx, res.boxes);
    expect(ctx.strokeRect).toHaveBeenCalled();
  });
});