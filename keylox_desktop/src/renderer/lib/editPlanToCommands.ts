// EditPlan → perintah editor legacy (jalur renderer, murni & dapat diuji).
//
// Latar belakang: `ai:invoke` mengembalikan EditPlan SESUAI KONTRAK §3.3
// (`ops[].opType` + `params` + `timeRange`), sedangkan `applyCmd` di PromptBar
// berbicara bahasa internal lama (`{ a: 'trim', start, end }`, dst). Modul ini
// adalah satu-satunya jembatan antara keduanya.
//
// Prinsip (anti-fantasy, sama dengan 06-security §5.1): op yang TIDAK dapat
// dipetakan ke aksi editor yang benar-benar ada DILAPORKAN, bukan ditebak-tebak
// atau diam-diam di-drop.
//
// Tidak ada `fetch`, tidak ada key, tidak ada I/O: fungsi murni.

import type { EditPlan, EditPlanOp } from './ipc';
import type { ParsedCommand } from './aiParser';

export interface UnsupportedOp {
  opType: string;
  reason: string;
}

export interface PlanMappingResult {
  commands: ParsedCommand[];
  unsupported: UnsupportedOp[];
  /** true bila plan membawa op kelas D (harus sudah `requiresConfirm` dari main). */
  destructive: boolean;
}

