/**
 * The debrief: the climb played again from its start with one of the player's inputs removed. The mountain is the
 * same (every world draw is keyed by place and minute), so what differs comes from that input and what the people
 * did with it, compounding. SCOPE: one input removed at a time, from a bounded candidate list; one branch shown, as
 * one simulated alternative. It does not search combinations or claim the alternative is what "would" surely have
 * happened.
 */
import { type ClimbState, clock, FACTS, type Input, MOUNTAINS, replay } from './climb.ts';
import { place } from './mountain.ts';
import { MEMBERS, memberOf } from './party.ts';

export interface PersonFacts {
  high: string;
  summit: boolean;
  home: boolean;
  homeAt: number | null;
  hurt: number;
  hurtWhere: string | null;
  turnedAt: number | null;
  turnedWhere: string | null;
}

export type Facts = Record<string, PersonFacts>;

export function factsOf(s: ClimbState): Facts {
  const m = MOUNTAINS[s.mountain];
  if (!m) throw new Error('no mountain');
  // Down before dark: sunset plus the 45 minutes of usable twilight.
  const dusk = s.day * 1440 + m.duskMinuteOfDay + 45;
  const out: Facts = {};
  for (const mem of s.members) {
    const worst = mem.injuries.reduce((a, b) => (b.severity > a.severity ? b : a), {
      severity: 0,
      leg: '',
      at: 0,
      caught: false,
    });
    const turnedEntry = s.journal.findLast(
      (j) => j.who === mem.id && j.text.includes('turned for home from'),
    );
    out[mem.id] = {
      high: mem.high,
      summit: mem.summitAt !== null,
      home: mem.homeAt !== null && mem.homeAt <= dusk,
      homeAt: mem.homeAt,
      hurt: worst.severity,
      hurtWhere: worst.leg ? (m.legs.find((l) => l.id === worst.leg)?.name ?? null) : null,
      turnedAt: mem.turnedAt,
      turnedWhere:
        mem.turnedAt !== null && turnedEntry
          ? (turnedEntry.text.split('turned for home from ')[1]?.replace(/\.$/, '') ?? null)
          : null,
    };
  }
  return out;
}

/** How much one person's climb differs between two runs: the outcomes a player cares about weigh most. */
function diffScore(a: PersonFacts, b: PersonFacts): number {
  let d = 0;
  if (a.summit !== b.summit) d += 3;
  if (a.home !== b.home) d += 4;
  if (Math.abs(a.hurt - b.hurt) > 0.15) d += 2 + Math.abs(a.hurt - b.hurt) * 2;
  if (a.high !== b.high) d += 1;
  if (a.homeAt !== null && b.homeAt !== null) d += Math.min(1, Math.abs(a.homeAt - b.homeAt) / 120);
  return d;
}

export interface Branch {
  input: number;
  who: string;
  score: number;
  /** "If you hadn't insisted at the col (10:40), Tamar would have turned back there." */
  sentence: string;
  /** What actually happened to them, in the same words. */
  actual: string;
  alternative: string;
}

/** The phrase for an input, from the player's side: "insisted that Tamar climb". */
export function inputPhrase(inp: Input): string {
  switch (inp.t) {
    case 'say': {
      const who = inp.to === 'all' ? 'everyone' : memberOf(inp.to).name;
      const verb = inp.force === 'ask' ? 'asked' : inp.force === 'urge' ? 'urged' : 'insisted that';
      const what: Record<string, string> = {
        climb: 'climb on',
        descend: 'turn back',
        rest: 'rest',
        eat: 'eat',
        wait: 'wait',
        rope: `rope up with ${inp.with ? memberOf(inp.with).name : 'someone'}`,
        pack: 'hand you the pack',
        ahead: 'go on ahead',
      };
      return inp.force === 'insist'
        ? `${verb} ${who} ${what[inp.act]}`
        : `${verb} ${who} to ${what[inp.act]}`;
    }
    case 'promise':
      return `promised to turn back at ${String(inp.hour).padStart(2, '0')}:00`;
    case 'tell':
      return `told them ${FACTS[inp.fact].words.replace(/\.$/, '')}`;
    case 'lead':
      return inp.dir === 'up'
        ? inp.via
          ? 'chose that way up'
          : 'led on'
        : inp.dir === 'down'
          ? 'turned back'
          : 'stopped';
    case 'fix':
      return 'fixed the rope';
    case 'scout':
      return 'went to look at the way up';
    case 'share':
      return `gave ${memberOf(inp.to).name} your food`;
  }
}

