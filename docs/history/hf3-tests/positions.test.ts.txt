import { expect, it } from 'vitest';
import { posXY, startClimb } from '../src/sim/climb.ts';
import { playScripted } from './script.ts';

// Regression (first-time playtest, 2026-10-18): a leg turned back on halfway was popped off the path as if it had
// been climbed, so the next descent skipped a whole leg and the dot jumped. Nobody moves more than 40 m a minute.
it('positions move continuously on every peak', () => {
  for (const mt of ['hollin', 'tooth', 'kestrel'])
    for (let seed = 1; seed <= 12; seed++) {
      const last = new Map<string, number>();
      let worst = 0;
      playScripted(startClimb(seed, 3, undefined, mt), {
        turnAt: 12 * 60,
        extra: (s) => {
          for (const x of s.members) {
            const a = posXY(s, x.pos).alt;
            const b = last.get(x.id);
            if (b !== undefined) worst = Math.max(worst, Math.abs(a - b));
            last.set(x.id, a);
          }
        },
      });
      expect(worst, `${mt} seed ${seed}`).toBeLessThan(40);
    }
});
