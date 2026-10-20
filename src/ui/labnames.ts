/** Names the lab sees: short, stable, no player text. Only mountain ids and counts go in. */
import type { ClimbState } from '../sim/climb.ts';
import { factsOf } from '../sim/debrief.ts';

export const climbScreen = (c: Pick<ClimbState, 'climbNo' | 'mountain'>, part: 'hut' | 'climb' | 'debrief') =>
  `climb ${c.climbNo} ${c.mountain}: ${part}`;

/** Milestones a finished climb earned. Each name counts once per session in the lab client. */
export function climbMilestones(c: ClimbState): string[] {
  const facts = Object.values(factsOf(c));
  const out = [`climb ${c.climbNo} done`];
  if (facts.some((f) => f.summit)) out.push(`climb ${c.climbNo} summit`);
  if (facts.length > 0 && facts.every((f) => f.home)) out.push(`climb ${c.climbNo} all home`);
  return out;
}
