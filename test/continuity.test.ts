import { acceptPersona, type Lab, type PersonaRequest, type PersonaShelfState } from '@adam0white/lab-client';
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
  let data: PersonaShelfState = { heads: {}, revisions: [] };
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
      if (r.action === 'put') {
        data = acceptPersona(data, r.envelope!, r.fork);
        return {} as T;
      }
      if (r.action === 'putBatch') return {} as T;
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

// Synthetic played sources through the real transfer adapter and SDK reducer, not a live transfer.
async function finishedControl() {
  const h = control(true);
  const state = await h.continuity.fresh(13);
  queueInput(state.climb, { t: 'lead', dir: 'up' });
  while (!state.climb.over) step(state.climb);
  queueInput(state.climb, { t: 'release-person', to: 'oskar' });
  step(state.climb);
  return { ...h, state };
}
it('refuses a complete next archive before put without discarding prior source or raw fields', async () => {
  const { continuity: c, state, requests, lab } = await finishedControl();
  await c.checkpoint('hf.cast.oskar.rope');
  const prior = c.sources[0]!;
  const extended = Object.assign(prior, { raw: '' });
  extended.raw = '界'.repeat(1_000_000 - JSON.stringify(c.sources).length);
  expect(JSON.stringify(c.sources).length).toBe(1_000_000);
  await c.restoreOwnership(state, c.ownership());
  const before = JSON.stringify(c.ownership());
  const world = JSON.stringify(state);
  const puts = requests.filter((r) => r.action === 'put').length;
  lab.setPersonaRecording.mockClear();
  await expect(c.checkpoint('hf.cast.oskar.rope')).rejects.toThrow(/archive|capacity/i);
  expect(JSON.stringify(c.ownership())).toBe(before);
  expect(JSON.stringify(state)).toBe(world);
  expect(requests.filter((r) => r.action === 'put')).toHaveLength(puts);
  expect(lab.setPersonaRecording).not.toHaveBeenCalled();
});
it('retains a complete failed CAS source when the full archive fits', async () => {
  const { continuity: c, shelf, state } = await finishedControl();
  await c.checkpoint('hf.cast.oskar.rope');
  const before = structuredClone(c.sources);
  const heads = structuredClone(c.heads);
  const world = JSON.stringify(state);
  const request = shelf.request;
  shelf.request = async <T>(r: PersonaRequest): Promise<T> => {
    if (r.action === 'put') throw new Error('synthetic CAS conflict');
    return request<T>(r);
  };
  await expect(c.checkpoint('hf.cast.oskar.rope')).rejects.toThrow('CAS conflict');
  expect(c.sources.slice(0, -1)).toEqual(before);
  expect(c.sources.at(-1)?.snapshot).toEqual(
    JSON.parse(JSON.stringify(state.climb.people.find((p) => p.id === 'oskar'))),
  );
  expect(c.heads).toEqual(heads);
  expect(JSON.stringify(state)).toBe(world);
});
it('cancelled batch rejection cannot publish remaining cast or change a successor', async () => {
  const { continuity: c, shelf, lab, requests } = await finishedControl();
  const changed = vi.fn();
  Object.assign(c, { changed });
  let rejectPut: (error: Error) => void = () => {};
  const started = Promise.withResolvers<void>();
  const request = shelf.request;
  shelf.request = async <T>(r: PersonaRequest): Promise<T> => {
    if (r.action !== 'put') return request<T>(r);
    requests.push(r);
    started.resolve();
    return new Promise<T>((_resolve, reject) => {
      rejectPut = reject;
    });
  };
  const pending = c.checkpointAll();
  await started.promise;
  c.clear();
  const successor = await c.fresh(42, true);
  c.status = 'successor status';
  const before = JSON.stringify(c.ownership());
  const world = JSON.stringify(successor);
  changed.mockClear();
  lab.setPersonaRecording.mockClear();
  rejectPut(new Error('old put failed'));
  await pending;
  expect(c.status).toBe('successor status');
  expect(JSON.stringify(c.ownership())).toBe(before);
  expect(JSON.stringify(successor)).toBe(world);
  expect(requests.filter((r) => r.action === 'put')).toHaveLength(1);
  expect(changed).not.toHaveBeenCalled();
  expect(lab.setPersonaRecording).not.toHaveBeenCalled();
});
it('cancelled death closure rejection cannot overwrite successor status', async () => {
  const { continuity: c, shelf, state } = await finishedControl();
  await c.checkpoint('hf.cast.oskar.rope');
  state.climb.people.find((p) => p.id === 'oskar')!.body.alive = false;
  const started = Promise.withResolvers<void>();
  let rejectPut: (error: Error) => void = () => {};
  shelf.request = async <T>(): Promise<T> => {
    started.resolve();
    return new Promise<T>((_resolve, reject) => {
      rejectPut = reject;
    });
  };
  c.closeDeaths();
  await started.promise;
  c.clear();
  await c.fresh(42, true);
  c.status = 'successor status';
  const before = JSON.stringify(c.ownership());
  rejectPut(new Error('old death failed'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(c.status).toBe('successor status');
  expect(JSON.stringify(c.ownership())).toBe(before);
});

it('a changed callback cancelling source staging prevents public put', async () => {
  const { continuity: c, requests } = await finishedControl();
  let armed = true;
  Object.assign(c, {
    changed: () => {
      if (armed) {
        armed = false;
        c.clear();
      }
    },
  });
  await expect(c.checkpoint('hf.cast.oskar.rope')).rejects.toThrow(/changed/);
  expect(requests.some((r) => r.action === 'put')).toBe(false);
  expect(c.sources).toEqual([]);
  expect(c.heads).toEqual([]);
});
