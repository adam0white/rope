import { voiceOf } from '@adam0white/human-framework';
import { expect, it } from 'vitest';
import { queueInput } from '../src/sim/climb.ts';
import { newSeason, nextClimb } from '../src/sim/season.ts';
import { playScripted } from './script.ts';

it('control: three climbs back to back carry trust, hurt and the night out into the next morning', () => {
  const { season, climb } = newSeason(4);
  let c = climb;
  const report: string[] = [];
  for (let n = 1; n <= 3; n++) {
    // Climb 1: push hard and late (insist), so trust and injuries have something to carry.
    if (n === 1)
      for (let k = 0; k < 6; k++) queueInput(c, { t: 'say', to: 'all', act: 'climb', force: 'insist' });
    const played = playScripted(c, { turnAt: n === 1 ? 16 * 60 : 12 * 60 });
    const trust = played.people.map((p) => (voiceOf(p, 'leader')?.trust ?? 0.5).toFixed(2)).join(' ');
    report.push(`climb ${n} trust ${trust}`);
    const next = nextClimb(season, played, null);
    if (!next) break;
    const opening = next.journal.filter((j) => j.story).map((j) => j.text);
    report.push(`opening ${n + 1}: ${opening.join(' | ')}`);
    expect(next.people.map((p) => voiceOf(p, 'leader')?.trust)).toEqual(
      played.people.map((p) => voiceOf(p, 'leader')?.trust),
    );
    c = next;
  }
  console.log(report.join('\n'));
  expect(report.some((r) => r.startsWith('opening 2:') && r.length > 12)).toBe(true);
});
