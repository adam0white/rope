import {
  acceptPersona,
  acceptPersonaBatch,
  canonicalCast,
  canonicalPersona,
  createPersona,
  type Lab,
  type PersonaEnvelope,
  type PersonaRequest,
  type PersonaShelfState,
  portableWriteBlockers,
} from '@adam0white/lab-client';
import { expect, it } from 'vitest';
import { newSeason } from '../src/sim/season.ts';
import { Continuity, type Ownership } from '../src/ui/continuity.ts';

async function control(race = false) {
  const fixtures: PersonaEnvelope[] = [];
  for (const [id, transfer] of [
    ['tamar', { castPassport: 'hf-portable-person/99', portable: { version: 99 } }],
    ['nell', { castPassport: 'hf-portable-person/2', portable: {}, portableClaim: { game: 'rope' } }],
  ] as const) {
    const castId = `hf.cast.${id}.rope`;
    expect(portableWriteBlockers(castId, 'rope')).toEqual([]);
    fixtures.push(
      await createPersona({
        format: 'hf-persona/1',
        castId,
        castRevision: canonicalCast(castId).revision,
        branchId: `synthetic-reader-${id}`,
        parentRevision: null,
        source: { game: 'rope', engine: '4.13.0', build: 'synthetic-reader', rules: 'rope-hf4-1' },
        transfer: { ...transfer, custody: { retained: ['entire', 'original'] } },
        limitations: ['Synthetic control.'],
      }),
    );
  }
  let data: PersonaShelfState = fixtures.reduce<PersonaShelfState>((s, p) => acceptPersona(s, p), {
    heads: {},
    revisions: [],
  });
  const requests: PersonaRequest[] = [];
  const shelf = {
    enabled: true,
    ready: Promise.resolve(true),
    setEnabled() {},
    async request<T>(q: PersonaRequest): Promise<T> {
      requests.push(q);
      if (q.action === 'get')
        return (data.revisions.find((p) => p.revision === data.heads[q.castId ?? '']) ?? null) as T;
      if (q.action === 'putBatch') {
        if (race) data = { ...data, heads: { ...data.heads, [fixtures[0]!.castId]: 'f'.repeat(64) } };
        data = acceptPersonaBatch(data, q.envelopes ?? [], q.expectedHeads);
        return null as T;
      }
      throw Error(`Unexpected shelf write: ${q.action}`);
    },
  };
  const lab = {
    build: () => ({ c: 'reader-control' }),
    setPersonaRecording() {},
    allowPersonaRecording() {},
  } as unknown as Lab;
  return { fixtures, requests, shelf, lab, continuity: new Continuity(lab, shelf), data: () => data };
}

// Real installed SDK gate: Tamar and Nell have no other peers. No catalog mock.
it('retains individual unsupported and occupied histories and blocks all writes after reload', async () => {
  const h = await control();
  const state = await h.continuity.fresh(7);
  expect(h.continuity.status).toContain('Tamar Vale');
  expect(h.continuity.status).toContain('Nell');
  const saved = h.continuity.ownership();
  expect(saved.skipped?.map((s) => s.castId)).toEqual(h.fixtures.map((p) => p.castId));
  expect(JSON.stringify(saved)).not.toContain('custody');
  expect(saved.skipped?.every((s) => !('envelope' in s))).toBe(true);
  expect(saved.skipped?.[0]?.reason).toMatch(/unsupported|invalid|version/i);
  expect(saved.skipped?.[1]?.reason).toMatch(/another game/i);
  const reload = new Continuity(h.lab, h.shelf);
  const count = h.requests.length;
  await reload.restoreOwnership(state, JSON.parse(JSON.stringify(saved)));
  expect(h.requests).toHaveLength(count);
  expect(reload.ownership()).toEqual(saved);
  expect(reload.status).toContain('Tamar Vale');
  for (const p of h.fixtures) {
    expect(reload.pinnedHistories().some((h) => h.castId === p.castId)).toBe(false);
    for (const fork of [false, true])
      await expect(reload.checkpoint(p.castId, fork)).rejects.toThrow(/started fresh/i);
  }
  const before = canonicalPersona(reload.ownership());
  state.climb.people.find((p) => p.id === 'tamar')!.body.alive = false;
  await expect(reload.checkpoint(h.fixtures[0]!.castId)).rejects.toThrow(/started fresh/i);
  expect(canonicalPersona(reload.ownership())).toBe(before);
  expect(h.requests).toHaveLength(count);
  expect(h.data().revisions.filter((p) => h.fixtures.some((f) => f.revision === p.revision))).toEqual(
    h.fixtures,
  );
});

it('includes skipped heads in atomic preflight and installs no partial run on a race', async () => {
  const h = await control(true);
  await expect(h.continuity.fresh(7)).rejects.toThrow(/Continuity conflict/);
  expect(h.data().revisions).toEqual(h.fixtures);
  expect(h.continuity.heads).toEqual([]);
  expect(h.continuity.ownership().skipped ?? []).toEqual([]);
  expect(newSeason(7).climb.people).toHaveLength(5);
});

