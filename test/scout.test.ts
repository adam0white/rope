import { expect, it } from 'vitest';
import { queueInput, startClimb, step } from '../src/sim/climb.ts';

it('scouting a leg from the col reports it from the world and makes its route fact known', () => {
  const s = startClimb(1, 3);
  queueInput(s, { t: 'lead', dir: 'up' });
  while (s.leader.pos.place !== 'col' && s.minute % 1440 < 14 * 60) step(s);
  queueInput(s, { t: 'scout', via: 'gully' });
  for (let i = 0; i < 40; i++) step(s);
  expect(s.journal.some((j) => j.text.startsWith('You came back from the rock channel'))).toBe(true);
  expect(s.known.some((f) => f === 'gully-loose' || f === 'gully-quiet')).toBe(true);
});

it('someone sent ahead calls down what the next leg looks like when they get there', () => {
  const s = startClimb(1, 3);
  queueInput(s, { t: 'say', to: 'oskar', act: 'ahead', force: 'ask' });
  for (let i = 0; i < 300 && !s.journal.some((j) => j.text.includes('called down')); i++) step(s);
  expect(s.journal.some((j) => j.who === 'oskar' && j.text.includes('called down from'))).toBe(true);
});
