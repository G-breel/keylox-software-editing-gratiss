// applyEditPlan — terapkan EditPlan (ops add/update/delete) ke store editor.
//
// Murni & dapat diuji (tanpa Electron). Mendukung opType:
//   add / addClip / insertClip
//   update / updateClip
//   delete / deleteClip / remove / removeClip
// serta alias bentuk store (addClip(trackId, clip) maupun addClip(clip)).

import type { EditPlan, EditPlanOp } from './ipc';

type AnyStore = {
  addClip?: (trackIdOrClip: any, clip?: any) => void;
  updateClip?: (id: string, patch: any) => void;
  removeClip?: (id: string) => void;
  deleteClip?: (id: string) => void;
  tracks?: Array<{ id: string; clips?: any[] }>;
};

function params(op: EditPlanOp): Record<string, any> {
  return op && typeof op.params === 'object' && op.params !== null ? (op.params as Record<string, any>) : {};
}

function targetId(op: EditPlanOp, p: Record<string, any>): string | null {
  if (typeof p.id === 'string') return p.id;
  if (op.target && typeof op.target.id === 'string') return op.target.id;
  if (typeof p.clipId === 'string') return p.clipId;
  return null;
}

function firstTrackId(store: AnyStore): string {
  if (Array.isArray(store.tracks) && store.tracks.length > 0) return store.tracks[0].id;
  return 'v1';
}

export function applyEditPlan(plan: any, store: AnyStore): { applied: number; skipped: number } {
  let applied = 0;
  let skipped = 0;
  if (!plan || !Array.isArray(plan.ops)) return { applied, skipped };

  const ops = [...plan.ops].sort((a: any, b: any) => (Number(a?.order) || 0) - (Number(b?.order) || 0));

  for (const op of ops) {
    if (!op || typeof op.opType !== 'string') { skipped++; continue; }
    const type = op.opType;
    const p = params(op);

    const isAdd = type === 'add' || type === 'addClip' || type === 'insertClip' || type === 'insert';
    const isUpdate = type === 'update' || type === 'updateClip';
    const isDelete = type === 'delete' || type === 'deleteClip' || type === 'remove' || type === 'removeClip';

    if (isAdd) {
      const clip = p.clip ?? p;
      const trackId = typeof p.trackId === 'string' ? p.trackId : (typeof p.track === 'string' ? p.track : firstTrackId(store));
      if (typeof store.addClip === 'function') {
        try {
          if (store.addClip.length >= 2) store.addClip(trackId, clip);
          else store.addClip(clip);
          applied++;
        } catch { skipped++; }
      } else { skipped++; }
      continue;
    }

    if (isUpdate) {
      const id = targetId(op, p);
      const patch = (p.patch && typeof p.patch === 'object') ? p.patch : p;
      // remove meta fields from patch if present
      const cleanPatch = { ...patch };
      delete cleanPatch.id; delete cleanPatch.trackId; delete cleanPatch.patch;
      if (id && typeof store.updateClip === 'function') {
        try { store.updateClip(id, cleanPatch); applied++; }
        catch { skipped++; }
      } else { skipped++; }
      continue;
    }

    if (isDelete) {
      const id = targetId(op, p);
      const fn = store.removeClip || store.deleteClip;
      if (id && typeof fn === 'function') {
        try { fn(id); applied++; }
        catch { skipped++; }
      } else { skipped++; }
      continue;
    }

    skipped++;
  }

  return { applied, skipped };
}