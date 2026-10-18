import { expect, it } from 'vitest';
import { type ClimbState, queueInput, startClimb, step } from '../src/sim/climb.ts';

const below = new Set(['meadow', 'moraine', 'snow']);

/** Lead the party to the col (Hollin's fork) and wait there for everyone. */
function toCol(seed: number): ClimbState {
  const s = startClimb(seed, 3);
  queueInput(s, { t: 'lead', dir: 'up' });
  queueInput(s, { t: 'say', to: 'all', act: 'climb', force: 'ask' });
  const arrived = () =>
    s.leader.pos.place === 'col' &&
    s.members.every((m) => m.pos.place === 'col' || !below.has(m.pos.leg ?? ''));
  while (!arrived() && s.minute % 1440 < 14 * 60) {
    step(s);
    if (!s.leader.move && s.leader.pos.place !== 'col' && s.minute % 10 === 0)
      queueInput(s, { t: 'lead', dir: 'up' });
  }
  return s;
}

const tamarSays = (via: string) => {
  const s = toCol(7);
  queueInput(s, { t: 'lead', dir: 'up', via });
  queueInput(s, { t: 'say', to: 'tamar', act: 'climb', force: 'ask', via });
  const asked = s.inputs.length - 1;
  for (let i = 0; i < 60; i++) step(s);
  const tamar = s.members.find((m) => m.id === 'tamar');
  const said = s.lines.filter((l) => l.who === 'tamar' && l.input === asked).map((l) => l.verdict);
  return { said, onRoute: tamar?.pos.leg === via || tamar?.path.includes(via) };
};

it('control: at the col, the same ask at the col gets different HF answers for the gully and the ridge', () => {
  const gully = tamarSays('gully');
  const ridge = tamarSays('ridge');
  expect(gully.said).not.toContain('assented');
  expect(gully.onRoute).toBe(false);
  expect(ridge.said).toContain('assented');
  expect(ridge.onRoute).toBe(true);
});
