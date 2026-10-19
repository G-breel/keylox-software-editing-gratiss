import React, { useRef, useState } from 'react';

interface Point {
  x: number;
  y: number;
}

/**
 * Kerangka panel tracking (R7.3 test-id contract).
 *
 * Modul tracking M14 (detector → track store → binding → cache) belum ada di
 * renderer ini. Panel ini TIDAK berpura-pura melakukan tracking: statusnya
 * jujur "belum terlacak" dan tidak ada panggilan AI/backend. Test-id tetap
 * diekspos agar wiring UI bisa diuji begitu modul M14 tersedia.
 */
export const TrackingPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [point, setPoint] = useState<Point>({ x: 50, y: 50 });
  const [corrected, setCorrected] = useState(false);
  const [binding, setBinding] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [playing, setPlaying] = useState(false);

  const movePoint = (clientX: number, clientY: number) => {
    const el = canvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));
    setPoint({ x, y });
    setCorrected(true);
  };

  return (
    <section
      role="dialog"
      aria-label="Editor tracking"
      className="absolute right-3 top-3 z-30 w-[300px] rounded-lg border border-border bg-panel p-3 text-xs"
    >
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-textPrimary">Editor Tracking</h2>
        <button
          type="button"
          className="rounded bg-elevated px-2 py-1 text-[11px] transition-colors duration-150 ease-out hover:bg-border"
          onClick={onClose}
        >
          Tutup
        </button>
      </header>

      <p className="mb-2 text-[11px] text-textMuted">
        Modul tracking (M14) belum tersedia di build ini. Panel hanya kerangka uji;
        tidak ada data yang dikirim ke provider.
      </p>

      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          className="rounded bg-elevated px-2 py-1 text-[11px] transition-colors duration-150 ease-out hover:bg-border"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          Tempelkan
        </button>
        {menuOpen && (
          <div role="menu" aria-label="Target tracking" className="rounded border border-border bg-elevated p-1">
            <button
              type="button"
              role="menuitem"
              className="block w-full rounded px-2 py-1 text-left text-[11px] transition-colors duration-150 ease-out hover:bg-border"
              onClick={() => { setBinding('Person (orang)'); setMenuOpen(false); }}
            >
              Person (orang)
            </button>
          </div>
        )}
      </div>

      <div
        data-testid="binding-target"
        className="mb-2 rounded border border-border bg-elevated px-2 py-1 text-[11px] text-textMuted"
      >
        {binding ? `Target: ${binding}` : 'Target: belum ada binding'}
      </div>

      <div
        ref={canvasRef}
        data-testid="tracking-canvas"
        className="relative mb-2 h-40 overflow-hidden rounded border border-border bg-black"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); movePoint(e.clientX, e.clientY); }}
        onPointerMove={(e) => { if (e.buttons === 1) movePoint(e.clientX, e.clientY); }}
      >
        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-textMuted">
          Pratinjau tracking belum tersedia
        </span>
        <button
          type="button"
          data-testid="tracking-point"
          draggable
          aria-label="Titik tracking"
          className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-active bg-active/40"
          style={{ left: `${point.x}%`, top: `${point.y}%` }}
          onDragStart={() => setCorrected(true)}
          onDragEnd={() => setCorrected(true)}
        />
      </div>

      <div className="flex items-center gap-2">
        <span data-testid="tracking-status" className="flex-1 text-[11px] text-textMuted">
          {playing
            ? 'Pratinjau diputar — tracking tidak aktif, modul M14 belum tersedia'
            : 'Tidak aktif — modul M14 belum tersedia'}
        </span>
        <button
          type="button"
          className="rounded bg-elevated px-2 py-1 text-[11px] transition-colors duration-150 ease-out hover:bg-border"
          onClick={() => setPlaying((v) => !v)}
        >
          {playing ? 'Jeda' : 'Putar'}
        </button>
      </div>

      {corrected && (
        <span
          data-testid="tracking-correction-badge"
          className="mt-2 inline-block rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning"
        >
          Koreksi manual
        </span>
      )}
    </section>
  );
};
