import {
  type ClimbState,
  canHear,
  distance,
  type MemberState,
  MOUNTAINS,
  memberState,
} from '../sim/climb.ts';
import { memberOf } from '../sim/party.ts';
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

/**
 * The pair named in the latest rope-up or close-up request, once both are out, untied and close enough to rope
 * (the same 40 m the request itself needs). Null while they are apart, so Skip stops when the window opens.
 */
export function ropeWindow(c: ClimbState): string[] | null {
  const ask = c.inputs.findLast((i) => i.t === 'say' && (i.act === 'rope' || i.act === 'gather'));
  if (ask?.t !== 'say' || !ask.with) return null;
  const a = memberState(c, ask.to);
  const b = memberState(c, ask.with);
  if (a.homeAt !== null || b.homeAt !== null || a.ropedTo !== null || b.ropedTo !== null) return null;
  return distance(c, a.pos, b.pos) < 40 ? [a.id, b.id] : null;
}

/** Public facts a Skip watches for, from the same reads the sheet uses: hearing, food and a rope-up window. */
export interface SkipFacts {
  hearing: [string, 'home' | 'near' | 'far'][];
  food: [string, boolean][];
  pair: string[] | null;
}

export function skipFacts(c: ClimbState): SkipFacts {
  return {
    hearing: c.members.map((m) => [m.id, m.homeAt !== null ? 'home' : canHear(c, m.id) ? 'near' : 'far']),
    food: c.members.map((m) => [m.id, m.rations > 0]),
    pair: ropeWindow(c),
  };
}

const names = (ids: string[]): string => {
  const all = ids.map((id) => memberOf(id).name);
  return all.length < 3 ? all.join(' and ') : `${all.slice(0, -1).join(', ')} and ${all.at(-1)}`;
};

/** Why a Skip stopped, in words, from the facts before the minute and the facts now. Empty when none changed. */
export function skipStopWords(before: SkipFacts, c: ClimbState): string {
  const after = skipFacts(c);
  const words: string[] = [];
  if (after.pair && after.pair.join() !== before.pair?.join())
    words.push(`${names(after.pair)} came close enough to rope up.`);
  if (before.pair && !after.pair) {
    // The window closed. Say why from where the two are now: still apart, one is at the hut, or one is now tied.
    const [a, b] = before.pair.map((id) => memberState(c, id)) as [MemberState, MemberState];
    const home = [a, b].find((m) => m.homeAt !== null);
    const tied = [a, b].find((m) => m.ropedTo !== null);
    if (home) words.push(`${memberOf(home.id).name} reached the hut.`);
    else if (tied)
      words.push(`${memberOf(tied.id).name} became tied to ${memberOf(tied.ropedTo ?? '').name}.`);
    else words.push(`${names(before.pair)} moved too far apart to rope up.`);
  }
  const kind = (facts: SkipFacts, id: string) => facts.hearing.find(([who]) => who === id)?.[1];
  const changed = (from: string, to: string) =>
    c.members.filter((m) => kind(before, m.id) === from && kind(after, m.id) === to).map((m) => m.id);
  const lost = changed('near', 'far');
  if (lost.length) words.push(`${names(lost)} can no longer hear you.`);
  const back = changed('far', 'near');
  if (back.length) words.push(`${names(back)} can hear you again.`);
  const had = (facts: SkipFacts, id: string) => facts.food.find(([who]) => who === id)?.[1];
  const out = c.members
    .filter((m) => m.homeAt === null && had(before, m.id) && !had(after, m.id))
    .map((m) => m.id);
  if (out.length) words.push(`${names(out)} ${out.length > 1 ? 'have' : 'has'} run out of food.`);
  return words.length ? `Skip stopped: ${words.join(' ')}` : '';
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
    // Who is in earshot, who still has food and an open rope-up window are things the player acts on.
    skipFacts(c),
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

/** The thing that holds time and Skip, in words: the same reads that make `attentionNeeded` true. */
export function attentionWords(c: ClimbState): string {
  const hurt = hurtCall(c);
  if (hurt) return `${memberOf(hurt.who).name} is hurt.`;
  const due = promiseDue(c);
  if (due) return `It is ${due.hour}:00, the time you promised to turn back.`;
  const asking = c.members
    .filter((m) => m.asks && m.homeAt === null)
    .sort((a, b) => (a.asks?.at ?? 0) - (b.asks?.at ?? 0))[0];
  if (asking) return `${memberOf(asking.id).name} wants to go down.`;
  return haltReason(c) ?? '';
}

/** UI time only. Choosing waits; reading slows to at most the attention rate; an unanswered call leaves time to respond. */
export function playbackRate(
  choosing: boolean,
  reading: boolean,
  attention: boolean,
  untilEvent: boolean,
  speed: 'auto' | 'slow' | 'normal' | 'fast' = 'auto',
): number {
  if (choosing) return 0;
  const base = { auto: 0.8, slow: 0.15, normal: 0.8, fast: 2.4 }[speed];
  if (reading) return Math.min(PACE.attention, base);
  return attention ? PACE.attention : untilEvent ? PACE.untilEvent : base;
}