it.each(['wrong-parent', 'rejected', 'missing'])(
  'aborts %s preparation without replacing the installed run',
  async (failure) => {
    const { createRun, createPerson, inspect } = await import('@adam0white/human-framework');
    const { archiveOf, hfRunOf, need } = await import('../src/sim/hf4.ts');
    const { openingParty } = await import('../src/sim/season.ts');
    const { preparePersonaLife } = await import('@adam0white/lab-client');
    const spec = archiveOf(newSeason(7).climb).initial.spec;
    const run = need(createRun(spec));
    // Synthetic authored source, no outstanding goals; not a played departure.
    for (const person of openingParty(7)) {
      person.state.agenda.goals = [];
      need(createPerson(run, person));
    }
    const castId = 'hf.cast.tamar.rope';
    const view = need(
      inspect(run, {
        perspective: { kind: 'host' },
        people: ['tamar'],
        select: ['persona'],
        portable: { person: 'tamar', castId, castRevision: '1' },
      }),
    );
    const portable = view.people[0]!.parts[0]!.value;
    const parent = await createPersona({
      format: 'hf-persona/1',
      castId,
      castRevision: '1',
      branchId: 'eligible-reader-control',
      parentRevision: null,
      source: { game: 'rope', engine: '4.15.0', build: 'synthetic', rules: 'rope-hf4-1' },
      transfer: { castPassport: 'hf-portable-person/2', portable },
      limitations: [],
    });
    const h = await control();
    const old = await h.continuity.fresh(7, true);
    const before = h.continuity.ownership();
    h.requests.length = 0;
    h.shelf.request = async <T>(q: PersonaRequest): Promise<T> => {
      h.requests.push(q);
      if (q.action === 'get') return (q.castId === castId ? parent : null) as T;
      if (q.action === 'prepare') {
        if (failure === 'rejected') throw new Error('Preparation transport failed');
        if (failure === 'missing') return null as T;
        const prepared = preparePersonaLife(parent, 0);
        prepared.parent = { ...parent, revision: 'f'.repeat(64) };
        return prepared as T;
      }
      return null as T;
    };
    await expect(h.continuity.fresh(8)).rejects.toThrow(/prepar|changed/i);
    expect(h.requests.some((q) => q.action === 'prepare')).toBe(true);
    expect(h.requests.some((q) => q.action === 'putBatch')).toBe(false);
    expect(h.continuity.ownership()).toEqual(before);
    expect((h.continuity as unknown as { state: unknown }).state).toBe(old);
    expect(hfRunOf(old.climb)).toBeDefined();
  },
);

it('refuses native ownership that lost denial metadata instead of granting a missing role new write permission', async () => {
  const h = await control();
  const state = await h.continuity.fresh(7);
  const saved = h.continuity.ownership();
  delete saved.skipped;
  const reload = new Continuity(h.lab, h.shelf);
  await expect(reload.restoreOwnership(state, saved)).rejects.toThrow(/fresh|denial|permission/i);
  expect(reload.heads).toEqual([]);
});

it('distinguishes absent skip metadata from malformed fields and rejects retained ownership overlap', async () => {
  const { skippedMetadata } = await import('../src/ui/skip-metadata.ts');
  const castId = 'hf.cast.tamar.rope';
  const valid = { castId, reason: 'Tamar starts a local story.' };
  expect(skippedMetadata({}, 'skipped')).toBeUndefined();
  for (const value of [
    undefined,
    null,
    0,
    { length: 0 },
    [valid, valid],
    [{ ...valid, reason: ' ' }],
    [{ ...valid, reason: 'x'.repeat(1025) }],
    [{ ...valid, envelope: {} }],
  ]) {
    expect(() => skippedMetadata({ skipped: value }, 'skipped')).toThrow(/skipped histories/i);
  }
  expect(() => skippedMetadata({ skipped: [valid] }, 'skipped', [{ castId }])).toThrow(/skipped histories/i);
});

it.each([undefined, null])(
  'refuses missing/null ownership from an actual current skipped run before activation (%s)',
  async (ownership) => {
    const h = await control();
    const state = await h.continuity.fresh(7);
    const saved = h.continuity.ownership();
    expect(saved.skipped).toHaveLength(2);
    const reload = new Continuity(h.lab, h.shelf);
    const before = h.requests.length;
    await expect(reload.restoreOwnership(state, ownership as unknown as Ownership)).rejects.toThrow(
      /permission|ownership|fresh/i,
    );
    expect(reload.generation).toBe(0);
    expect(reload.heads).toEqual([]);
    expect(reload.sources).toEqual([]);
    expect((reload as unknown as { state: unknown }).state).toBeNull();
    expect(h.requests).toHaveLength(before);
  },
);

it('validates the explicit local-only flag before activation', async () => {
  const h = await control();
  const state = await h.continuity.fresh(7, true);
  const saved = h.continuity.ownership();
  for (const value of [null, 0, 'true']) {
    const reload = new Continuity(h.lab, h.shelf);
    await expect(
      reload.restoreOwnership(state, { ...saved, localOnly: value } as unknown as Ownership),
    ).rejects.toThrow(/permissions|fresh/i);
    expect(reload.generation).toBe(0);
  }
});
