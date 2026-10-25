import {
  abandonGoal,
  ENGINE_VERSION,
  knockDown,
  snapshot as personSnapshot,
} from '@adam0white/human-framework';
import { createPersona, initialPersonaLife, preparePersonaLife } from '@adam0white/lab-client';
import { expect, it } from 'vitest';
import { queueInput, snapshot, step } from '../src/sim/climb.ts';
import { CAST, castIdOf, createParty } from '../src/sim/party.ts';
import { admitClimber, climberTransfer, DIALECT, RULES } from '../src/sim/passport.ts';
import {
  exportClimb,
  newSeason,
  nextClimb,
  openingParty,
  replayExport,
  validateSeasonStart,
} from '../src/sim/season.ts';

async function source(id: string) {
  const person = createParty(42, 4620).find((p) => p.id === id);
  if (!person) throw new Error('person');
  person.body.fitness = 0.63;
  for (const g of person.agenda.goals) abandonGoal(person, g.id); // isolated eligible-boundary control
  const captured = await climberTransfer(person);
  const branchId = 'cast-control';
  const envelope = await createPersona({
    format: 'hf-persona/1',
    castId: castIdOf(id),
    castRevision: '1',
    branchId,
    parentRevision: null,
    source: { game: 'rope', build: 'control', engine: ENGINE_VERSION, rules: RULES },
    transfer: { ...captured.transfer, life: initialPersonaLife(castIdOf(id), branchId, 0) },
    limitations: captured.limitations,
  });
  return { person, captured, envelope };
}
it('uses every canonical profile without extra RNG draws', () => {
  const people = createParty(42, 4620);
  expect(people).toHaveLength(5);
  for (const p of people) {
    const c = CAST.find((c) => c.castId === castIdOf(p.id));
    expect(p.traits).toEqual(c?.traits);
    expect(p.values).toEqual(c?.values);
    expect(p.name).toBe(c?.name);
    expect(p.will.temperature).toBe(0);
  }
});
it('native actual projection retains temperament, changed fitness and RNG; injuries refuse', async () => {
  const { person, captured, envelope } = await source('oskar');
  const input = preparePersonaLife(envelope, 20 * 3600000);
  const opening = createParty(15, 4620).find((p) => p.id === 'oskar');
  if (!opening) throw new Error('opening');
  const admitted = admitClimber(input, opening);
  expect(admitted.rng).toEqual(person.rng);
  expect(admitted.body.fitness).toBe(0.63);
  expect(admitted.traits).toEqual(person.traits);
  expect(captured.transfer.checkpoint.sha256).toMatch(/^[a-f0-9]{64}$/);
  knockDown(person, { reason: 'test actual downing' });
  await expect(climberTransfer(person)).rejects.toThrow();
});
it('pins a complete admitted cast and changed life preparation in deterministic replay', async () => {
  const { envelope } = await source('oskar');
  const input = preparePersonaLife(envelope, 20 * 3600000);
  const initial = Object.fromEntries(openingParty(8).map((p) => [p.id, p]));
  initial.oskar = admitClimber(input, initial.oskar!);
  const { revision, ...body } = envelope;
  const claim = await createPersona({
    ...body,
    parentRevision: revision,
    source: { game: 'rope', build: 'control', engine: ENGINE_VERSION, rules: RULES },
    transfer: { ...body.transfer, life: input.life },
  });
  const chapter = { version: DIALECT as typeof DIALECT, inputs: [input], claims: [claim], initial };
  const { season, climb } = newSeason(8, chapter);
  const start = season.start!;
  expect(climb.journal.some((j) => j.text.includes('last local stop'))).toBe(true);
  queueInput(climb, { t: 'ask-life', to: 'nell' });
  for (let i = 0; i < 30; i++) step(climb);
  const exported = exportClimb(start, climb, '2.18.0', chapter);
  expect(snapshot(replayExport(exported))).toBe(exported.state);
  expect(personSnapshot(JSON.parse(start).people.find((p: { id: string }) => p.id === 'oskar')).rng).toEqual(
    initial.oskar.rng,
  );
  const bad = structuredClone(input);
  bad.parent.source.game = 'watch';
  expect(() => admitClimber(bad, initial.oskar!)).toThrow();
});
it('private clues require a chosen receptive encounter and replay exactly', () => {
  const { season, climb } = newSeason(13);
  expect(climb.journal.some((j) => j.text.includes('Sunny Chair'))).toBe(false);
  queueInput(climb, { t: 'ask-life', to: 'nell' });
  step(climb);
  expect(climb.lines.some((l) => l.reason === 'private-conversation')).toBe(true);
  const exported = exportClimb(season.start!, climb, '2.18.0');
  expect(snapshot(replayExport(exported))).toBe(exported.state);
});

it('a played finished hut chapter waits for actual rest, releases mountain aims, and remains replayable', async () => {
  const { season, climb } = newSeason(13);
  queueInput(climb, { t: 'lead', dir: 'up' });
  while (!climb.over) step(climb);
  queueInput(climb, { t: 'release-person', to: 'oskar' });
  step(climb);
  const person = climb.people.find((p) => p.id === 'oskar');
  if (!person) throw new Error('missing person');
  expect(person.activity).toBeNull();
  expect(climb.journal.some((j) => j.text.includes('You waited at the hut'))).toBe(true);
  await expect(climberTransfer(person)).resolves.toHaveProperty('transfer.castPassport', DIALECT);
  const exported = exportClimb(season.start ?? '', climb, '2.18.0');
  expect(snapshot(replayExport(exported))).toBe(exported.state);
});

it('binds later starts to the actual played prefix', () => {
  const { season, climb } = newSeason(13);
  queueInput(climb, { t: 'lead', dir: 'up' });
  while (!climb.over) step(climb);
  const next = nextClimb(season, climb, null);
  if (!next || !season.start) throw new Error('next');
  expect(validateSeasonStart(13, undefined, season.past ?? [], season.start).climbNo).toBe(2);
  const changed = JSON.parse(season.start);
  changed.people[0].traits.honesty = 0.01;
  expect(() => validateSeasonStart(13, undefined, season.past ?? [], JSON.stringify(changed))).toThrow(
    'starting state does not match',
  );
});
