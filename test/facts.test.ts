import { expect, it } from 'vitest';
import { dayAccount, startClimb } from '../src/sim/climb.ts';
import { factsOf, outcomeWords } from '../src/sim/debrief.ts';
import { MEMBERS } from '../src/sim/party.ts';

it('accounts and outcome words agree across authored home, summit and injury states', () => {
  const s = startClimb(1, 3);
  const dusk = dayAccount(s).dusk;
  // Host-only fixture for rendering/account logic, not a played climb.
  const [summit, late, out] = s.members;
  if (!summit || !late || !out) throw new Error('missing members');
  summit.summitAt = dusk - 100;
  summit.homeAt = dusk - 1;
  summit.injuries.push({
    severity: 0.8,
    leg: 'meadow',
    at: dusk - 50,
    caught: false,
  });
  late.homeAt = dusk + 1;
  out.homeAt = null;
  const account = dayAccount(s);
  const facts = factsOf(s);
  expect(account.out).toContain(out.id);
  expect(account.late).toContain(late.id);
  expect(account.line).toContain(MEMBERS.find((m) => m.id === out.id)!.name);
  expect(facts[summit.id]!.summit).toBe(true);
  expect(facts[summit.id]!.home).toBe(true);
  expect(outcomeWords(s, facts[summit.id]!)).toContain('reached the summit');
  expect(outcomeWords(s, facts[summit.id]!)).toContain('badly hurt');
  expect(facts[late.id]!.home).toBe(false);
  expect(outcomeWords(s, facts[late.id]!)).toContain('after dark');
  expect(outcomeWords(s, facts[out.id]!)).toContain('still on the mountain');
  out.homeAt = dusk;
  for (const member of s.members) if (member.homeAt === null) member.homeAt = dusk;
  expect(dayAccount(s).out).toEqual([]);
  expect(dayAccount(s).line).toContain('returned after dark');
});
