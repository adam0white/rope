import { type ClimbState, MOUNTAINS } from '../sim/climb.ts';
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

/** Stops a skip for decisions and physical events, while ambient words remain in the journal. */
export function skipEventStamp(c: ClimbState): string {
  const m = MOUNTAINS[c.mountain];
  return JSON.stringify([
    c.lines.filter((line) => line.input >= 0),
    c.journal.filter((entry) =>
      /fell|slipped|turned for home|went down alone|stood on the summit|back at the hut/.test(entry.text),
    ),
    c.members.map((member) => [
      member.id,
      member.homeAt,
      member.summitAt,
      member.turnedAt,
      member.asks,
      member.injuries.length,
    ]),
    promiseDue(c),
    hurtCall(c),
    haltReason(c),
    !!m && c.minute >= c.day * 1440 + m.duskMinuteOfDay,
    c.over,
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
  speed: 'auto' | 'slow' | 'normal' | 'fast' = 'auto',
): number {
  if (choosing || reading) return 0;
  if (attention) return PACE.attention;
  return untilEvent ? PACE.untilEvent : { auto: 0.8, slow: 0.15, normal: 0.8, fast: 2.4 }[speed];
}
