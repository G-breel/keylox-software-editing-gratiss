import React, { useEffect, useRef } from 'react';
import { keylox } from '../lib/ipc';

interface Props {
  path: string;
  inSec: number;
  outSec: number;
  width: number;
  height: number;
}

/**
 * Gambar waveform audio di dalam klip timeline.
 * - Ambil peaks via `ffmpeg:waveform` (main process, di-cache di sana).
 * - Hanya bagian in..out yang ditampilkan (bagian trim tidak).
 * - Ringan: satu request per (path), dibatalkan saat unmount.
 */
export const AudioWaveform: React.FC<Props> = ({ path, inSec, outSec, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peaksRef = useRef<number[] | null>(null);
  const durRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await keylox.ffmpeg.waveform(path);
        if (cancelled || !res || 'error' in res) return;
        peaksRef.current = res.peaks;
        durRef.current = res.durationMs / 1000;
        draw();
      } catch {
        /* diam; waveform opsional */
      }
    };
    const draw = () => {
      const canvas = canvasRef.current;
      const peaks = peaksRef.current;
      if (!canvas || !peaks || peaks.length === 0) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.floor(width * dpr));
      const h = Math.max(1, Math.floor(height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.clearRect(0, 0, w, h);
      const totalDur = durRef.current || 1;
      const startIdx = Math.max(0, Math.floor((inSec / totalDur) * peaks.length));
      const endIdx = Math.min(peaks.length, Math.ceil((outSec / totalDur) * peaks.length));
      const slice = peaks.slice(startIdx, Math.max(startIdx + 1, endIdx));
      if (slice.length === 0) return;
      const step = w / slice.length;
      const mid = h / 2;
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.55)';
      ctx.lineWidth = Math.max(1, dpr);
      ctx.beginPath();
      for (let i = 0; i < slice.length; i++) {
        const x = i * step;
        const amp = slice[i] * mid * 0.9;
        ctx.moveTo(x, mid - amp);
        ctx.lineTo(x, mid + amp);
      }
      ctx.stroke();
    };
    void load();
    return () => { cancelled = true; };
  }, [path, inSec, outSec, width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width, height }}
    />
  );
};