const DESTRUCTIVE_OPS = new Set([
  'delete', 'split', 'trim', 'gapClose', 'detachAudio', 'speed', 'reverse', 'freeze',
  'audioReplace', 'silenceRemove', 'applyPlan', 'rejectPlan',
]);

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function msToSec(ms: number | null): number | null {
  return ms === null ? null : Math.round((ms / 1000) * 1000) / 1000;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function params(op: EditPlanOp): Record<string, unknown> {
  return op && typeof op.params === 'object' && op.params !== null ? op.params : {};
}

function range(op: EditPlanOp): { startMs: number | null; endMs: number | null } {
  const tr = op.timeRange;
  if (tr && typeof tr === 'object') {
    return { startMs: num(tr.startMs), endMs: num(tr.endMs) };
  }
  return { startMs: null, endMs: null };
}

/** Pemetaan satu op. Mengembalikan daftar perintah + alasan bila tidak dipetakan. */
function mapOp(op: EditPlanOp): { commands: ParsedCommand[]; unsupported: UnsupportedOp[] } {
  const p = params(op);
  const { startMs, endMs } = range(op);

  switch (op.opType) {
    case 'trim': {
      const inMs = num(p.inMs) ?? startMs;
      const outMs = num(p.outMs) ?? endMs;
      const start = msToSec(inMs);
      const end = msToSec(outMs);
      if (start === null && end === null) {
        return { commands: [], unsupported: [{ opType: 'trim', reason: 'params.inMs/outMs atau timeRange tidak ada' }] };
      }
      return { commands: [{ a: 'trim', start: start ?? 0, end }], unsupported: [] };
    }

    case 'speed': {
      const speed = num(p.speed);
      if (speed === null || speed <= 0) return { commands: [], unsupported: [{ opType: 'speed', reason: 'params.speed tidak valid' }] };
      return { commands: [{ a: 'speed', v: clamp(speed, 0.1, 100) }], unsupported: [] };
    }

    case 'rotate': {
      const degrees = num(p.degrees) ?? num(p.rotation);
      if (degrees === null) return { commands: [], unsupported: [{ opType: 'rotate', reason: 'params.degrees tidak ada' }] };
      return { commands: [{ a: 'rotate', deg: degrees }], unsupported: [] };
    }

    case 'flip': {
      const axis = typeof p.axis === 'string' ? p.axis : p.flipV === true ? 'vertical' : 'horizontal';
      return { commands: [{ a: axis === 'vertical' ? 'flipV' : 'flipH' }], unsupported: [] };
    }

    case 'crop': {
      const crop = p.crop && typeof p.crop === 'object' ? (p.crop as Record<string, unknown>) : p;
      const x = num(crop.x); const y = num(crop.y); const w = num(crop.w) ?? num(crop.width); const h = num(crop.h) ?? num(crop.height);
      if (x === null || y === null || w === null || h === null || w <= 0 || h <= 0) {
        return { commands: [], unsupported: [{ opType: 'crop', reason: 'butuh params.crop {x,y,w,h}' }] };
      }
      return { commands: [{ a: 'crop', x, y, w, h }], unsupported: [] };
    }

    case 'scalePosition': {
      const scale = p.scale && typeof p.scale === 'object' ? (p.scale as Record<string, unknown>) : p;
      const w = num(scale.w) ?? num(scale.width);
      const h = num(scale.h) ?? num(scale.height);
      if (w === null || h === null || w <= 0 || h <= 0) {
        return { commands: [], unsupported: [{ opType: 'scalePosition', reason: 'butuh params.scale {w,h}' }] };
      }
      return { commands: [{ a: 'scale', w, h }], unsupported: [] };
    }

    case 'reverse':
      return { commands: [{ a: 'reverse' }], unsupported: [] };

    case 'colorAdjust':
    case 'colorGrade': {
      const commands: ParsedCommand[] = [];
      for (const key of ['brightness', 'contrast', 'saturation'] as const) {
        const v = num(p[key]);
        if (v !== null) commands.push({ a: key, v: clamp(v, 0, 4) });
      }
      if (commands.length === 0) {
        return { commands: [], unsupported: [{ opType: op.opType, reason: 'tidak ada params brightness/contrast/saturation' }] };
      }
      return { commands, unsupported: [] };
    }

    case 'audioVolume': {
      const volume = num(p.volume);
      if (volume === null) return { commands: [], unsupported: [{ opType: 'audioVolume', reason: 'params.volume tidak ada' }] };
      return { commands: [{ a: 'volume', v: clamp(volume, 0, 2) }], unsupported: [] };
    }

    case 'audioMute':
      return { commands: [{ a: 'mute' }], unsupported: [] };

    case 'audioFade': {
      const fadeIn = num(p.fadeInMs);
      const fadeOut = num(p.fadeOutMs);
      if (fadeIn === null && fadeOut === null) {
        return { commands: [], unsupported: [{ opType: 'audioFade', reason: 'params.fadeInMs/fadeOutMs tidak ada' }] };
      }
      return { commands: [{ a: 'fade', in: msToSec(fadeIn) ?? 0, out: msToSec(fadeOut) ?? 0 }], unsupported: [] };
    }

    case 'textAdd':
    case 'captionGenerate': {
      const content = typeof p.content === 'string' ? p.content : typeof p.text === 'string' ? p.text : '';
      if (!content.trim()) {
        return { commands: [], unsupported: [{ opType: op.opType, reason: 'butuh params.content' }] };
      }
      return {
        commands: [{
          a: 'text',
          text: content,
          at: msToSec(num(p.startMs) ?? startMs) ?? 0,
          size: num(p.size) ?? undefined,
          color: typeof p.color === 'string' ? p.color : undefined,
        }],
        unsupported: [],
      };
    }

    default:
      return { commands: [], unsupported: [{ opType: op.opType, reason: 'belum ada padanan di editor legacy' }] };
  }
}

/**
 * Verifikasi ulang bentuk plan di renderer (AC-8 / §3.3 butir 2) — main sudah
 * memvalidasi dengan EditPlanOutputSchema, ini sabuk kedua sebelum menyentuh state.
 */
export function isEditPlanLike(value: unknown): value is EditPlan {
  if (!value || typeof value !== 'object') return false;
  const plan = value as Partial<EditPlan>;
  return (
    typeof plan.planId === 'string'
    && typeof plan.commandId === 'string'
    && typeof plan.planVersion === 'number'
    && typeof plan.diffSummary === 'string'
    && Array.isArray(plan.ops)
    && plan.ops.every((op) => Boolean(op) && typeof op.opType === 'string')
  );
}

/** Ubah EditPlan tervalidasi menjadi perintah editor + daftar op tak didukung. */
export function planToCommands(plan: unknown): PlanMappingResult {
  const empty: PlanMappingResult = { commands: [], unsupported: [], destructive: false };
  if (!isEditPlanLike(plan)) {
    return { ...empty, unsupported: [{ opType: '(plan)', reason: 'bentuk EditPlan tidak dikenali' }] };
  }

  const commands: ParsedCommand[] = [];
  const unsupported: UnsupportedOp[] = [];
  let destructive = plan.isDestructive === true;

  // Urutan eksekusi mengikuti `order` (§3.3), bukan urutan kedatangan.
  const ops = [...plan.ops].sort((a, b) => (num(a.order) ?? 0) - (num(b.order) ?? 0));

  for (const op of ops) {
    if (DESTRUCTIVE_OPS.has(op.opType)) destructive = true;
    const mapped = mapOp(op);
    commands.push(...mapped.commands);
    unsupported.push(...mapped.unsupported);
  }

  return { commands, unsupported, destructive };
}
