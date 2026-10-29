import { expect, it } from 'vitest';
import { MOUNTAINS, memberState, queueInput, startClimb, step } from '../src/sim/climb.ts';

it('accepted rope work ties both climbers and HF deferrals remain honest', () => {
  const s = startClimb(1, 3);
  const accepted = queueInput(s, {
    t: 'say',
    act: 'rope',
    to: 'tamar',
    with: 'nell',
    force: 'insist',
  });
  for (let i = 0; i < 7; i++) step(s);
  expect(s.lines.filter((l) => l.input === accepted).map((l) => l.verdict)).toEqual(['assented', 'assented']);
  expect(memberState(s, 'tamar').ropedTo).toBe('nell');
  expect(memberState(s, 'nell').ropedTo).toBe('tamar');

  // A real HF deferral must not be converted into physical agreement.
  const other = startClimb(1, 3);
  for (const person of [...other.members, other.leader]) person.pos = { place: null, leg: 'meadow', t: 0.5 };
  memberState(other, 'oskar').pos.t = 0.6;
  const refused = queueInput(other, {
    t: 'say',
    act: 'gather',
    to: 'tamar',
    with: 'oskar',
    force: 'ask',
  });
  step(other);
  expect(other.lines.find((l) => l.input === refused && l.who === 'oskar')?.verdict).toBe('deferred');
  expect(other.people.find((p) => p.id === 'oskar')?.activity?.affordanceId).not.toBe('gather:tamar');
});

it('fixing a rope takes time before changing the physical route', () => {
  const s = startClimb(1, 3, undefined, 'kestrel');
  // Host-only position fixture: this does not claim the leader climbed here.
  const leg = MOUNTAINS.kestrel!.legs.find((l) => l.fixable)!;
  s.leader.pos = { place: leg.from, leg: null, t: 0 };
  queueInput(s, { t: 'fix' });
  step(s);
  expect(s.leader.fixing?.leg).toBe(leg.id);
  expect(s.fixed).not.toContain(leg.id);
  const until = s.leader.fixing!.until;
  while (s.minute < until - 1) step(s);
  expect(s.fixed).not.toContain(leg.id);
  while (s.minute <= until) step(s);
  expect(s.fixed).toContain(leg.id);
});
