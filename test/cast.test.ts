import { expect, it } from 'vitest';
import { archiveOf, FRAMEWORK_VERSION } from '../src/sim/hf4.ts';
import { CAST, castIdOf, createParty } from '../src/sim/party.ts';
import { climberTransfer } from '../src/sim/passport.ts';
import { newSeason } from '../src/sim/season.ts';

it('authors every actual canonical profile and identity without editing live HF actors', () => {
  const people = createParty(42, 4620);
  expect(people).toHaveLength(5);
  for (const p of people) {
    const cast = CAST.find((c) => c.castId === castIdOf(p.id))!;
    expect(p.identity.castId).toBe(cast.castId);
    expect(p.state.traits).toEqual(cast.traits);
    expect(p.state.values).toEqual(cast.values);
    expect(p.identity.name).toBe(cast.name);
    expect(p.state.agenda.goals.length).toBeGreaterThan(0);
  }
});
it('refuses active optional agendas without stripping goals or mutating the source run', async () => {
  const { climb } = newSeason(42);
  const before = archiveOf(climb);
  await expect(climberTransfer(climb, 'oskar')).rejects.toThrow();
  expect(archiveOf(climb)).toEqual(before);
});
it('maps an explicitly authored current foreign biography as historical places and voices', async () => {
  const {
    createRun,
    createPerson,
    step: stepHF,
    inspect,
    replay: replayHF,
    exportRun,
  } = await import('@adam0white/human-framework');
  const { createPersona } = await import('@adam0white/lab-client');
  const { admitClimber, RULES } = await import('../src/sim/passport.ts');
  const { openingParty } = await import('../src/sim/season.ts');
  const { startClimb } = await import('../src/sim/climb.ts');
  const { need } = await import('../src/sim/hf4.ts');
  const original = archiveOf(newSeason(7).climb).initial.spec;
  const spec = structuredClone(original);
  spec.host.id = 'commonstead';
  spec.definitions.sources = [
    ...spec.definitions.sources.filter((s) => s.type !== 'host'),
    { type: 'host', id: 'commonstead' },
    { type: 'voice', id: 'orchard-neighbour' },
  ];
  spec.world.facts = [
    ...spec.world.facts.map((f) => ({ ...f, provenance: { ...f.provenance, source: 'commonstead' } })),
    {
      id: 'orchard-map',
      subject: 'old-orchard',
      predicate: 'kind',
      value: 'place',
      at: spec.start,
      provenance: { source: 'commonstead', evidenceId: 'authored-orchard-map' },
    },
  ];
  const source = need(createRun(spec));
  const authored = openingParty(7);
  const oskar = authored.find((p) => p.id === 'oskar')!;
  oskar.biography = [
    {
      id: 'e0',
      at: spec.start - 60000,
      kind: 'work',
      action: 'walk',
      actorId: 'oskar',
      targetId: 'old-orchard',
      placeId: 'old-orchard',
      voiceId: 'orchard-neighbour',
      valence: 0.2,
      salience: 0.7,
      summary: 'Authored background: walked through the old orchard with a neighbour.',
      tags: ['authored-background'],
      basis: { kind: 'authored', author: 'commonstead' },
      provenance: ['authored-orchard-map'],
    },
  ];
  for (const person of authored) need(createPerson(source, person));
  need(
    stepHF(source, {
      until: spec.start,
      inputs: oskar.state.agenda.goals.map((g, i) => ({
        id: `release:${i}`,
        at: spec.start,
        source: { type: 'host', id: 'commonstead' },
        kind: 'agenda.requested' as const,
        payload: { person: 'oskar', request: { type: 'abandon-goal' as const, goalId: g.id } },
      })),
    }),
  );
  const before = exportRun(source);
  const view = need(
    inspect(source, {
      perspective: { kind: 'host' },
      people: ['oskar'],
      select: ['persona'],
      portable: { person: 'oskar', castId: castIdOf('oskar'), castRevision: '1' },
    }),
  ).people[0];
  if (view?.kind !== 'host') throw Error('Missing host projection');
  const part = view.parts.find((p) => p.select === 'persona');
  if (part?.select !== 'persona') throw Error('Missing history');
  const envelope = await createPersona({
    format: 'hf-persona/1',
    castId: castIdOf('oskar'),
    castRevision: '1',
    branchId: 'authored-foreign-control',
    parentRevision: null,
    source: { game: 'commonstead', build: 'authored-control', engine: FRAMEWORK_VERSION, rules: RULES },
    transfer: { castPassport: 'hf-portable-person/2', portable: part.value },
    limitations: ['This source biography was explicitly authored, not played movement.'],
  });
  const target = startClimb(
    8,
    3,
    openingParty(8).map((p) => (p.id === 'oskar' ? admitClimber(envelope, p) : p)),
  );
  expect(replayHF(archiveOf(target)).ok).toBe(true);
  expect(exportRun(source)).toEqual(before);
  expect(replayHF(before).ok).toBe(true);
  const mapped = archiveOf(target).initial.people.find((p) => p.id === 'oskar')!.portable!.mapping.references;
  expect(mapped).toContainEqual({
    kind: 'entity',
    source: 'old-orchard',
    target: 'history:commonstead:old-orchard',
  });
  expect(mapped).toContainEqual({
    kind: 'source',
    source: 'orchard-neighbour',
    target: 'history:commonstead:orchard-neighbour',
  });
});
