import React, { useState, useEffect } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { api } from '../lib/ipc';
import { mapClipsToPipeline } from '../lib/exportMapping';

export const ExportDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const store = useEditorStore();
  const clip = store.getSelectedClip() || store.tracks.flatMap(t=>t.clips)[0];
  const [format, setFormat] = useState('mp4');
  const [resolutionSel, setResolutionSel] = useState('original');
  const [fps, setFps] = useState('original');
  const [bitrate, setBitrate] = useState(2000);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');
  const [wholeTimeline, setWholeTimeline] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProgress(0);
    setRunning(false);
    setStatus('');
    // Pulihkan pengaturan export terakhir dari manifest proyek (bila ada).
    const last = useEditorStore.getState().lastExport as Record<string, unknown> | null;
    if (last) {
      if (typeof last.format === 'string') setFormat(last.format);
      if (typeof last.resolution === 'string') setResolutionSel(last.resolution);
      if (last.fps !== undefined && last.fps !== null) setFps(String(last.fps));
      const bitrateValue = Number(last.bitrate);
      if (Number.isFinite(bitrateValue) && bitrateValue > 0) setBitrate(bitrateValue);
    }
  }, [open]);

  useEffect(() => {
    const off = api.onProgress((v) => setProgress(Math.min(100, v)));
    return () => { if (typeof off === 'function') off(); };
  }, []);

  const buildVF = () => {
    if (!clip) return 'null';
    const parts: string[] = [];
    const t = clip.transform;
    if (t.crop && t.crop.w > 0 && t.crop.h > 0) parts.push(`crop=${t.crop.w}:${t.crop.h}:${t.crop.x}:${t.crop.y}`);
    if (t.scale && t.scale.w > 0 && t.scale.h > 0) parts.push(`scale=${t.scale.w}:${t.scale.h}`);
    if (t.rotate === 90) parts.push('transpose=1');
    else if (t.rotate === 270) parts.push('transpose=2');
    else if (t.rotate === 180) parts.push('hflip,vflip');
    if (t.flipH) parts.push('hflip');
    if (t.flipV) parts.push('vflip');
    const f = clip.filters;
    if (f.brightness !== 1 || f.contrast !== 1 || f.saturation !== 1 || f.hue !== 0)
      parts.push(`eq=brightness=${f.brightness - 1}:contrast=${f.contrast}:saturation=${f.saturation},hue=h=${f.hue}`);
    if (f.blur > 0) parts.push(`boxblur=${f.blur}:${f.blur}`);
    if (f.sharpen > 0) parts.push(`unsharp=5:5:${f.sharpen}`);
    if (f.grayscale) parts.push('format=gray');
    if (f.sepia) parts.push('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131');
    if (clip.chroma) parts.push(`chromakey=0x00ff00:${clip.chromaSim}:0.1`);
    clip.textOverlays.forEach((o) => parts.push(`drawtext=text='${o.text.replace(/'/g, "\\'")}':fontsize=${o.size}:fontcolor=${o.color}:x=(w*${o.x}/100-text_w/2):y=(h*${o.y}/100-text_h/2):enable='between(t,${o.start},${o.end})'`));
    if (parts.length === 0) parts.push('null');
    return parts.join(',');
  };

  const handleExport = async () => {
    const outPath = await api.saveFile(wholeTimeline ? 'timeline.mp4' : ('edited.' + format));
    if (!outPath) return;
    store.setLastExport({ format, resolution: resolutionSel, fps, bitrate });
    setRunning(true);
    setStatus('Processing...');

    if (wholeTimeline) {
      const timelineClips = (store.tracks?.[0]?.clips || []).slice().sort((a, b) => a.start - b.start);
      const mapped = mapClipsToPipeline(timelineClips);
      const lutByClip = new Map(timelineClips.map((c) => [`${c.path}|${Math.round((c.start ?? 0) * 1000)}`, c.lut || null]));
      mapped.forEach((m) => { (m as { lut?: string | null }).lut = lutByClip.get(`${m.path}|${m.startMs}`) ?? null; });
      if (mapped.length === 0) {
        setRunning(false);
        setStatus('Tidak ada klip di timeline.');
        return;
      }
      const res = await api.exportTimeline({
        clips: mapped,
        outputPath: outPath,
        preset: {
          id: 'youtube-1080p',
          fps: fps === 'original' ? undefined : +fps,
        },
        hasAudio: true,
      });
      setRunning(false);
      if (res.success) { setStatus('Export selesai.'); api.openInFolder(res.path!); }
      else { setStatus('Export error: ' + res.error); }
      return;
    }

    if (!clip) { setRunning(false); setStatus('Pilih klip dulu.'); return; }
    const vf = buildVF();
    const af: string[] = [];
    if (clip.volume !== 1) af.push(`volume=${clip.volume}`);
    if (clip.fadeIn > 0) af.push(`afade=t=in:st=0:d=${clip.fadeIn}`);
    if (clip.fadeOut > 0) af.push(`afade=t=out:st=${(clip.end - clip.start) - clip.fadeOut}:d=${clip.fadeOut}`);
    const res = await api.exportVideo({
      inputPath: clip.path,
      outputPath: outPath,
      vf,
      af: af.join(','),
      trimStart: clip.start,
      trimEnd: clip.end,
      speed: clip.speed,
      removeAudio: clip.removeAudio,
      lut: clip.lut || null,
      resolution: resolutionSel,
      fps: fps,
      bitrate: bitrate,
    });
    setRunning(false);
    if (res.success) { setStatus('Export selesai.'); api.openInFolder(res.path!); }
    else { setStatus('Export error: ' + res.error); }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40" onClick={onClose}>
      <div className="bg-panel rounded-lg border border-border p-5 w-[520px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Export</h2>
          <button className="text-textMuted" onClick={onClose}>Tutup</button>
        </div>
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex gap-2">
            <label className="text-xs text-textMuted w-20">Format</label>
            <select value={format} onChange={(e) => setFormat(e.target.value)} className="flex-1">
              <option value="mp4">MP4</option>
              <option value="webm">WebM</option>
              <option value="mov">MOV</option>
            </select>
          </div>
          <div className="flex gap-2">
            <label className="text-xs text-textMuted w-20">Res</label>
            <select value={resolutionSel} onChange={(e) => setResolutionSel(e.target.value)} className="flex-1">
              <option value="original">Original</option>
              <option value="1080">1080p</option>
              <option value="720">720p</option>
              <option value="480">480p</option>
            </select>
          </div>
          <div className="flex gap-2">
            <label className="text-xs text-textMuted w-20">FPS</label>
            <select value={fps} onChange={(e) => setFps(e.target.value)} className="flex-1">
              <option value="original">Original</option>
              <option value="24">24</option>
              <option value="30">30</option>
              <option value="60">60</option>
            </select>
          </div>
          <div className="flex gap-2">
            <label className="text-xs text-textMuted w-20">Bitrate</label>
            <input type="number" value={bitrate} onChange={(e) => setBitrate(+e.target.value)} className="flex-1" />
            <span className="text-xs text-textMuted">kbps</span>
          </div>
          {running && (
            <div>
              <div className="h-2 bg-border rounded overflow-hidden">
                <div className="h-full bg-active transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="text-xs text-textMuted mt-1">{progress.toFixed(0)}%</div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input type="checkbox" id="wholeTimeline" checked={wholeTimeline} onChange={(e) => setWholeTimeline(e.target.checked)} />
            <label htmlFor="wholeTimeline" className="text-xs text-textMuted">🎥 Seluruh timeline (multi-clip)</label>
          </div>
          {status && <div className="text-xs text-textMuted">{status}</div>}
          <div className="flex justify-end gap-2 mt-2">
            <button className="px-3 py-1.5 bg-elevated text-xs rounded" onClick={onClose} disabled={running}>Cancel</button>
            <button className="px-3 py-1.5 bg-active text-white text-xs rounded font-semibold" onClick={handleExport} disabled={running || (!wholeTimeline && !clip)}>
              Export
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
