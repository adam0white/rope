import { readFileSync } from 'node:fs';
import { ENGINE_VERSION, FRAMEWORK_VERSION, validateCalendarPersona } from '@adam0white/human-framework';
import { createPersona, preparePersonaLife, validatePersona } from '@adam0white/lab-client';
import { expect, it } from 'vitest';
import { queueInput, restore, snapshot, startClimb, step } from '../src/sim/climb.ts';
import { createParty } from '../src/sim/party.ts';
import { admitClimber, DIALECT, RULES } from '../src/sim/passport.ts';
import { exportClimb, newSeason, openingParty, replayExport } from '../src/sim/season.ts';
import { narrationBlanked } from './hf-narration-proof.ts';
import { proofHash } from './prose-proof.ts';

it('pins published HF and enables saved plain narration for every fresh opening', () => {
  expect(FRAMEWORK_VERSION).toBe('3.0.0');
  expect(ENGINE_VERSION).toBe('2.23.0');
  for (const people of [
    createParty(4, 4620),
    openingParty(4),
    startClimb(4, 3).people,
    newSeason(4).climb.people,
  ])
    expect(people.every((p) => p.lexicon?.plainEnglish === true)).toBe(true);
});
it('keeps a loaded narration choice and replays its exact pinned state', () => {
  const { climb } = newSeason(4);
  for (const p of climb.people) p.lexicon = { ...p.lexicon, plainEnglish: false };
  const initial = snapshot(climb);
  const loaded = restore(initial);
  queueInput(loaded, { t: 'lead', dir: 'up' });
  for (let i = 0; i < 60; i++) step(loaded);
  expect(loaded.people.every((p) => p.lexicon?.plainEnglish === false)).toBe(true);
  const exported = exportClimb(initial, loaded, FRAMEWORK_VERSION);
  expect(snapshot(replayExport(exported))).toBe(exported.state);
});
it.each([
  ['commonstead-oskar-221.json', '2.21.0'],
  ['commonstead-oskar-hf3.json', '2.23.0'],
])('admits actual Commonstead Oskar %s with finite identity and engine guards', async (file, engine) => {
  const fixture = JSON.parse(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8'));
  const envelope = await validatePersona(fixture.envelope);
  expect(fixture.raw.engine).toBe(engine);
  expect(validateCalendarPersona(envelope.transfer.person).person.source.engine).toBe(engine);
  const input = preparePersonaLife(envelope, 20 * 3600000);
  const opening = openingParty(4).find((p) => p.id === 'oskar');
  if (!opening) throw new Error('Missing Oskar');
  const admitted = admitClimber(input, opening);
  expect(admitted.id).toBe('oskar');
  expect(admitted.body.fitness).toBe(fixture.raw.body.fitness);
  const initial = Object.fromEntries(openingParty(4).map((p) => [p.id, p]));
  initial.oskar = admitted;
  const { revision, ...body } = envelope;
  const claim = await createPersona({
    ...body,
    parentRevision: revision,
    source: { game: 'rope', build: 'test', engine: ENGINE_VERSION, rules: RULES },
    transfer: { ...body.transfer, life: input.life },
  });
  const chapter = { version: DIALECT as typeof DIALECT, inputs: [input], claims: [claim], initial };
  const { season, climb } = newSeason(4, chapter);
  queueInput(climb, { t: 'lead', dir: 'up' });
  for (let i = 0; i < 30; i++) step(climb);
  const exported = exportClimb(season.start ?? '', climb, FRAMEWORK_VERSION, chapter);
  expect(snapshot(replayExport(exported))).toBe(exported.state);
  const compact = JSON.parse(JSON.stringify(exported));
  const continued = replayExport(compact);
  step(continued);
  step(climb);
  expect(snapshot(continued)).toBe(snapshot(climb));
  const { revision: _claimRevision, ...claimBody } = claim;
  const wrongClaim = await createPersona({ ...claimBody, limitations: ['Replaced source history.'] });
  expect(() => newSeason(4, { ...chapter, claims: [wrongClaim] })).toThrow(/claim/);
  for (const [key, value] of [
    ['engine', '2.22.0'],
    ['id', 'somebody-else'],
  ] as const) {
    const bad = structuredClone(input);
    const projection = validateCalendarPersona(bad.parent.transfer.person);
    projection.person.source[key] = value;
    bad.parent.transfer.person = projection;
    expect(() => admitClimber(bad, opening)).toThrow();
  }
  const bad = structuredClone(input);
  const projection = validateCalendarPersona(bad.parent.transfer.person);
  projection.person.mappingVersion = 'unknown/1';
  bad.parent.transfer.person = projection;
  expect(() => admitClimber(bad, opening)).toThrow();
});

it('the narration proof still detects semantic history, choices and RNG mutations', () => {
  const s = startClimb(4, 3);
  queueInput(s, { t: 'lead', dir: 'up' });
  for (let i = 0; i < 120; i++) step(s);
  const base = proofHash(narrationBlanked(s));
  const mutations: ((p: (typeof s.people)[number]) => void)[] = [
    (p) => {
      p.rng.a++;
    },
    (p) => {
      required(p.memory.episodes[0]).action = 'descend';
    },
    (p) => {
      p.memory.episodes[0]?.tags.push('failed');
    },
    (p) => {
      required(p.memory.episodes[0]).summary = 'A new authored fact';
    },
    (p) => {
      p.memory.episodes.pop();
    },
    (p) => {
      required(p.trace[0]).chosenAffordanceId = 'changed';
    },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(s);
    const p = copy.people[0];
    if (!p) throw new Error('Missing person');
    mutate(p);
    expect(proofHash(narrationBlanked(copy))).not.toBe(base);
  }
});

it('retains intention, outcome and counter-offer payloads when comparing narration wrappers', () => {
  const s = startClimb(4, 3);
  queueInput(s, { t: 'lead', dir: 'up' });
  for (let i = 0; i < 120; i++) step(s);
  const p = s.people[0];
  const intention = p?.conscience.intentions[0];
  const episode = p?.memory.episodes[0];
  const trace = p?.trace[0];
  if (!p || !intention || !episode || !trace) throw new Error('Missing semantic control records');
  intention.intention = 'I want to achieve this goal: stand on the top.';
  episode.summary = 'I completed this action: climb the hut path.';
  trace.suggestion = {
    voiceId: 'leader',
    verdict: 'deferred',
    reason: 'control',
    says: 'I will wait.',
    counterOffer: { affordanceId: 'climb:meadow', label: 'after I finish this task (climb the hut path)' },
  };
  const base = proofHash(narrationBlanked(s));
  const legacy = structuredClone(s);
  const lp = legacy.people[0];
  if (!lp) throw new Error('Missing legacy person');
  required(lp.conscience.intentions[0]).intention = 'to stand on the top';
  required(lp.memory.episodes[0]).summary = 'climb the hut path: completed';
  required(required(required(lp.trace[0]).suggestion).counterOffer).label = 'after I climb the hut path';
  expect(proofHash(narrationBlanked(legacy))).toBe(base);
  const mutations: ((person: (typeof s.people)[number]) => void)[] = [
    (person) => {
      required(person.conscience.intentions[0]).intention = 'I want to achieve this goal: get down safely.';
    },
    (person) => {
      required(person.memory.episodes[0]).summary = 'I completed this action: climb the gully.';
    },
    (person) => {
      required(person.memory.episodes[0]).summary = 'I could not complete this action: climb the hut path.';
    },
    (person) => {
      required(required(required(person.trace[0]).suggestion).counterOffer).label =
        'after I finish this task (eat something)';
    },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(s);
    const person = copy.people[0];
    if (!person) throw new Error('Missing mutation person');
    mutate(person);
    expect(proofHash(narrationBlanked(copy))).not.toBe(base);
  }
});

it('keeps a complete plain HF deferral without the legacy clipped-reply rewrite', async () => {
  const { voiced } = await import('../src/sim/voice.ts');
  const reply = 'After I finish this task (climb the hut path), I will do it.';
  expect(voiced(4, 'oskar', 480, 'deferred', reply, 'inertia', true)).toBe(reply);
});

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Missing test control value');
  return value;
}

it('preserves complete published HF2.23 three-mountain state byte for byte', async () => {
  const { playScripted } = await import('./script.ts');
  const baseline = JSON.parse(
    readFileSync(new URL('./fixtures/hf3-raw-baseline.json', import.meta.url), 'utf8'),
  );
  for (const [mountain, hash] of Object.entries(baseline)) {
    const played = playScripted(startClimb(4, 3, undefined, mountain), { turnAt: 720 });
    expect(proofHash(played)).toBe(hash);
  }
});
