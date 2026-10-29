import { expect, it } from 'vitest';
import { MOUNTAINS, posXY, queueInput, startClimb, step } from '../src/sim/climb.ts';

// Host-only second-leg positions and completed first-leg paths; public actions drive movement.
for (const mountain of ['hollin', 'tooth', 'kestrel']) {
  it(`turns halfway without a path jump on ${mountain}`, () => {
    const s = startClimb(1, 3, undefined, mountain);
    const leg = MOUNTAINS[mountain]!.legs.find((l) => l.from === 'hut')!;
    const second = MOUNTAINS[mountain]!.legs.find((l) => l.from === leg.to)!;
    for (const person of [...s.members, s.leader]) {
      person.pos = { place: null, leg: second.id, t: 0.5 };
      person.path = [leg.id];
    }
    const initial = posXY(s, s.leader.pos).alt;
    queueInput(s, { t: 'lead', dir: 'down' });
    const input = queueInput(s, { t: 'say', to: 'all', act: 'descend', force: 'insist' });
    const party = () => [
      ...s.members.map((person) => ({ id: person.id, person })),
      { id: 'leader', person: s.leader },
    ];
    const previous = new Map(party().map(({ id }) => [id, initial]));
    const descended = new Set<string>();
    for (let i = 0; i < 160; i++) {
      step(s);
      for (const { id, person } of party()) {
        const current = posXY(s, person.pos).alt;
        expect(Math.abs(current - previous.get(id)!), `${mountain} ${id} minute ${i}`).toBeLessThan(40);
        if (current < previous.get(id)! - 0.001) descended.add(id);
        previous.set(id, current);
      }
    }
    expect(posXY(s, s.leader.pos).alt).toBeLessThan(initial);
    const accepted = s.lines
      .filter((line) => line.input === input && line.verdict === 'assented')
      .map((line) => line.who);
    expect(s.members.some((person) => accepted.includes(person.id) && descended.has(person.id))).toBe(true);
  });
}