/** An outcome in words, without numbers: "stood on the top and was down by 16:20". */
export function outcomeWords(s: ClimbState, f: PersonFacts): string {
  const m = MOUNTAINS[s.mountain];
  if (!m) return '';
  const parts: string[] = [];
  if (f.summit) parts.push('stood on the top');
  else if (f.turnedWhere) parts.push(`turned back at ${f.turnedWhere}`);
  else parts.push(`got no higher than ${place(m, f.high).name}`);
  if (f.hurt > 0.4) parts.push(`was badly hurt on ${f.hurtWhere ?? 'the hill'}`);
  else if (f.hurt > 0.15) parts.push(`was hurt on ${f.hurtWhere ?? 'the hill'}`);
  if (f.home && f.homeAt !== null) parts.push(`was down by ${clock(f.homeAt)}`);
  else parts.push(`was still on the mountain at dark`);
  return parts.join(', ').replace(/, ([^,]*)$/, ' and $1');
}

/** Inputs worth replaying: the ones a person answered, and the leader's choices. Bounded. */
export function candidates(s: ClimbState, max = 24): number[] {
  const answered = new Set(s.lines.map((l) => l.input));
  const weight = (i: number): number => {
    const inp = s.inputs[i];
    if (!inp || s.unheard.includes(i)) return -1;
    if (inp.t === 'lead' && inp.dir === 'up' && !inp.via) return 0;
    if (inp.t === 'say' && !answered.has(i)) return -1;
    const nonAssent = s.lines.some((l) => l.input === i && l.verdict !== 'assented' && l.verdict !== 'heard');
    return (
      (inp.t === 'say' && inp.force === 'insist' ? 3 : 1) + (nonAssent ? 2 : 0) + (inp.t !== 'say' ? 1 : 0)
    );
  };
  return s.inputs
    .map((_, i) => i)
    .filter((i) => weight(i) > 0)
    .sort((a, b) => weight(b) - weight(a) || b - a)
    .slice(0, max)
    .sort((a, b) => a - b);
}

/** Try one counterfactual: the played run without input `i`. */
export function branchFor(startJson: string, played: ClimbState, i: number): Branch | null {
  const without = played.inputs.filter((_, j) => j !== i);
  const alt = replay(startJson, without);
  const a = factsOf(played);
  const b = factsOf(alt);
  let best: Branch | null = null;
  for (const x of MEMBERS) {
    const fa = a[x.id];
    const fb = b[x.id];
    if (!fa || !fb) continue;
    const score = diffScore(fa, fb);
    if (score < 1 || (best && best.score >= score)) continue;
    const inp = played.inputs[i];
    if (!inp) continue;
    const where = played.inputWhere[i] ?? 'the hill';
    const actual = outcomeWords(played, fa);
    const alternative = outcomeWords(alt, fb);
    best = {
      input: i,
      who: x.id,
      score,
      actual,
      alternative,
      sentence: `If you hadn't ${inputPhrase(inp)} at ${where} (${clock(inp.at)}), ${x.name} would have ${perfect(alternative)}. Instead, ${x.they} ${actual}.`,
    };
  }
  return best;
}

/** "stood on the top and was down by 16:20" → "stood on the top and been down by 16:20". */
function perfect(words: string): string {
  return words.replace(/\bwas\b/g, 'been');
}

/** The single most consequential branch among the candidates, or null when no one input changed an outcome. */
export function debrief(startJson: string, played: ClimbState, max = 24): Branch | null {
  let best: Branch | null = null;
  for (const i of candidates(played, max)) {
    const b = branchFor(startJson, played, i);
    if (b && (!best || b.score > best.score)) best = b;
  }
  return best;
}

export const ALTERNATIVE_CAPTION =
  'One simulated alternative: the same mountain, the same weather, with that one thing left unsaid. Small changes compound, so read it as a likely story, not a certainty.';
