import { expect, it } from 'vitest';
import { startClimb } from '../src/sim/climb.ts';
import { factsOf } from '../src/sim/debrief.ts';
import { playScripted } from './script.ts';

it('control: on Kestrel, roping up and fixing ropes changes the day', () => {
  const tally = (careful: boolean) => {
    let summit = 0;
    let home = 0;
    let hurt = 0;
    let fixed = 0;
    let roped = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = playScripted(startClimb(seed, 3, undefined, 'kestrel'), { turnAt: 12 * 60, careful });
      fixed += s.fixed.length;
      roped += s.journal.filter((j) => /tied in/.test(j.text)).length;
      for (const f of Object.values(factsOf(s))) {
        summit += +f.summit;
        home += +f.home;
        hurt += +(f.hurt > 0.15);
      }
    }
    return { summit, home, hurt, fixed, roped };
  };
  const plain = tally(false);
  const careful = tally(true);
  console.log({ plain, careful });
  expect(careful.fixed).toBeGreaterThan(0);
});
