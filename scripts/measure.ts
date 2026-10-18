/**
 * Outcome measurement: the scripted leader (test/script.ts) on each peak, 12 seeds, turning at 12:00 and
 * fetching holdouts. Counts are people summed over the seeds (out of 60 per peak). Run: `npm run measure`.
 *
 * Definitions:
 * - On top: a member with a summit time (`summitAt !== null`).
 * - Summited after the turn: reached the top after the leader turned (`summitAt > leader.turnedAt`).
 * - Down by dark: back at the hut by dusk (sunset plus 45 minutes), per `dayAccount`: 5 minus those out and those late.
 * - Hurt: any injury of severity 0.15 or more (the game's `hurtLevel` reads this as "hurt" or "badly").
 * - Answers that disagree: answer lines to a player input (`input >= 0`) whose verdict is not 'assented',
 *   out of all answer lines to player inputs.
 */
import { dayAccount, startClimb } from '../src/sim/climb.ts';
import { playScripted } from '../test/script.ts';

const SEEDS = 12;
console.log('| Peak | On top | Down by dark | Hurt | Answers that disagree | Summited after the turn |');
console.log('|---|---|---|---|---|---|');
for (const mt of ['hollin', 'tooth', 'kestrel']) {
  let top = 0;
  let down = 0;
  let hurt = 0;
  let dis = 0;
  let ans = 0;
  let after = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const c = playScripted(startClimb(seed, 3, undefined, mt), { turnAt: 12 * 60 });
    const a = dayAccount(c);
    down += c.members.length - a.out.length - a.late.length;
    for (const m of c.members) {
      if (m.summitAt !== null) top++;
      if (m.summitAt !== null && c.leader.turnedAt !== null && m.summitAt > c.leader.turnedAt) after++;
      if (m.injuries.some((i) => i.severity >= 0.15)) hurt++;
    }
    const lines = c.lines.filter((l) => l.input >= 0);
    ans += lines.length;
    dis += lines.filter((l) => l.verdict !== 'assented').length;
  }
  console.log(`| ${mt} | ${top} | ${down} | ${hurt} | ${dis} of ${ans} | ${after} |`);
}
