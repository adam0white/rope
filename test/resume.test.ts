import { expect, it } from 'vitest';
import { queueInput, restore, snapshot, startClimb, step } from '../src/sim/climb.ts';

// The actual finished-climb/read-back replay is retained in hf4-full-climb-control.ts.
// This bounded current-pin control checks active cold continuation for three seeds.
it.each([1, 3, 7])('cold-continuing an active climb is exact for seed %s', (seed) => {
  const live = startClimb(seed, 3);
  queueInput(live, { t: 'say', to: 'all', act: 'climb', force: 'ask' });
  queueInput(live, { t: 'lead', dir: 'up' });
  for (let i = 0; i < 10; i++) step(live);
  expect(live.people.some((p) => p.activity !== null)).toBe(true);
  const resumed = restore(snapshot(live));
  for (let i = 0; i < 10; i++) {
    step(live);
    step(resumed);
  }
  expect(snapshot(resumed)).toBe(snapshot(live));
});
