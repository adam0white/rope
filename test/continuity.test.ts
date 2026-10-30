import { FRAMEWORK_VERSION } from '../src/sim/hf4.ts';

vi.mock('@adam0white/lab-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@adam0white/lab-client')>()),
  portableWriteBlockers: vi.fn(() => []),
}));

import {
  acceptPersona,
  acceptPersonaBatch,
  canonicalPersona,
  createPersona,
  type Lab,
  type PersonaRequest,
  type PersonaShelfState,
  portableWriteBlockers,
  preparePersonaLife,
} from '@adam0white/lab-client';
import { expect, it, vi } from 'vitest';
import { queueInput, step } from '../src/sim/climb.ts';
import { archiveOf } from '../src/sim/hf4.ts';
import { newSeason } from '../src/sim/season.ts';
import { Continuity } from '../src/ui/continuity.ts';

function control(enabled = false, seedData: PersonaShelfState = { heads: {}, revisions: [] }) {
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
  let data: PersonaShelfState = structuredClone(seedData);
  const shelf = {
    enabled,
    ready: Promise.resolve(true),
    setEnabled: vi.fn<(value: boolean) => void>(),
    request: async <T>(r: PersonaRequest): Promise<T> => {
      requests.push(r);
      if (r.action === 'get')
        return (data.revisions.find((p) => p.revision === data.heads[r.castId ?? '']) ?? null) as T;
      if (r.action === 'prepare') {
        const head = data.revisions.find((p) => p.revision === data.heads[r.castId ?? '']);
        return (head ? preparePersonaLife(head, 1800000000000) : null) as T;
      }
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
      if (r.action === 'putBatch') {
        data = acceptPersonaBatch(data, r.envelopes ?? [], r.expectedHeads);
        return {} as T;
      }
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
  expect(requests.map((r) => r.action)).toEqual(['get', 'get', 'get', 'get', 'get', 'putBatch']);
  const claims = requests.at(-1);
  expect(claims?.envelopes).toHaveLength(5);
  expect(claims?.expectedHeads).toEqual(
    Object.fromEntries(requests.slice(0, 5).map((r) => [r.castId, null])),
  );
  expect(claims?.envelopes?.every((p) => p.source.engine === FRAMEWORK_VERSION)).toBe(true);
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
    if (request.action === 'get') continuity.invalidate();
    return result;
  };
  await expect(continuity.fresh(8)).rejects.toThrow('changed');
});

it('publishes a released actor without a recording permission service', async () => {
  const { continuity, requests } = control(true);
  const { state } = await releasedControl(continuity);
  continuity.invalidate();
  await continuity.checkpoint('hf.cast.oskar.rope');
  const put = requests.find((r) => r.action === 'put');
  expect(put).toBeDefined();
  expect(requests.some((r) => r.action === 'recording' || r.action === 'recordingBatch')).toBe(false);
  expect(put?.recordingEpoch).toBeUndefined();
  expect(continuity.sources).toHaveLength(1);
  expect(continuity.heads).toHaveLength(5);
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
  await continuity.restoreOwnership(newSeason(42), {
    runId: 'local-control',
    heads: [],
    sources: [],
    fileOrigin: false,
    localOnly: true,
  });
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
  expect(requests.map((r) => r.action)).toEqual(['get', 'get', 'get', 'get', 'get', 'putBatch']);
});

