import { expect, it } from 'vitest';
import { trailRoute } from '../src/sim/approach.ts';
import {
  approachEstimate,
  distance,
  MOUNTAINS,
  memberState,
  offersFor,
  queueInput,
  replay,
  snapshot,
  startClimb,
  step,
} from '../src/sim/climb.ts';
import { inputPhrase } from '../src/sim/debrief.ts';
import { narrationBlanked, narrationPeople } from './hf-narration-proof.ts';
import { proofHash } from './prose-proof.ts';

function fixture() {
  const s = startClimb(1, 3);
  for (const x of [...s.members, s.leader]) x.pos = { place: null, leg: 'meadow', t: 0.5 };
  memberState(s, 'nell').pos.t = 0.6;
  return s;
}

it('pins the current-cast pursuit state for old input verbs', () => {
  const s = startClimb(31, 3);
  queueInput(s, { t: 'lead', dir: 'up' });
  for (let i = 0; i < 80; i++) step(s);
  queueInput(s, { t: 'lead', dir: 'with', who: 'tamar' });
  for (let i = 0; i < 100; i++) step(s);
  // Baseline d642cea; non-prose HF state is independently unchanged.
  expect(proofHash(narrationBlanked(s))).toBe(
    'e1792a5a0e87365968721d204d62081da9ddd0cba48c3ba9414c4d8ba5e83a0f',
  );
  expect(proofHash(narrationPeople(s.people))).toBe(
    'b4a05d2634604a782534b7c7ea9413f0be0c2ba6dc7ede55ca7d1e5f72bf69c2',
  );
});

it('both people answer through HF, close the distance, and can then receive a rope offer', () => {
  const s = fixture();
  queueInput(s, { t: 'say', act: 'gather', to: 'tamar', with: 'nell', force: 'ask' });
  step(s);
  expect(s.lines.filter((x) => x.input === 0).map((x) => [x.who, x.verdict])).toEqual([
    ['tamar', 'assented'],
    ['nell', 'assented'],
  ]);
  const a = memberState(s, 'tamar');
  const b = memberState(s, 'nell');
  const before = distance(s, a.pos, b.pos);
  for (let i = 0; i < 10; i++) step(s);
  expect(distance(s, a.pos, b.pos)).toBeLessThan(40);
  expect(distance(s, a.pos, b.pos)).toBeLessThan(before);
  expect(b.turnedAt).toBeNull();
  expect(b.pos.leg).toBe('meadow');
  expect(b.pos.t).toBeCloseTo(0.5);
  expect(offersFor(s, a.id, `rope:${b.id}`).some((x) => x.id === `rope:${b.id}`)).toBe(true);
  queueInput(s, { t: 'say', act: 'rope', to: 'tamar', with: 'nell', force: 'insist' });
  step(s);
  expect(s.lines.filter((x) => x.input === 1)).toHaveLength(2);
  expect(s.lines.filter((x) => x.input === 1).map((x) => [x.who, x.verdict])).toEqual([
    ['tamar', 'assented'],
    ['nell', 'assented'],
  ]);
  for (let i = 0; i < 5; i++) step(s);
  expect(a.ropedTo).toBe(b.id);
  expect(b.ropedTo).toBe(a.id);
});

it('retains a genuine HF disagreement rather than moving everyone anyway', () => {
  const s = fixture();
  memberState(s, 'oskar').pos.t = 0.6;
  queueInput(s, { t: 'say', act: 'gather', to: 'tamar', with: 'oskar', force: 'ask' });
  step(s);
  const reply = s.lines.find((x) => x.input === 0 && x.who === 'oskar');
  expect(reply?.verdict).toBe('deferred');
  expect(s.people.find((x) => x.id === 'oskar')?.activity?.affordanceId).not.toBe('gather:tamar');
});

it('new close approach reaches pack distance without changing old pursuit', () => {
  const s = fixture();
  s.leader.pos.t = 0.4;
  queueInput(s, { t: 'say', act: 'gather', to: 'tamar', with: 'nell', force: 'ask' });
  queueInput(s, { t: 'lead', dir: 'near', who: 'tamar' });
  expect(approachEstimate(s, 'tamar').minutes).toBeGreaterThan(0);
  for (let i = 0; i < 12; i++) step(s);
  const a = memberState(s, 'tamar');
  expect(distance(s, a.pos, s.leader.pos)).toBeLessThan(40);
  expect(offersFor(s, a.id, 'pack').some((x) => x.id === 'pack')).toBe(true);
  queueInput(s, { t: 'say', act: 'pack', to: 'tamar', force: 'insist' });
  step(s);
  expect(s.lines.filter((x) => x.input === 2).map((x) => [x.who, x.verdict])).toEqual([
    ['tamar', 'assented'],
  ]);
  for (let i = 0; i < 2; i++) step(s);
  expect(a.pack).toBe(false);
  expect(s.leader.carrying).toContain(a.id);
});

it('new inputs replay the complete saved state exactly', () => {
  const s = fixture();
  const start = snapshot(s);
  queueInput(s, { t: 'say', act: 'gather', to: 'tamar', with: 'nell', force: 'ask' });
  queueInput(s, { t: 'lead', dir: 'near', who: 'tamar' });
  for (let i = 0; i < 18; i++) step(s);
  expect(snapshot(replay(start, s.inputs, s.minute))).toBe(snapshot(s));
});

