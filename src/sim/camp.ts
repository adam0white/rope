/**
 * Camp talk: what the party says at the hut that night. The facts come from the played climb only: HF decision
 * records (each verdict, its reason and the person's own words) and the journal. The deterministic fallback is
 * written from those facts here; a model may voice the same facts (worker/index.ts), but its text is shown as
 * talk and never read back into state. SCOPE: one evening's few lines, after the climb. It does not change the
 * season, the people or any HF record.
 */
import { type ClimbState, clock } from './climb.ts';
import { factsOf, outcomeWords } from './debrief.ts';
import { memberOf } from './party.ts';

export interface CampFacts {
  mountain: string;
  /** One line per person: name, what happened to them. */
  people: string[];
  /** HF decision records that went against the leader, in the person's own words. */
  answers: string[];
  /** Journal lines, oldest first, capped. */
  journal: string[];
}

export function campFacts(s: ClimbState, mountainName: string): CampFacts {
  const f = factsOf(s);
  const people = s.members.map((m) => {
    const pf = f[m.id];
    return `${memberOf(m.id).name}: ${pf ? outcomeWords(s, pf) : 'unknown'}`;
  });
  const answers = s.lines
    .filter((l) => l.verdict !== 'assented' && l.verdict !== 'heard')
    .slice(-8)
    .map((l) => `${clock(l.at)} ${memberOf(l.who).name} (${l.verdict}, ${l.reason}): "${l.says}"`);
  const journal = s.journal.slice(-20).map((j) => `${clock(j.at)} ${j.text}`);
  return { mountain: mountainName, people, answers, journal };
}

/** The labelled fallback: the same facts, read out plainly, with no model. */
export function campFallback(c: CampFacts): string[] {
  const out = c.people.map((p) => `${p}.`);
  const last = c.answers.at(-1);
  if (last) out.push(`Someone remembered: ${last.replace(/^\S+ /, '')}`);
  else out.push('Nobody said much. It had been a long day.');
  return out;
}
