import type { Lab, PersonaRequest } from '@adam0white/lab-client';
import { expect, it, vi } from 'vitest';
import { queueInput, step } from '../src/sim/climb.ts';
import { newSeason } from '../src/sim/season.ts';
import { Continuity } from '../src/ui/continuity.ts';

function control(enabled = false) {
  let selected: string | null = null;
  const approved = new Set<string>();
  const lab = {
    setPersonaRecording: vi.fn((key: string | null) => {
      selected = key;
    }),
    allowPersonaRecording: vi.fn((allow: boolean) => {
      if (selected) {
        if (allow) approved.add(selected);
        else approved.delete(selected);
      }
    }),
    get personaRecordingAllowed() {
      return selected === null || approved.has(selected);
    },
    build: () => ({ c: 'control' }),
  };
  const requests: PersonaRequest[] = [];
  const shelf = {
    enabled,
    ready: Promise.resolve(true),
    setEnabled: vi.fn<(value: boolean) => void>(),
    request: async <T>(r: PersonaRequest): Promise<T> => {
      requests.push(r);
      if (r.action === 'recording') return { recordingEpoch: 'control-epoch' } as T;
      if (r.action === 'prepareBatch')
        return {
          expectedHeads: Object.fromEntries((r.castIds ?? []).map((id) => [id, null])),
          inputs: [],
          blocked: [],
        } as T;
      if (r.action === 'putBatch' || r.action === 'put') return {} as T;
      if (r.action === 'recordingBatch')
        return {
          sameEpoch: false,
          revisions: r.envelopes?.map((p) => p.revision) ?? [],
          recordingEpoch: 'control-epoch',
        } as T;
      throw new Error(`unexpected ${r.action}`);
    },
  };
  return { lab, shelf, requests, continuity: new Continuity(lab as unknown as Lab, shelf) };
}
it('title construction performs no claim; Begin preflights all five expected absences in one transaction', async () => {
  const { continuity, requests } = control(true);
  expect(requests).toEqual([]);
  const state = await continuity.fresh(8);
  expect(requests.map((r) => r.action)).toEqual(['prepareBatch', 'putBatch']);
  const prepare = requests[0];
  if (prepare?.action !== 'prepareBatch') throw new Error('prepare');
  expect(prepare.castIds).toHaveLength(5);
  expect(state.climb.people).toHaveLength(5);
});
it('local reload keeps pinned actors and performs no latest-shelf read; file saves retain nonownership', async () => {
  const { continuity, requests, lab } = control();
  const state = newSeason(42);
  await continuity.restoreOwnership(
    state,
    { runId: 'local-control', heads: [], sources: [], fileOrigin: true },
    true,
  );
  expect(requests).toEqual([]);
  expect(continuity.ownership().fileOrigin).toBe(true);
  await continuity.recording();
  expect(lab.allowPersonaRecording).toHaveBeenCalledWith(true);
  const saved = continuity.ownership();
  await continuity.restoreOwnership(state, saved);
  expect(continuity.fileOrigin).toBe(true);
  expect(requests).toEqual([]);
  await continuity.recording(true);
  expect(lab.allowPersonaRecording).toHaveBeenCalledWith(true);
  continuity.invalidate();
  lab.allowPersonaRecording.mockClear();
  await continuity.recording();
  expect(lab.allowPersonaRecording).toHaveBeenCalledWith(true);
});
it('a cancelled batch cannot install a late game', async () => {
  const { continuity, shelf } = control(true);
  const original = shelf.request;
  shelf.request = async <T>(request: PersonaRequest) => {
    const result = await original<T>(request);
    if (request.action === 'prepareBatch') continuity.invalidate();
    return result;
  };
  await expect(continuity.fresh(8)).rejects.toThrow('changed');
});

it('publishes a released actor without a recording permission service', async () => {
  const { continuity, requests } = control(true);
  const state = await continuity.fresh(13);
  queueInput(state.climb, { t: 'lead', dir: 'up' });
  while (!state.climb.over) step(state.climb);
  queueInput(state.climb, { t: 'release-person', to: 'oskar' });
  step(state.climb);
  continuity.invalidate();
  await continuity.checkpoint('hf.cast.oskar.rope');
  const put = requests.find((r) => r.action === 'put');
  expect(put).toBeDefined();
  expect(requests.some((r) => r.action === 'recording' || r.action === 'recordingBatch')).toBe(false);
  expect(put?.recordingEpoch).toBeUndefined();
  expect(continuity.sources).toHaveLength(1);
  expect(continuity.heads).toHaveLength(1);
});

it('recording-off Continue never depends on the shelf permission service', async () => {
  const { continuity, shelf, requests, lab } = control();
  const state = newSeason(42);
  await continuity.restoreOwnership(
    state,
    { runId: 'offline', heads: [], sources: [], fileOrigin: true },
    true,
  );
  Object.assign(lab, { telemetryOn: false });
  shelf.request = async () => {
    throw new Error('Shelf unavailable');
  };
  await expect(continuity.recording()).resolves.toBeUndefined();
  expect(requests).toEqual([]);
  expect(lab.allowPersonaRecording).toHaveBeenCalledWith(true);
  Object.assign(lab, { telemetryOn: true });
  shelf.enabled = true;
  continuity.heads = [{ castId: 'test', branchId: 'test', revision: 'test' } as never];
  await expect(continuity.recording(true)).resolves.toBeUndefined();
  expect(requests).toEqual([]);
  expect(lab.allowPersonaRecording).toHaveBeenCalledWith(true);
});

it('recording linkage survives permission-service failure', async () => {
  const { continuity, shelf, lab, requests } = control(true);
  await continuity.restoreOwnership(newSeason(42));
  continuity.heads = [
    { castId: 'hf.cast.oskar.rope', branchId: 'control', revision: 'a'.repeat(64) } as never,
  ];
  shelf.request = async <T>(r: PersonaRequest) =>
    ({ sameEpoch: true, revisions: r.envelopes?.map((p) => p.revision) ?? [], recordingEpoch: 'epoch' }) as T;
  await continuity.recording();
  expect(lab.personaRecordingAllowed).toBe(true);
  shelf.request = async () => {
    throw new Error('bridge unavailable');
  };
  await continuity.recording();
  expect(lab.personaRecordingAllowed).toBe(true);
  expect(requests).toEqual([]);
});

it('ordinary fresh seasons enable the public channel before transactional cast preparation', async () => {
  const { continuity, shelf, requests } = control(false);
  shelf.setEnabled.mockImplementation((value: boolean) => {
    shelf.enabled = value;
  });
  await continuity.fresh(8);
  expect(shelf.setEnabled).toHaveBeenCalledWith(true);
  expect(requests.map((r) => r.action)).toEqual(['prepareBatch', 'putBatch']);
});
