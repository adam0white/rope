import type { Person } from '@adam0white/human-framework';
import type { ClimbState } from '../src/sim/climb.ts';
import { proseBlanked } from './prose-proof.ts';

/** Exact alternatives from HF narrate/narrate.js and person.js. Each pair has
 * one meaning. Unknown wording stays exact. No semantic field becomes empty.
 */
export const intentionAlternatives = [
  ['because I feel like it', 'I am doing this because I feel like it.'],
  ['because you asked', 'I am doing this because you asked.'],
  ['out of habit', 'I am doing this out of habit.'],
  ['to be with people', 'I want to be with people.'],
  ['to drink', 'I want to drink.'],
  ['to feed myself', 'I want to feed myself.'],
  ['to keep my promise to Mum', 'I want to keep my promise to Mum.'],
  ['to keep my promise to you', 'I want to keep my promise to you.'],
  ['to rest', 'I want to rest.'],
  ['to sleep', 'I want to sleep.'],
  ['to keep my promise', 'I want to keep my promise.'],
  ['because you insisted', 'I am doing this because you insisted.'],
  ['because I was ordered to', 'I am doing this because I was ordered to.'],
] as const;
const recoveryAlternatives = [
  ['I went down and could not get up', 'I could not stand up.'],
  ['I got back on my feet', 'I could stand up again.'],
] as const;
function fixed(text: string, pairs: readonly (readonly [string, string])[]): string {
  return pairs.find(([, plain]) => plain === text)?.[0] ?? text;
}
export function intentionPayload(text: string): string {
  const goal = /^I want to achieve this goal: (.+)\.$/.exec(text);
  return goal ? `to ${goal[1]}` : fixed(text, intentionAlternatives);
}
export function outcomePayload(text: string): string {
  const outcome = /^I (completed|was interrupted during|could not complete) this action: (.+)\.$/.exec(text);
  if (!outcome) return fixed(text, recoveryAlternatives);
  const status = {
    completed: 'completed',
    'was interrupted during': 'interrupted',
    'could not complete': 'failed',
  }[outcome[1] ?? ''];
  return `${outcome[2]}: ${status}`;
}
export function counterOfferPayload(text: string): string {
  const task = /^after I finish this task \((.+)\)$/.exec(text);
  return task ? `after I ${task[1]}` : text;
}

/** Blank only presentation says/narration. Parse known semantic wrappers while
 * retaining complete action/goal/outcome payloads, records, IDs, time and RNG.
 * Engine stamp and narration opt-in are the two admitted metadata differences.
 */
export function narrationPeople(people: Person[]): Person[] {
  const copy = structuredClone(people);
  for (const p of copy) {
    if (p.engine === '2.17.0' || p.engine === '2.21.0') p.engine = '2.21.0';
    if (p.lexicon) delete p.lexicon.plainEnglish;
    for (const e of p.memory.episodes) e.summary = outcomePayload(e.summary);
    for (const i of p.conscience.intentions) i.intention = intentionPayload(i.intention);
    for (const r of p.trace) {
      r.narration = '';
      r.intention = intentionPayload(r.intention);
      if (r.suggestion) {
        r.suggestion.says = '';
        if (r.suggestion.counterOffer)
          r.suggestion.counterOffer.label = counterOfferPayload(r.suggestion.counterOffer.label);
      }
    }
    if (p.activity) {
      p.activity.intention = intentionPayload(p.activity.intention);
      for (const s of [
        ...(p.activity.suggestions ?? []),
        ...(p.activity.suggestion ? [p.activity.suggestion] : []),
      ]) {
        s.says = '';
        if (s.counterOffer) s.counterOffer.label = counterOfferPayload(s.counterOffer.label);
      }
    }
  }
  return copy;
}
export function narrationBlanked(state: ClimbState): ClimbState {
  const copy = proseBlanked(state);
  copy.people = narrationPeople(copy.people);
  return copy;
}
