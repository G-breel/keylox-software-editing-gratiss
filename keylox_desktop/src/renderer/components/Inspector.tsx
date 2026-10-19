import React, { useState } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { defaultFilters, defaultTransform } from '../lib/types';

const TABS = ['Basic', 'Transform', 'Filter', 'Text', 'Audio'] as const;
type Tab = typeof TABS[number];

export const Inspector: React.FC<{ onExport: () => void }> = ({ onExport }) => {
  const store = useEditorStore();
  const clip = store.getSelectedClip();
  const [tab, setTab] = useState<Tab>('Basic');

  if (!clip) {
    return (
      <div className="w-[320px] shrink-0 bg-panel border-l border-border p-3 overflow-auto">
        <div className="text-sm text-textMuted">Pilih klip/teks/efek untuk mengedit propertinya.</div>
        <div className="text-xs text-textMuted mt-2">
          Shortcut: Space play, J/K/L shuttle, I/O in-out, Ctrl+Z/Y undo/redo, Ctrl+S simpan.
        </div>
      </div>
    );
  }

  const update = (patch: any) => {
    store.updateClip(clip.id, patch);
  };

  return (
    <div className="w-[320px] shrink-0 bg-panel border-l border-border flex flex-col overflow-hidden">
      <div className="p-2 border-b border-border">
        <div className="text-sm font-semibold truncate">{clip.name}</div>
      </div>
      <div className="flex gap-1 p-2 border-b border-border flex-wrap">
        {TABS.map((t) => (
          <button
            key={t}
            className={`px-2 py-1 text-xs rounded ${tab === t ? 'bg-active text-white' : 'bg-elevated text-textMuted'}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-3 text-sm">
        {tab === 'Basic' && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2 items-center">
              <label className="text-xs text-textMuted w-16">Start(s)</label>
              <input type="number" step="0.1" value={clip.start} onChange={(e) => update({ start: +e.target.value })} className="w-20" />
              <label className="text-xs text-textMuted w-16">End(s)</label>
              <input type="number" step="0.1" value={clip.end} onChange={(e) => update({ end: +e.target.value })} className="w-20" />
            </div>
            <div className="flex gap-2 items-center">
              <label className="text-xs text-textMuted w-16">Speed</label>
              <input type="number" step="0.25" value={clip.speed} onChange={(e) => update({ speed: +e.target.value })} className="w-20" />
              <label className="text-xs text-textMuted w-16">Volume</label>
              <input type="range" min="0" max="2" step="0.1" value={clip.volume} onChange={(e) => update({ volume: +e.target.value })} className="w-24" />
              <span className="text-xs">{clip.volume.toFixed(1)}</span>
            </div>
            <button className="px-2 py-1 bg-elevated text-xs rounded w-fit" onClick={() => update({ muted: !clip.muted })}>
              {clip.muted ? 'Unmute' : 'Mute'}
            </button>
          </div>
        )}
        {tab === 'Transform' && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button className="px-2 py-1 bg-elevated text-xs rounded" onClick={() => update({ transform: { ...clip.transform, rotate: (clip.transform.rotate + 90) % 360 } })}>90°</button>
              <button className="px-2 py-1 bg-elevated text-xs rounded" onClick={() => update({ transform: { ...clip.transform, rotate: (clip.transform.rotate + 180) % 360 } })}>180°</button>
              <button className="px-2 py-1 bg-elevated text-xs rounded" onClick={() => update({ transform: { ...clip.transform, flipH: !clip.transform.flipH } })}>Flip H</button>
              <button className="px-2 py-1 bg-elevated text-xs rounded" onClick={() => update({ transform: { ...clip.transform, flipV: !clip.transform.flipV } })}>Flip V</button>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <label className="text-xs text-textMuted">Crop</label>
              {['x','y','w','h'].map((k) => (
                <input
                  key={k}
                  type="number"
                  placeholder={k}
                  value={clip.transform.crop?.[k as 'x'] ?? 0}
                  onChange={(e) => {
                    const c = clip.transform.crop || { x: 0, y: 0, w: 0, h: 0 };
                    update({ transform: { ...clip.transform, crop: { ...c, [k]: +e.target.value } } });
                  }}
                  className="w-14"
                />
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={clip.transform.reverse} onChange={(e) => update({ transform: { ...clip.transform, reverse: e.target.checked } })} />
              Reverse
            </label>
          </div>
        )}
        {tab === 'Filter' && (
          <div className="flex flex-col gap-2">
            {(['brightness','contrast','saturation'] as const).map((k) => (
              <div key={k} className="flex items-center gap-2">
                <label className="text-xs text-textMuted w-20 capitalize">{k}</label>
                <input type="range" min="0" max="3" step="0.1" value={clip.filters[k]} onChange={(e) => update({ filters: { ...clip.filters, [k]: +e.target.value } })} className="flex-1" />
                <span className="text-xs w-8">{clip.filters[k].toFixed(1)}</span>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <label className="text-xs text-textMuted w-20">Hue</label>
              <input type="range" min="-180" max="180" step="1" value={clip.filters.hue} onChange={(e) => update({ filters: { ...clip.filters, hue: +e.target.value } })} className="flex-1" />
              <span className="text-xs w-8">{clip.filters.hue}</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-textMuted w-20">Blur</label>
              <input type="range" min="0" max="10" step="0.5" value={clip.filters.blur} onChange={(e) => update({ filters: { ...clip.filters, blur: +e.target.value } })} className="flex-1" />
              <span className="text-xs w-8">{clip.filters.blur}</span>
            </div>
            <div className="flex gap-2 mt-1">
              <button className="px-2 py-1 bg-elevated text-xs rounded" onClick={() => update({ filters: { ...clip.filters, grayscale: true, saturation: 0 } })}>B&W</button>
              <button className="px-2 py-1 bg-elevated text-xs rounded" onClick={() => update({ filters: { ...clip.filters, sepia: true, saturation: 0.6 } })}>Sepia</button>
              <button className="px-2 py-1 bg-elevated text-xs rounded" onClick={() => update({ filters: { brightness: 1, contrast: 1, saturation: 1, hue: 0, blur: 0, sharpen: 0, grayscale: false, sepia: false } })}>Reset</button>
            </div>
            <label className="flex items-center gap-2 text-xs mt-1">
              <input type="checkbox" checked={clip.chroma} onChange={(e) => update({ chroma: e.target.checked })} />
              Chroma Key
            </label>
          </div>
        )}
        {tab === 'Text' && (
          <div className="flex flex-col gap-2">
            <button
              className="px-2 py-1 bg-elevated text-xs rounded w-fit"
              onClick={() => {
                const o = { id: crypto.randomUUID(), text: 'Teks', start: 0, end: 5, size: 24, color: '#ffffff', x: 50, y: 85 };
                update({ textOverlays: [...clip.textOverlays, o] });
              }}
            >
              + Tambah Teks
            </button>
            {clip.textOverlays.map((o) => (
              <div key={o.id} className="bg-elevated rounded p-2 flex flex-col gap-1">
                <input value={o.text} onChange={(e) => update({ textOverlays: clip.textOverlays.map((t) => (t.id === o.id ? { ...t, text: e.target.value } : t)) })} />
                <div className="flex gap-1">
                  <input type="number" value={o.start} onChange={(e) => update({ textOverlays: clip.textOverlays.map((t) => (t.id === o.id ? { ...t, start: +e.target.value } : t)) })} className="w-14" />
                  <input type="number" value={o.end} onChange={(e) => update({ textOverlays: clip.textOverlays.map((t) => (t.id === o.id ? { ...t, end: +e.target.value } : t)) })} className="w-14" />
                  <input type="number" value={o.size} onChange={(e) => update({ textOverlays: clip.textOverlays.map((t) => (t.id === o.id ? { ...t, size: +e.target.value } : t)) })} className="w-14" />
                  <input type="color" value={o.color} onChange={(e) => update({ textOverlays: clip.textOverlays.map((t) => (t.id === o.id ? { ...t, color: e.target.value } : t)) })} />
                  <button className="px-1 bg-danger text-white text-xs rounded" onClick={() => update({ textOverlays: clip.textOverlays.filter((t) => t.id !== o.id) })}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === 'Audio' && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2 items-center">
              <label className="text-xs text-textMuted w-16">Volume</label>
              <input type="range" min="0" max="2" step="0.05" value={clip.volume} onChange={(e) => update({ volume: +e.target.value })} className="flex-1" />
              <span className="text-xs w-10">{clip.volume.toFixed(2)}</span>
            </div>
            <div className="flex gap-2 items-center">
              <label className="text-xs text-textMuted w-16">Pan</label>
              <input type="range" min="-1" max="1" step="0.05" value={clip.pan ?? 0} onChange={(e) => update({ pan: +e.target.value })} className="flex-1" />
              <span className="text-xs w-10">{(clip.pan ?? 0).toFixed(2)}</span>
            </div>
            <button className={`px-2 py-1 text-xs rounded w-fit ${clip.muted ? 'bg-danger text-white' : 'bg-elevated'}`} onClick={() => update({ muted: !clip.muted })}>
              {clip.muted ? 'Unmute' : 'Mute'}
            </button>
            <div className="flex gap-2 items-center">
              <label className="text-xs text-textMuted w-16">Fade in</label>
              <input type="number" step="0.1" min="0" value={clip.fadeIn} onChange={(e) => update({ fadeIn: +e.target.value })} className="w-20" />
              <label className="text-xs text-textMuted w-16">Fade out</label>
              <input type="number" step="0.1" min="0" value={clip.fadeOut} onChange={(e) => update({ fadeOut: +e.target.value })} className="w-20" />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={clip.removeAudio} onChange={(e) => update({ removeAudio: e.target.checked })} />
              Remove audio on export
            </label>
          </div>
        )}
      </div>
      <div className="p-2 border-t border-border">
        <button className="px-2 py-1 bg-active text-white text-xs rounded" onClick={onExport}>Export</button>
      </div>
    </div>
  );
};
