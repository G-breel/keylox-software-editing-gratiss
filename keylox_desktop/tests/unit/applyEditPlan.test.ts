import { describe, it, expect } from 'vitest';
import { applyEditPlan } from '../../src/renderer/lib/applyEditPlan';

describe('applyEditPlan', () => {
  it('menerapkan 3 op (add/update/delete) ke store mock', () => {
    const added: any[] = [];
    const updated: any[] = [];
    const removed: string[] = [];
    const store: any = {
      tracks: [{ id: 'v1', clips: [] }],
      addClip: (trackIdOrClip: any, clip?: any) => {
        if (clip) added.push({ trackId: trackIdOrClip, clip });
        else added.push({ trackId: 'v1', clip: trackIdOrClip });
      },
      updateClip: (id: string, patch: any) => updated.push({ id, patch }),
      removeClip: (id: string) => removed.push(id),
    };
    const plan = {
      planId: 'p', commandId: 'c', planVersion: 1, diffSummary: 'd', ops: [
        { opId: '1', opType: 'add', target: { type: 'clip', id: 'x' }, params: { trackId: 'v1', clip: { id: 'c1', name: 'new' } }, order: 1 },
        { opId: '2', opType: 'update', target: { type: 'clip', id: 'c2' }, params: { id: 'c2', patch: { speed: 2 } }, order: 2 },
        { opId: '3', opType: 'delete', target: { type: 'clip', id: 'c3' }, params: { id: 'c3' }, order: 3 },
      ],
    };
    const r = applyEditPlan(plan, store);
    expect(r.applied).toBe(3);
    expect(added).toHaveLength(1);
    expect(updated[0]).toMatchObject({ id: 'c2', patch: { speed: 2 } });
    expect(removed).toEqual(['c3']);
  });

  it('menangani alias opType addClip/updateClip/deleteClip', () => {
    const store: any = {
      tracks: [{ id: 'v1', clips: [] }],
      addClip: () => {},
      updateClip: () => {},
      deleteClip: () => {},
    };
    const plan = { planId: 'p', commandId: 'c', planVersion: 1, diffSummary: 'd', ops: [
      { opId: '1', opType: 'addClip', target: { type: 'clip', id: 'a' }, params: { clip: { id: 'a' } }, order: 1 },
      { opId: '2', opType: 'updateClip', target: { type: 'clip', id: 'b' }, params: { id: 'b', speed: 1.5 }, order: 2 },
      { opId: '3', opType: 'deleteClip', target: { type: 'clip', id: 'c' }, params: { id: 'c' }, order: 3 },
    ] };
    const r = applyEditPlan(plan, store);
    expect(r.applied).toBe(3);
  });
});