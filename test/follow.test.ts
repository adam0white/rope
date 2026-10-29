import { expect, it } from 'vitest';
import { distance, earshot, queueInput, startClimb, step } from '../src/sim/climb.ts';

// Control: "lead on" leads the party, and "walk to <name>" closes the gap to that person.
it('lead on keeps the party in earshot, and walk to closes on one person', () => {
  for (const seed of [1, 2, 3, 4]) {
    const s = startClimb(seed, 3);
    queueInput(s, { t: 'lead', dir: 'up' });
    queueInput(s, { t: 'say', to: 'all', act: 'climb', force: 'ask' });
    let apart = 0;
    for (let k = 0; k < 240; k++) {
      step(s);
      const climbing = s.members.filter((x) => x.homeAt === null && x.turnedAt === null);
      if (climbing.length && climbing.every((x) => distance(s, x.pos, s.leader.pos) > earshot(s))) apart++;
    }
    expect(apart).toBeLessThan(30);
    const far = [...s.members].sort(
      (a, b) => distance(s, b.pos, s.leader.pos) - distance(s, a.pos, s.leader.pos),
    )[0];
    if (!far) continue;
    const before = distance(s, far.pos, s.leader.pos);
    queueInput(s, { t: 'lead', dir: 'with', who: far.id });
    for (let k = 0; k < 90; k++) step(s);
    if (far.homeAt === null && before > earshot(s) * 0.5)
      expect(distance(s, far.pos, s.leader.pos)).toBeLessThan(Math.max(before, earshot(s)));
  }
}, 120000);