// An authored closed-at-hut opening tests publication, not a completed ascent.
// Its release is still a real, costed HF choice with a retained place/voice episode.
async function releasedControl(continuity: Continuity) {
  const state = await continuity.fresh(7);
  state.climb.over = true;
  queueInput(state.climb, { t: 'release-person', to: 'oskar' });
  for (let i = 0; i < 12 && !state.climb.hfReleased.oskar; i++) step(state.climb);
  expect(state.climb.hfReleased.oskar).toBe(true);
  step(state.climb); // admit the actual next-ms agenda receipt
  return { state };
}
async function finishedControl() {
  const h = control(true);
  return { ...h, ...(await releasedControl(h.continuity)) };
}
it('refuses a complete next archive before put without discarding prior source or raw fields', async () => {
  const { continuity: c, state, requests, lab } = await finishedControl();
  await c.checkpoint('hf.cast.oskar.rope');
  // Exercise the same complete-source capacity guard with a deliberately small
  // local budget. No large allocation or source shortening is needed.
  Object.assign(c, { archiveLimit: JSON.stringify({ sources: c.sources, archives: c.archives }).length + 1 });
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
  const source = c.sources.at(-1)!;
  expect(c.archives.find((a) => a.sha256 === source.archiveSha256)?.raw).toBe(
    canonicalPersona(archiveOf(state.climb)),
  );
  expect(source.envelope.revision).toBe(source.revision);
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

it('automatically admits the same released v2 history before its next atomic claim', async () => {
  const { continuity: c, requests } = await finishedControl();
  await c.checkpoint('hf.cast.oskar.rope');
  const parent = c.heads.find((p) => p.castId === 'hf.cast.oskar.rope')!;
  const prior = structuredClone(parent);
  const target = await c.fresh(8);
  expect(target.season.chapter?.inputs).toEqual([prior]);
  expect(target.season.chapter?.claims).toHaveLength(1);
  expect(target.season.chapter?.claims[0]?.parentRevision).toBe(parent.revision);
  expect(target.climb.people.find((p) => p.id === 'oskar')).toBeDefined();
  expect(requests.at(-1)?.action).toBe('putBatch');
  expect(c.heads[0]?.transfer.portable).toEqual(parent.transfer.portable);
  expect(c.status).toContain('1 saved browser histories');
});

it('starts a fresh local role while preserving an unsupported profile-only shelf head', async () => {
  const source = await finishedControl();
  await source.continuity.checkpoint('hf.cast.oskar.rope');
  const head = source.continuity.heads.find((p) => p.castId === 'hf.cast.oskar.rope')!;
  const portable = head.transfer.portable as import('@adam0white/human-framework').PortablePerson;
  if (portable.version !== 2) throw Error('Expected retained source');
  // Synthetic well-formed profile-v1 schema fixture, not an old played journey.
  const { retained: _retained, ...profile } = portable;
  const { revision: _revision, ...body } = head;
  const legacy = await createPersona({
    ...body,
    parentRevision: null,
    transfer: {
      ...body.transfer,
      castPassport: 'hf-portable-person/1',
      portable: { ...profile, version: 1 },
    },
  });
  const {
    continuity: c,
    requests,
    shelf,
  } = control(true, { heads: { [legacy.castId]: legacy.revision }, revisions: [legacy] });
  const state = await c.fresh(8);
  expect(state.season.chapter).toBeUndefined();
  expect(c.heads).toHaveLength(4);
  expect(c.heads.some((p) => p.castId === legacy.castId)).toBe(false);
  expect(requests.at(-1)?.envelopes?.some((p) => p.castId === legacy.castId)).toBe(false);
  expect(await shelf.request({ action: 'get', castId: legacy.castId })).toEqual(legacy);
  expect(c.status).toContain('Some people could not join from other games');
});

it('blocks checkpoint before projection or shelf publication when peers are unsupported', async () => {
  const { continuity, requests } = control(true);
  await releasedControl(continuity);
  const before = requests.length;
  vi.mocked(portableWriteBlockers).mockReturnValueOnce(['commonstead']);
  await expect(continuity.checkpoint('hf.cast.oskar.rope')).rejects.toThrow(/cannot|support|available/i);
  expect(requests.slice(before).some((r) => r.action === 'put')).toBe(false);
});

it('preserves an unsupported shared head and names the skipped person', async () => {
  const source = await finishedControl();
  await source.continuity.checkpoint('hf.cast.oskar.rope');
  const head = source.continuity.heads.find((p) => p.castId === 'hf.cast.oskar.rope')!;
  const { continuity, requests } = control(true, {
    heads: { [head.castId]: head.revision },
    revisions: [head],
  });
  vi.mocked(portableWriteBlockers).mockImplementationOnce(() => ['commonstead']);
  const state = await continuity.fresh(8);
  expect(state.season.chapter).toBeUndefined();
  expect(requests.at(-1)?.envelopes?.some((p) => p.castId === head.castId)).toBe(false);
  expect(continuity.status).toContain('Oskar');
  expect(continuity.status).toContain('other games cannot share them yet');
});

it('blocks terminal closure before changing the source or publishing', async () => {
  const { continuity, requests, state } = await finishedControl();
  const before = structuredClone(continuity.ownership());
  state.climb.people.find((p) => p.id === 'oskar')!.body.alive = false;
  const count = requests.length;
  vi.mocked(portableWriteBlockers).mockReturnValueOnce(['commonstead']);
  await expect(continuity.checkpoint('hf.cast.oskar.rope')).rejects.toThrow(/commonstead/);
  expect(continuity.ownership()).toEqual(before);
  expect(requests.slice(count).some((r) => r.action === 'put')).toBe(false);
});
it('batch checkpoints skip local-only and denied people, and report real failures once', async () => {
  const { continuity: c, requests } = control(true);
  await c.fresh(42, true);
  const checkpoint = vi.spyOn(c, 'checkpoint').mockRejectedValue(new Error('secret failure'));
  requests.length = 0;
  await c.checkpointAll();
  expect(checkpoint).not.toHaveBeenCalled();
  expect(requests).toEqual([]);
  Object.assign(c, {
    localOnly: false,
    skipped: [{ castId: 'hf.cast.oskar.rope', reason: 'Oskar starts fresh.' }],
  });
  await c.checkpointAll();
  expect(checkpoint).toHaveBeenCalledTimes(4);
  expect(checkpoint).not.toHaveBeenCalledWith('hf.cast.oskar.rope');
  expect(requests).toEqual([]);
  expect(c.status).toBe("Some people's histories could not be saved this time. Your season continues.");
});
it('attempts real eligible checkpoints without writing a denied identity', async () => {
  const { continuity: c, shelf, requests } = await finishedControl();
  c.skipped = [{ castId: 'hf.cast.tamar.rope', reason: 'Tamar starts fresh.' }];
  requests.length = 0;
  const checkpoint = vi.spyOn(c, 'checkpoint');
  const request = shelf.request;
  shelf.request = async <T>(r: PersonaRequest): Promise<T> => {
    if (r.action === 'put') {
      requests.push(r);
      throw new Error('private transport detail');
    }
    return request<T>(r);
  };
  await c.checkpointAll();
  expect(checkpoint).toHaveBeenCalledTimes(4);
  expect(checkpoint).not.toHaveBeenCalledWith('hf.cast.tamar.rope');
  const puts = requests.filter((r) => r.action === 'put');
  expect(puts.length).toBeGreaterThan(0);
  expect(puts.every((r) => r.envelope?.castId !== 'hf.cast.tamar.rope')).toBe(true);
  expect(c.status).toBe("Some people's histories could not be saved this time. Your season continues.");
});
