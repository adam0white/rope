import { expect, it } from 'vitest';
import { dayAccount, hurtLevel, startClimb } from '../src/sim/climb.ts';
import { factsOf, outcomeWords } from '../src/sim/debrief.ts';
import { MEMBERS } from '../src/sim/party.ts';
import { playScripted } from './script.ts';

// Property: every end-of-day account renders from the same facts, so none can disagree.
for (const mountain of ['hollin', 'kestrel'] as const)
  it(`accounts agree across 12 seeds on ${mountain}`, () => {
    for (let seed = 1; seed <= 12; seed++) {
      const c = playScripted(startClimb(seed, 3, undefined, mountain), { turnAt: 12 * 60 });
      const acc = dayAccount(c);
      const facts = factsOf(c);
      const end = c.journal.filter((j) => /^Everyone was back|^Night fell/.test(j.text)).at(-1);
      expect(end?.text).toBe(acc.line);
      for (const mem of c.members) {
        const f = facts[mem.id];
        const name = MEMBERS.find((m) => m.id === mem.id)?.name ?? mem.id;
        if (!f) throw new Error('no facts');
        const words = outcomeWords(c, f);
        // Chips say "down" exactly when the day account does not list them out.
        expect(mem.homeAt !== null).toBe(!acc.out.includes(mem.id));
        if (acc.out.includes(mem.id)) expect(acc.line).toContain(name);
        if (f.summit) expect(words).not.toContain('turned back');
        if (mem.homeAt === null) expect(words).toContain('still on the mountain');
        else expect(words).not.toContain('still on the mountain');
        const lv = hurtLevel(f.hurt);
        expect(words.includes('badly hurt')).toBe(lv === 'badly');
        const slip = c.journal.filter((j) => j.text.startsWith(`${name} fell on`)).length;
        if (slip > 0) expect(lv).toBe('badly');
      }
    }
  });
