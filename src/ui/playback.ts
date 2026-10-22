import type { ClimbState } from '../sim/climb.ts';
import { haltReason, hurtCall, promiseDue } from './calls.ts';
import { PACE } from './pace.ts';

/** Observe delivered words, injuries, calls, promises and arrivals, never private person scores. */
export function eventStamp(c: ClimbState): string {
  return JSON.stringify([
    c.lines.at(-1),
    c.journal.at(-1),
    c.leader.pos.place,
    c.members.map((m) => [m.id, m.pos.place, m.homeAt, m.summitAt, m.asks, m.injuries.length]),
    promiseDue(c),
    hurtCall(c),
    haltReason(c),
  ]);
}

export function attentionNeeded(c: ClimbState): boolean {
  return !!(
    hurtCall(c) ||
    promiseDue(c) ||
    haltReason(c) ||
    c.members.some((m) => m.asks && m.homeAt === null)
  );
}

/** UI time only. Choosing and reading wait; an unanswered call leaves time to respond. */
export function playbackRate(
  choosing: boolean,
  reading: boolean,
  attention: boolean,
  untilEvent: boolean,
  speed: 'slow' | 'normal' | 'fast' = 'normal',
): number {
  if (choosing || reading) return 0;
  if (attention) return PACE.attention;
  return untilEvent ? PACE.untilEvent : { slow: 0.15, normal: 0.8, fast: 2.4 }[speed];
}
