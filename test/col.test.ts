import { voiceOf } from '@adam0white/human-framework';
import { expect, it } from 'vitest';
import { type ClimbState, type Force, queueInput, startClimb, step } from '../src/sim/climb.ts';

const below = new Set(['meadow', 'moraine', 'snow']);

/** Walk the party to the col (Hollin's fork) with one ask, and stop when everyone has got there. */
function toCol(seed: number): ClimbState {
  const s = startClimb(seed, 3);
  queueInput(s, { t: 'lead', dir: 'up' });
  queueInput(s, { t: 'say', to: 'all', act: 'climb', force: 'ask' });
  const arrived = () =>
    s.leader.pos.place === 'col' &&
    s.members.every((m) => m.pos.place === 'col' || !below.has(m.pos.leg ?? ''));
  while (!arrived() && s.minute % 1440 < 14 * 60) step(s);
  return s;
}

function turnBack(force: Force) {
  const s = toCol(2);
  const wren = s.people.find((p) => p.id === 'wren');
  const before = wren ? (voiceOf(wren, 'leader')?.trust ?? 0) : 0;
  queueInput(s, { t: 'lead', dir: 'down' });
  queueInput(s, { t: 'say', to: 'all', act: 'descend', force });
  const asked = s.inputs.length - 1;
  for (let i = 0; i < 30; i++) step(s);
  const verdicts = s.lines.filter((l) => l.input === asked).map((l) => l.verdict);
  const after = wren ? (voiceOf(wren, 'leader')?.trust ?? 0) : 0;
  return { verdicts, wrenTrust: after - before };
}

it('control: turning back at the col, asking gets deferrals that insisting does not', () => {
  const ask = turnBack('ask');
  const insist = turnBack('insist');
  expect(ask.verdicts).toContain('deferred');
  expect(insist.verdicts).not.toContain('deferred');
  expect(ask.wrenTrust).toBe(0);
});

it('control: insisting again and again on the way up wears trust down, through HF', () => {
  const s = toCol(2);
  const wren = s.people.find((p) => p.id === 'wren');
  if (!wren) throw new Error('no wren');
  // This is a voice-pressure control, so keep the leader in actual earshot as Wren moves.
  const before = voiceOf(wren, 'leader')?.trust ?? 0;
  for (let k = 0; k < 4; k++) {
    s.leader.move = null;
    s.leader.pos = structuredClone(s.members.find((m) => m.id === 'wren')!.pos);
    queueInput(s, { t: 'say', to: 'wren', act: 'descend', force: 'insist' });
    for (let i = 0; i < 8; i++) step(s);
  }
  expect(voiceOf(wren, 'leader')?.trust ?? 0).toBeLessThan(before);
});