it('routes across branches through valid shared endpoints rather than altitude', () => {
  const m = MOUNTAINS.hollin;
  if (!m) throw new Error('missing mountain');
  const fork = m.places.find((p) => m.legs.filter((x) => x.from === p.id).length > 1);
  if (!fork) throw new Error('missing fork');
  const branches = m.legs.filter((x) => x.from === fork.id);
  const [first, second] = branches;
  if (!first || !second) throw new Error('missing branches');
  const route = trailRoute(
    m,
    { place: null, leg: first.id, t: 0.15 },
    { place: null, leg: second.id, t: 0.15 },
  );
  expect(route.map((x) => [x.leg, x.fromT, x.toT])).toEqual([
    [first.id, 0.15, 0],
    [second.id, 0, 0.15],
  ]);
});

it('gathers across branches through the fork, then releases the finite wait', () => {
  const s = startClimb(1, 3, undefined, 'hollin');
  const m = MOUNTAINS.hollin;
  if (!m) throw new Error('missing mountain');
  const fork = m.places.find((p) => m.legs.filter((x) => x.from === p.id).length > 1);
  if (!fork) throw new Error('missing fork');
  const [first, second] = m.legs.filter((x) => x.from === fork.id);
  if (!first || !second) throw new Error('missing branches');
  for (const x of [...s.members, s.leader]) {
    x.pos = { place: null, leg: first.id, t: 0.15 };
    x.path = ['meadow'];
  }
  const a = memberState(s, 'tamar');
  const b = memberState(s, 'nell');
  b.pos.leg = second.id;
  queueInput(s, { t: 'say', act: 'gather', to: a.id, with: b.id, force: 'insist' });
  step(s);
  const until = a.gather?.until;
  if (!until) throw new Error('missing gather plan');
  expect(s.lines.filter((x) => x.input === 0).every((x) => x.verdict === 'assented')).toBe(true);
  while (s.minute < until - 2 && distance(s, a.pos, b.pos) >= 1) step(s);
  expect(distance(s, a.pos, b.pos)).toBeLessThan(1);
  expect(b.pos.leg).toBe(first.id);
  expect(b.pos.t).toBeCloseTo(0.15);
  expect(b.turnedAt).toBeNull();
  while (s.minute <= until) step(s);
  expect(a.gather).toBeUndefined();
  expect(b.gather).toBeUndefined();
});

it('an unheard repeated gathering request cannot cancel an accepted one', () => {
  const s = fixture();
  queueInput(s, { t: 'say', act: 'gather', to: 'tamar', with: 'nell', force: 'ask' });
  step(s);
  const until = memberState(s, 'tamar').gather?.until;
  s.leader.pos = { place: 'summit', leg: null, t: 0 };
  queueInput(s, { t: 'say', act: 'gather', to: 'tamar', with: 'nell', force: 'ask' });
  step(s);
  expect(s.unheard).toContain(1);
  expect(memberState(s, 'tamar').gather?.until).toBe(until);
  expect(s.people.find((x) => x.id === 'tamar')?.activity?.affordanceId).toBe('gather:nell');
});

it('a close approach across the summit leaves a valid route down its new branch', () => {
  const s = startClimb(1, 3, undefined, 'hollin');
  const m = MOUNTAINS.hollin;
  if (!m) throw new Error('missing mountain');
  for (const x of [...s.members, s.leader]) {
    x.pos = { place: null, leg: 'step', t: 0.95 };
    x.path = ['meadow', 'moraine', 'snow', 'ridge'];
  }
  queueInput(s, { t: 'say', act: 'gather', to: 'tamar', with: 'nell', force: 'insist' });
  step(s);
  s.leader.pos = { place: null, leg: 'scramble', t: 0.95 };
  s.leader.path = ['meadow', 'moraine', 'snow', 'gully'];
  queueInput(s, { t: 'lead', dir: 'near', who: 'tamar' });
  for (let i = 0; i < 7; i++) step(s);
  expect(s.leader.pos.leg).toBe('step');
  expect(s.leader.path).toEqual(['meadow', 'moraine', 'snow', 'ridge']);
  queueInput(s, { t: 'lead', dir: 'down' });
  step(s);
  expect(s.leader.move?.leg).toBe('step');
});

it('gathering at a real summit records the ascent without recording an interior descent as a turn', () => {
  const s = startClimb(1, 3, undefined, 'hollin');
  for (const x of [...s.members, s.leader]) {
    x.pos = { place: 'summit', leg: null, t: 0 };
    x.path = ['meadow', 'gully'];
  }
  const nell = memberState(s, 'nell');
  nell.pos = { place: null, leg: 'scramble', t: 0.9 };
  nell.path = ['meadow', 'ridge'];
  nell.high = 'gully-top';
  queueInput(s, { t: 'say', act: 'gather', to: 'tamar', with: 'nell', force: 'insist' });
  for (let i = 0; i < 8; i++) step(s);
  expect(nell.pos.place).toBe('summit');
  expect(nell.high).toBe('summit');
  expect(nell.summitAt).not.toBeNull();
});

it('names the new inputs in the debrief', () => {
  expect(inputPhrase({ t: 'say', at: 1, act: 'gather', to: 'tamar', with: 'nell', force: 'ask' })).toBe(
    'asked Tamar Vale to meet Nell and wait together',
  );
  expect(inputPhrase({ t: 'lead', at: 1, dir: 'near', who: 'tamar' })).toBe('walked close to Tamar Vale');
});
