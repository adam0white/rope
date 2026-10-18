/**
 * One climb: the party, the leader (the player's body on the mountain), the input log and a deterministic minute
 * step. SCOPE: each person is an HF person stepped every minute (tick, decide at activity end, review or a voice,
 * begin, finish). Positions, slips, weather and the rope are the host's world. Every answer a person gives comes
 * from an HF resolution: `answerNow` for refusals between decisions, otherwise the next `decide` with the
 * suggestion. World draws are keyed by (seed, kind, leg, minute, member), never by draw order. Not modelled: a
 * shared plan between people, carrying an injured person, ropes longer than one partner, navigation.
 */
import {
  type Affordance,
  adoptGoal,
  adoptVoiceTrust,
  answerNow,
  begin,
  type DecisionRecord,
  decide,
  finish,
  interrupt,
  knockDown,
  type Outcome,
  type Percept,
  type Person,
  perceive,
  predict,
  promise as promiseCommitment,
  type ReceivedConsequence,
  readPerson,
  reviewed,
  type Suggestion,
  type SuggestionResolution,
  tick,
  voiceOf,
} from '@adam0white/human-framework';
import {
  type Beat,
  coldAt,
  DESCENT_FACTOR,
  type Leg,
  legIndex,
  leg as legOf,
  legsUp,
  type Mountain,
  place as placeOf,
  SEASON,
  slipChance,
  sunAt,
  type Weather,
  weatherFor,
  windAt,
} from './mountain.ts';
import { createParty, LEADER, MEMBERS, memberOf } from './party.ts';
import { DRAW, hashUnit } from './rng.ts';

export const MOUNTAINS: Record<string, Mountain> = Object.fromEntries(SEASON.map((x) => [x.id, x]));

/** Where someone is: at a place, or on a leg at `t` (0 at its lower end, 1 at its upper end). */
export interface Pos {
  place: string | null;
  leg: string | null;
  t: number;
}

export interface Move {
  leg: string;
  dir: 'up' | 'down';
  fromT: number;
  toT: number;
  start: number;
  end: number;
}

export interface MemberState {
  id: string;
  pos: Pos;
  /** Legs climbed, last on top: descending retraces them. */
  path: string[];
  move: Move | null;
  rations: number;
  /** Carrying their own pack (false once the leader took it). */
  pack: boolean;
  ropedTo: string | null;
  /** Finished a rope-up at this minute, waiting for the partner. */
  ropeReady: { with: string; at: number } | null;
  /** A voice heard this minute, carried into exactly one decision. */
  pending: { s: Suggestion; input: number } | null;
  /** A deferred voice, weighed again once at their next fresh decision. */
  deferred: { s: Suggestion; input: number; until: number } | null;
  idleUntil: number;
  /** Highest place reached. */
  high: string;
  summitAt: number | null;
  homeAt: number | null;
  turnedAt: number | null;
  injuries: { at: number; severity: number; leg: string; caught: boolean }[];
}

export interface LeaderState {
  pos: Pos;
  path: string[];
  move: Move | null;
  fixing: { leg: string; until: number } | null;
  carrying: string[];
  rations: number;
  /** Route chosen at the fork: the leg id up from the fork. */
  route: string | null;
  turnedAt: number | null;
}

export type Force = 'ask' | 'urge' | 'insist';
export type Act = 'climb' | 'descend' | 'rest' | 'eat' | 'wait' | 'rope' | 'pack';
export type FactId = 'storm' | 'gully-quiet' | 'gully-loose' | 'ridge-solid' | 'descent-tiring';

export type Input =
  | { t: 'say'; at: number; to: string; act: Act; force: Force; via?: string; with?: string }
  | { t: 'promise'; at: number; hour: number }
  | { t: 'tell'; at: number; fact: FactId }
  | { t: 'lead'; at: number; dir: 'up' | 'down' | 'stop'; via?: string }
  | { t: 'fix'; at: number }
  | { t: 'share'; at: number; to: string };

/** An input before it is stamped with its minute. */
export type NewInput = Input extends infer I
  ? I extends Input
    ? Omit<I, 'at'> & { at?: number }
    : never
  : never;

export type Verdict = SuggestionResolution['verdict'];

/** A person-voiced answer, or a heard line in response to the player. */
export interface Line {
  at: number;
  who: string;
  input: number;
  verdict: Verdict | 'heard';
  kind?: string;
  reason: string;
  says: string;
}

export interface JournalEntry {
  at: number;
  text: string;
  who?: string;
  /** A line of the season's story. */
  story?: boolean;
}

export interface ClimbState {
  v: 1;
  seed: number;
  day: number;
  mountain: string;
  minute: number;
  startMinute: number;
  weather: Weather;
  people: Person[];
  members: MemberState[];
  leader: LeaderState;
  fixed: string[];
  promise: { at: number; hour: number; hearers: string[]; status: 'open' | 'kept' | 'broken' } | null;
  known: FactId[];
  told: Partial<Record<FactId, string[]>>;
  inputs: Input[];
  lines: Line[];
  journal: JournalEntry[];
  over: boolean;
  /** Inputs that could not apply (out of earshot, nothing to do), for the log. */
  unheard: number[];
  /** Which climb of the season this is, 1-based. */
  climbNo: number;
  /** Story beats already said. */
  beatsDone: string[];
  /** Where the leader stood when each input applied (place or leg name), for the debrief. */
  inputWhere: Record<number, string>;
}

export const EARSHOT = 260;
export const FORCE: Record<Force, number> = { ask: 0.35, urge: 0.7, insist: 0.9 };

const mountainOf = (s: ClimbState): Mountain => {
  const m = MOUNTAINS[s.mountain];
  if (!m) throw new Error(`no mountain ${s.mountain}`);
  return m;
};

export const personOf = (s: ClimbState, id: string): Person => {
  const p = s.people.find((x) => x.id === id);
  if (!p) throw new Error(`no person ${id}`);
  return p;
};

export const memberState = (s: ClimbState, id: string): MemberState => {
  const m = s.members.find((x) => x.id === id);
  if (!m) throw new Error(`no member state ${id}`);
  return m;
};

const at = (placeId: string): Pos => ({ place: placeId, leg: null, t: 0 });

/** Start a climb for a party (fresh, or carried over from the last climb). */
export function startClimb(
  seed: number,
  day: number,
  people?: Person[],
  mountainId = 'hollin',
  climbNo = 1,
): ClimbState {
  const m = MOUNTAINS[mountainId];
  if (!m) throw new Error(`no mountain ${mountainId}`);
  const start = day * 1440 + m.startMinuteOfDay;
  const party = people ?? createParty(seed, start - 30);
  for (const p of party) tick(p, start);
  const s: ClimbState = {
    v: 1,
    seed,
    day,
    mountain: mountainId,
    minute: start,
    startMinute: start,
    weather: weatherFor(seed, day),
    people: party,
    members: MEMBERS.map((x) => ({
      id: x.id,
      pos: at(m.hut),
      path: [],
      move: null,
      rations: 2,
      pack: true,
      ropedTo: null,
      ropeReady: null,
      pending: null,
      deferred: null,
      idleUntil: start,
      high: m.hut,
      summitAt: null,
      homeAt: null,
      turnedAt: null,
      injuries: [],
    })),
    leader: {
      pos: at(m.hut),
      path: [],
      move: null,
      fixing: null,
      carrying: [],
      rations: 3,
      route: null,
      turnedAt: null,
    },
    fixed: [],
    promise: null,
    known: [],
    told: {},
    inputs: [],
    lines: [],
    journal: [{ at: start, text: 'We left the hut in the dark, five of them and you.' }],
    over: false,
    unheard: [],
    inputWhere: {},
    climbNo,
    beatsDone: [],
  };
  if (climbNo === 1) for (const x of MEMBERS) s.journal.push({ at: start, text: x.first, who: x.id });
  beat(s, 'start');
  return s;
}

// ---------------------------------------------------------------- geometry

/** Horizontal metres along the trail, and the branch beyond the fork. */
function where(m: Mountain, p: Pos): { x: number; alt: number; branch: string | null } {
  if (p.place) {
    const pl = placeOf(m, p.place);
    return { x: pl.x, alt: pl.alt, branch: branchOfPlace(m, p.place) };
  }
  const lg = legOf(m, p.leg ?? '');
  const a = placeOf(m, lg.from);
  const b = placeOf(m, lg.to);
  return { x: a.x + (b.x - a.x) * p.t, alt: a.alt + (b.alt - a.alt) * p.t, branch: branchOfLeg(m, lg) };
}

/** The fork's place id (the place with two legs up), if any. */
export function forkOf(m: Mountain): string | null {
  for (const pl of m.places) if (legsUp(m, pl.id).length > 1) return pl.id;
  return null;
}

function branchOfLeg(m: Mountain, lg: Leg): string | null {
  const fork = forkOf(m);
  if (!fork) return null;
  let cur: Leg | undefined = lg;
  while (cur) {
    if (cur.from === fork) return cur.id;
    const from: string = cur.from;
    cur = m.legs.find((x) => x.to === from);
  }
  return null;
}

function branchOfPlace(m: Mountain, id: string): string | null {
  if (id === m.summit) return null;
  const lg = m.legs.find((x) => x.to === id);
  return lg ? branchOfLeg(m, lg) : null;
}

export function posXY(s: ClimbState, p: Pos): { x: number; alt: number } {
  const w = where(mountainOf(s), p);
  return { x: w.x, alt: w.alt };
}

/** Trail distance between two positions in metres (via the fork when on different branches). */
export function distance(s: ClimbState, a: Pos, b: Pos): number {
  const m = mountainOf(s);
  const wa = where(m, a);
  const wb = where(m, b);
  const fork = forkOf(m);
  if (fork && wa.branch && wb.branch && wa.branch !== wb.branch) {
    const fx = placeOf(m, fork).x;
    return Math.abs(wa.x - fx) + Math.abs(wb.x - fx) + Math.abs(wa.alt - wb.alt) * 0.3;
  }
  return Math.hypot(wa.x - wb.x, (wa.alt - wb.alt) * 1.5);
}

export function earshot(s: ClimbState): number {
  return EARSHOT * (1 - 0.5 * windAt(s.seed, s.weather, s.minute));
}

export const canHear = (s: ClimbState, id: string): boolean =>
  distance(s, memberState(s, id).pos, s.leader.pos) <= earshot(s);

function movePos(mv: Move, minute: number): Pos {
  const f = mv.end <= mv.start ? 1 : Math.min(1, Math.max(0, (minute - mv.start) / (mv.end - mv.start)));
  return { place: null, leg: mv.leg, t: mv.fromT + (mv.toT - mv.fromT) * f };
}

// ---------------------------------------------------------------- offers

const minuteOfDay = (s: ClimbState): number => s.minute - s.day * 1440;

/** How late and how wild it is, 0..1: what makes going down feel safe. */
function danger(s: ClimbState, alt: number): number {
  const mod = minuteOfDay(s);
  const late = Math.max(0, Math.min(1, (mod - 13 * 60) / (5 * 60)));
  const wind = windAt(s.seed, s.weather, s.minute);
  return Math.min(1, 0.5 * late + 0.6 * wind * Math.min(1, (alt - 1400) / 1200));
}

function pace(s: ClimbState, p: Person, mem: MemberState, lg: Leg): number {
  const body = readPerson(p).body;
  const wind = windAt(s.seed, s.weather, s.minute) * lg.exposure;
  return (1 / (0.35 + 0.65 * body.capacity)) * (1 + 0.4 * wind) * (mem.pack ? 1 : 0.88);
}

/** The leg a member would take up from here, given the leader's route at the fork. */
export function nextLegUp(
  s: ClimbState,
  mem: MemberState,
  route: string | null = s.leader.route,
): Leg | null {
  const m = mountainOf(s);
  if (mem.pos.leg) return legOf(m, mem.pos.leg);
  const ups = legsUp(m, mem.pos.place ?? '');
  return ups.find((l) => l.id === route) ?? ups[0] ?? null;
}

const actionUp = (m: Mountain, lg: Leg): string => (lg.to === m.summit ? 'summit' : 'climb');

function upOffer(s: ClimbState, p: Person, mem: MemberState, lg: Leg, fromT: number): Affordance {
  const m = mountainOf(s);
  const minutes = Math.max(3, Math.round(lg.minutes * (1 - fromT) * pace(s, p, mem, lg)));
  const fixed = s.fixed.includes(lg.id) ? 0.4 : 1;
  const chance = Math.min(0.6, slipChance(s.seed, s.weather, lg, s.minute) * minutes * fixed * 2.5);
  const summit = lg.to === m.summit;
  // Keeping up: going where the leader already is (or is heading) serves belonging.
  const ahead = posXY(s, s.leader.pos).alt > posXY(s, mem.pos).alt + 20 || s.leader.move?.dir === 'up';
  return {
    id: `up:${lg.id}`,
    action: actionUp(m, lg),
    label: `climb ${lg.name}`,
    placeId: lg.id,
    targetId: lg.to,
    duration: minutes,
    effort: lg.effort,
    advertises: {
      competence: 0.12,
      meaning: summit ? 0.35 : 0.08,
      esteem: summit ? 0.2 : 0.03,
      belonging: ahead ? 0.1 : -0.03,
      safety: -0.15 * danger(s, placeOf(m, lg.to).alt) - chance,
    },
    risk: { chance, severity: 0.5, kind: 'fall' },
    tags: ['outdoors', 'risky', 'work'],
    skill: { id: 'climbing', difficulty: 0.3 + lg.effort * 0.5 },
    requires: { moving: 0.3 },
  };
}

function downOffer(s: ClimbState, p: Person, mem: MemberState, lg: Leg, fromT: number): Affordance {
  const m = mountainOf(s);
  const minutes = Math.max(3, Math.round(lg.minutes * DESCENT_FACTOR * fromT * pace(s, p, mem, lg)));
  const d = danger(s, placeOf(m, lg.to).alt);
  return {
    id: `down:${lg.id}`,
    action: 'descend',
    label: `go down ${lg.name}`,
    placeId: lg.id,
    targetId: lg.from,
    duration: minutes,
    effort: lg.effort * 0.6,
    advertises: {
      safety: 0.05 + 0.45 * d,
      competence: 0.02,
      belonging: s.leader.move?.dir === 'down' || s.leader.turnedAt !== null ? 0.1 : -0.03,
    },
    tags: ['outdoors'],
    requires: { moving: 0.15 },
  };
}

const small = (id: string, action: string, label: string, duration: number, adv: Affordance['advertises']) =>
  ({ id, action, label, duration, effort: 0.05, advertises: adv, tags: ['rest'] }) satisfies Affordance;

/** What the mountain affords one member right now. */
export function offersFor(s: ClimbState, id: string): Affordance[] {
  const m = mountainOf(s);
  const p = personOf(s, id);
  const mem = memberState(s, id);
  const out: Affordance[] = [];
  const pos = mem.pos;
  const home = pos.place === m.hut && mem.path.length === 0 && mem.high !== m.hut;
  if (pos.leg) {
    const lg = legOf(m, pos.leg);
    out.push(upOffer(s, p, mem, lg, pos.t), downOffer(s, p, mem, lg, pos.t));
  } else if (!home && mem.homeAt === null) {
    for (const lg of legsUp(m, pos.place ?? '')) out.push(upOffer(s, p, mem, lg, 0));
    const back = mem.path[mem.path.length - 1];
    if (back) out.push(downOffer(s, p, mem, legOf(m, back), 1));
  }
  const atHut = pos.place === m.hut;
  // Staying put high on the hill late or in wind is honestly advertised as cold and exposed.
  const exposed = atHut ? 0 : danger(s, where(m, pos).alt);
  const stay = (a: Affordance): Affordance =>
    exposed < 0.05
      ? a
      : {
          ...a,
          advertises: { ...a.advertises, safety: (a.advertises.safety ?? 0) - 0.3 * exposed },
          risk: { chance: Math.min(0.5, 0.25 * exposed * (a.duration / 15)), severity: 0.4, kind: 'cold' },
        };
  out.push(stay(small('rest', 'rest', 'sit and rest', 15, { rest: 0.25 })));
  out.push(stay(small('drink', 'drink', 'drink', 4, { water: 0.35 })));
  out.push(stay(small('relieve', 'relieve', 'step aside', 4, { relief: 0.8 })));
  if (mem.rations > 0 || atHut) out.push(stay(small('eat', 'eat', 'eat something', 10, { food: 0.45 })));
  out.push(
    stay({
      ...small('wait', 'wait', 'wait for the others', 10, { belonging: 0.06 }),
      tags: ['social'],
    }),
  );
  // Rope and pack are the leader's ideas: offered only while the leader is asking for them.
  const asked = mem.pending?.s.affordanceId ?? '';
  for (const other of s.members) {
    if (other.id === id || asked !== `rope:${other.id}`) continue;
    if (mem.ropedTo === null && other.ropedTo === null && distance(s, pos, other.pos) < 40) {
      out.push({
        id: `rope:${other.id}`,
        action: 'rope',
        label: `rope up with ${memberOf(other.id).name}`,
        targetId: other.id,
        with: [other.id],
        duration: 5,
        effort: 0.1,
        advertises: { safety: 0.18, belonging: 0.06, autonomy: -0.04 },
        tags: ['social'],
      });
    }
  }
  if (asked === 'pack' && mem.pack && distance(s, pos, s.leader.pos) < 40) {
    out.push({
      ...small('pack', 'pack', 'hand my pack over', 2, { rest: 0.08, esteem: -0.06, autonomy: -0.03 }),
      targetId: LEADER,
    });
  }
  return out;
}

// ---------------------------------------------------------------- inputs

/** Record an input for the next minute and return its index. The UI and replays both go through this. */
export function queueInput(s: ClimbState, input: NewInput): number {
  const full = { ...input, at: input.at ?? s.minute + 1 } as Input;
  s.inputs.push(full);
  return s.inputs.length - 1;
}

function line(s: ClimbState, who: string, input: number, r: SuggestionResolution): void {
  s.lines.push({
    at: s.minute,
    who,
    input,
    verdict: r.verdict,
    ...(r.kind ? { kind: r.kind } : {}),
    reason: r.reason,
    says: r.says,
  });
  if (r.verdict !== 'assented') s.journal.push({ at: s.minute, who, text: journalFor(who, r) });
}

function journalFor(who: string, r: SuggestionResolution): string {
  const n = memberOf(who).name;
  switch (r.verdict) {
    case 'refused':
      return `${n} would not. “${r.says}”`;
    case 'deferred':
      return `${n} put you off. “${r.says}”`;
    case 'modified':
      return `${n} did something else instead. “${r.says}”`;
    case 'complied':
      return `${n} went, because you insisted.`;
    default:
      return `${n}: “${r.says}”`;
  }
}

/**
 * A person's answer to news (a told fact, a promise, a gift): how they now stand toward the act it bears on, read
 * from HF with `predict` (no state change, no randomness), in their own words. The reaction is not a suggestion
 * and books nothing.
 */
function reaction(
  s: ClimbState,
  id: string,
  input: number,
  act: 'climb' | 'descend' | 'eat',
  reason: string,
): void {
  const mem = memberState(s, id);
  const p = personOf(s, id);
  const sug: Suggestion =
    act === 'climb'
      ? (() => {
          const lg = nextLegUp(s, mem);
          return lg
            ? { voiceId: LEADER, affordanceId: `up:${lg.id}`, strength: 0.35 }
            : { voiceId: LEADER, action: 'climb', strength: 0.35 };
        })()
      : { voiceId: LEADER, action: act, strength: 0.35 };
  const r = predict(p, offersFor(s, id), sug);
  s.lines.push({
    at: s.minute,
    who: id,
    input,
    verdict: 'heard',
    ...(r.kind ? { kind: r.kind } : {}),
    reason: `${reason}:${r.verdict}`,
    says: r.says,
  });
}

function suggestionFor(s: ClimbState, mem: MemberState, inp: Extract<Input, { t: 'say' }>): Suggestion {
  const base = {
    voiceId: LEADER,
    strength: FORCE[inp.force],
    since: s.minute,
    ...(inp.force === 'insist' ? { insist: true } : {}),
  };
  switch (inp.act) {
    case 'climb': {
      const lg = nextLegUp(s, mem, inp.via ?? s.leader.route);
      return lg ? { ...base, affordanceId: `up:${lg.id}` } : { ...base, action: 'climb' };
    }
    case 'descend':
      return { ...base, action: 'descend' };
    case 'rope':
      return { ...base, affordanceId: `rope:${inp.with ?? ''}`, appeal: 'safety' };
    case 'pack':
      return { ...base, affordanceId: 'pack', appeal: 'rest' };
    default:
      return { ...base, action: inp.act };
  }
}

function applyInput(s: ClimbState, idx: number): void {
  const inp = s.inputs[idx];
  if (!inp) return;
  const m = mountainOf(s);
  const L = s.leader.pos;
  s.inputWhere[idx] = L.place ? placeOf(m, L.place).name : legOf(m, L.leg ?? '').name;
  switch (inp.t) {
    case 'say': {
      const targets = inp.to === 'all' ? s.members.map((x) => x.id) : [inp.to];
      let heard = 0;
      for (const id of targets) {
        const mem = memberState(s, id);
        if (mem.homeAt !== null || !canHear(s, id)) continue;
        heard += 1;
        const p = personOf(s, id);
        const sug = suggestionFor(s, mem, inp);
        const offers = offersFor(s, id);
        const { resolution, booked } = answerNow(p, offers, sug);
        if (booked) {
          line(s, id, idx, resolution);
          continue;
        }
        mem.pending = { s: sug, input: idx };
        mem.deferred = null;
        if (p.activity) interrupt(p, s.minute, 'voice:leader');
      }
      if (heard === 0) s.unheard.push(idx);
      return;
    }
    case 'promise': {
      const hearers = s.members.filter((x) => x.homeAt === null && canHear(s, x.id)).map((x) => x.id);
      if (hearers.length === 0) {
        s.unheard.push(idx);
        return;
      }
      const from = s.day * 1440 + inp.hour * 60;
      const label = `turning back at ${clock(from)}`;
      for (const id of hearers) {
        const p = personOf(s, id);
        perceive(p, [
          {
            at: s.minute,
            channel: 'told',
            kind: 'promise',
            actorId: LEADER,
            targetId: id,
            salience: 0.8,
            valence: 0.1,
            summary: `the leader said we turn back at ${clock(from)}`,
          },
        ]);
        promiseCommitment(p, {
          kind: 'promise',
          toId: LEADER,
          actions: ['descend'],
          from,
          until: from + 60,
          importance: 0.55,
          label,
        });
        reaction(s, id, idx, 'climb', 'promise');
      }
      s.promise = { at: s.minute, hour: inp.hour, hearers, status: 'open' };
      s.journal.push({
        at: s.minute,
        text: `You said we would turn back at ${clock(from)}, wherever we were.`,
      });
      return;
    }
    case 'tell': {
      if (!s.known.includes(inp.fact)) {
        s.unheard.push(idx);
        return;
      }
      const hearers = s.members.filter((x) => x.homeAt === null && canHear(s, x.id)).map((x) => x.id);
      if (hearers.length === 0) {
        s.unheard.push(idx);
        return;
      }
      for (const id of hearers) {
        perceive(personOf(s, id), [factPercept(s, inp.fact, id)]);
        reaction(s, id, idx, FACTS[inp.fact].bears, `told:${inp.fact}`);
      }
      s.told[inp.fact] = [...(s.told[inp.fact] ?? []), ...hearers];
      s.journal.push({ at: s.minute, text: `You told them: ${FACTS[inp.fact].words}` });
      return;
    }
    case 'lead':
      leaderGo(s, m, inp.dir, inp.via);
      return;
    case 'fix': {
      const L = s.leader;
      if (L.move || !L.pos.place) {
        s.unheard.push(idx);
        return;
      }
      const ups = legsUp(m, L.pos.place).filter((x) => x.fixable && !s.fixed.includes(x.id));
      const lg = ups.find((x) => x.id === L.route) ?? ups[0];
      if (!lg) {
        s.unheard.push(idx);
        return;
      }
      L.fixing = { leg: lg.id, until: s.minute + 25 };
      s.journal.push({ at: s.minute, text: `You began fixing a rope on ${lg.name}.` });
      return;
    }
    case 'share': {
      const mem = memberState(s, inp.to);
      if (s.leader.rations <= 0 || distance(s, mem.pos, s.leader.pos) > 40) {
        s.unheard.push(idx);
        return;
      }
      s.leader.rations -= 1;
      mem.rations += 1;
      perceive(personOf(s, inp.to), [
        {
          at: s.minute,
          channel: 'social',
          kind: 'gift',
          actorId: LEADER,
          targetId: inp.to,
          salience: 0.6,
          valence: 0.3,
          summary: 'the leader gave me food',
        },
      ]);
      reaction(s, inp.to, idx, 'eat', 'gift');
      s.journal.push({ at: s.minute, text: `You gave ${memberOf(inp.to).name} some of your food.` });
      return;
    }
  }
}

// ---------------------------------------------------------------- facts the leader can tell

export const FACTS: Record<FactId, { words: string; short: string; bears: 'climb' | 'descend' }> = {
  storm: {
    short: 'weather turning',
    bears: 'descend',
    words: 'cloud is building in the west; it will blow this afternoon.',
  },
  'gully-quiet': {
    short: 'gully quiet',
    bears: 'climb',
    words: 'the gully is in shade and quiet; from its top the summit is half an hour.',
  },
  'gully-loose': {
    short: 'gully loose',
    bears: 'descend',
    words: 'the sun is on the gully; stones are coming down.',
  },
  'ridge-solid': {
    short: 'ridge solid',
    bears: 'climb',
    words: 'the ridge is long but the rock is good; from the tower it is under an hour.',
  },
  'descent-tiring': {
    short: 'save strength',
    bears: 'descend',
    words: 'the way down is long. Keep something back for it.',
  },
};

function consequence(
  s: ClimbState,
  id: string,
  trigger: string,
  successor: string,
  chance: number,
): ReceivedConsequence {
  const m = mountainOf(s);
  const succ = legOf(m, successor);
  return {
    id,
    revision: s.minute,
    trigger: { action: 'climb', placeId: trigger, targetId: legOf(m, trigger).to },
    successor: {
      action: actionUp(m, succ),
      placeId: succ.id,
      targetId: succ.to,
      duration: succ.minutes,
      effort: succ.effort,
    },
    availableFrom: s.minute,
    availableUntil: s.day * 1440 + 18 * 60,
    expiresAt: s.day * 1440 + 20 * 60,
    chance,
    confidence: 0.7,
  };
}

function factPercept(s: ClimbState, fact: FactId, to: string): Percept {
  const base = {
    at: s.minute,
    channel: 'told' as const,
    kind: 'route',
    actorId: LEADER,
    targetId: to,
    salience: 0.75,
    summary: `the leader said ${FACTS[fact].words}`,
  };
  switch (fact) {
    case 'storm':
      return {
        ...base,
        kind: 'weather',
        valence: -0.3,
        claims: [{ prop: 'storm-this-afternoon', value: true, confidence: 0.7 }],
        threat: { severity: 0.5, chance: 0.6, sourceId: 'storm' },
      };
    case 'gully-quiet':
      return {
        ...base,
        valence: 0.2,
        claims: [{ prop: 'gully-safe', value: true, confidence: 0.7 }],
        consequences: [consequence(s, 'gully-route', 'gully', 'scramble', 0.85)],
      };
    case 'gully-loose':
      return {
        ...base,
        valence: -0.3,
        claims: [{ prop: 'gully-safe', value: false, confidence: 0.75 }],
        threat: { severity: 0.6, chance: 0.5, sourceId: 'gully' },
      };
    case 'ridge-solid':
      return {
        ...base,
        valence: 0.2,
        claims: [{ prop: 'ridge-good', value: true, confidence: 0.7 }],
        consequences: [consequence(s, 'ridge-route', 'ridge', 'step', 0.8)],
      };
    case 'descent-tiring':
      return {
        ...base,
        valence: -0.1,
        claims: [{ prop: 'descent-long', value: true, confidence: 0.8 }],
        threat: { severity: 0.3, chance: 0.5, sourceId: 'descent' },
      };
  }
}

/** What the leader knows now: from the sky and from where they have stood. */
function learn(s: ClimbState): void {
  const m = mountainOf(s);
  const add = (f: FactId) => {
    if (!s.known.includes(f)) s.known.push(f);
  };
  const mod = minuteOfDay(s);
  if (mod >= s.weather.stormAt - 180) add('storm');
  if (mod >= 9 * 60) add('descent-tiring');
  const fork = forkOf(m);
  const L = s.leader.pos;
  const nearFork = fork !== null && distance(s, L, at(fork)) < 120;
  if (nearFork) {
    add('ridge-solid');
    const sun = sunAt(s.weather, s.minute);
    const f: FactId = sun > 0.45 ? 'gully-loose' : 'gully-quiet';
    const other: FactId = f === 'gully-loose' ? 'gully-quiet' : 'gully-loose';
    s.known = s.known.filter((x) => x !== other);
    add(f);
  }
}

// ---------------------------------------------------------------- the minute step

export function clock(minute: number): string {
  const mod = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(mod / 60)).padStart(2, '0')}:${String(mod % 60).padStart(2, '0')}`;
}

/** Advance one minute. Deterministic in the state and the input log. */
export function step(s: ClimbState): void {
  if (s.over) return;
  const m = mountainOf(s);
  s.minute += 1;
  for (const p of s.people) tick(p, s.minute);
  stepLeader(s, m);
  learn(s);
  for (let i = 0; i < s.inputs.length; i++) if (s.inputs[i]?.at === s.minute) applyInput(s, i);
  slips(s, m);
  if ((s.minute - s.startMinute) % 15 === 0) sky(s, m);
  checkPromise(s);
  for (const mem of s.members) stepMember(s, m, mem);
  ropeCheck(s);
  quietLines(s, m);
  const allHome = s.members.every((x) => x.homeAt !== null) && s.leader.pos.place === m.hut;
  const left = s.members.some((x) => x.high !== m.hut);
  if ((allHome && left) || s.minute >= s.day * 1440 + 23 * 60) {
    s.over = true;
    s.journal.push({
      at: s.minute,
      text: allHome ? 'Everyone was back at the hut.' : 'Night came down on the mountain.',
    });
  }
}

/** Start the leader walking (or stop). Shared by the 'lead' input and the leader's own walking on. */
function leaderGo(s: ClimbState, m: Mountain, dir: 'up' | 'down' | 'stop', via?: string): void {
  const L = s.leader;
  if (L.move) L.pos = movePos(L.move, s.minute);
  L.move = null;
  L.fixing = null;
  if (dir === 'stop') return;
  const pos = L.pos;
  let lg: Leg | undefined;
  let fromT: number;
  if (dir === 'up') {
    if (pos.leg) lg = legOf(m, pos.leg);
    else {
      const ups = legsUp(m, pos.place ?? '');
      lg = ups.find((x) => x.id === (via ?? L.route)) ?? ups[0];
      if (lg && ups.length > 1) {
        if (L.route !== lg.id) s.journal.push({ at: s.minute, text: `You chose ${lg.name}.` });
        L.route = lg.id;
      }
    }
    if (!lg) return;
    fromT = pos.leg ? pos.t : 0;
    const mins = lg.minutes * (1 - fromT) * (1 + 0.12 * L.carrying.length) * 0.95;
    L.move = { leg: lg.id, dir: 'up', fromT, toT: 1, start: s.minute, end: s.minute + Math.max(2, mins) };
  } else {
    if (pos.leg) lg = legOf(m, pos.leg);
    else {
      const back = L.path[L.path.length - 1];
      if (back) lg = legOf(m, back);
    }
    if (!lg) return;
    fromT = pos.leg ? pos.t : 1;
    if (L.turnedAt === null && L.path.length > 0) L.turnedAt = s.minute;
    const mins = lg.minutes * DESCENT_FACTOR * fromT * (1 + 0.12 * L.carrying.length) * 0.95;
    L.move = {
      leg: lg.id,
      dir: 'down',
      fromT,
      toT: 0,
      start: s.minute,
      end: s.minute + Math.max(2, mins),
    };
  }
  if (pos.place) L.pos = { place: null, leg: lg.id, t: fromT };
  return;
}

function stepLeader(s: ClimbState, m: Mountain): void {
  const L = s.leader;
  if (L.fixing && s.minute >= L.fixing.until) {
    s.fixed.push(L.fixing.leg);
    s.journal.push({ at: s.minute, text: `The rope on ${legOf(m, L.fixing.leg).name} was fixed.` });
    L.fixing = null;
  }
  if (!L.move) return;
  // Going up, you keep to the party's pace: when the nearest of them behind drops out of earshot, you wait.
  if (L.move.dir === 'up') {
    const here = posXY(s, L.pos).alt;
    const behind = s.members.filter((x) => x.homeAt === null && posXY(s, x.pos).alt < here - 5);
    const near = s.members.some((x) => x.homeAt === null && distance(s, x.pos, L.pos) <= earshot(s) * 0.8);
    if (behind.length > 0 && !near) {
      L.move.start += 1;
      L.move.end += 1;
    }
  }
  L.pos = movePos(L.move, s.minute);
  if (s.minute >= L.move.end) {
    const lg = legOf(m, L.move.leg);
    const dir = L.move.dir;
    if (dir === 'up') {
      L.pos = at(lg.to);
      L.path.push(lg.id);
    } else {
      L.pos = at(lg.from);
      L.path.pop();
    }
    L.move = null;
    // Walk on until the fork, the top or the hut: the player stops you, or chooses the way at a fork.
    const here = L.pos.place ?? '';
    // Going up, you wait at a place when nobody behind is in earshot any more: you do not walk away from them.
    const company = s.members.some((x) => x.homeAt === null && canHear(s, x.id));
    if (dir === 'up' && here !== m.summit && legsUp(m, here).length === 1 && company) leaderGo(s, m, 'up');
    else if (dir === 'down' && L.path.length > 0) leaderGo(s, m, 'down');
  }
}

function stepMember(s: ClimbState, m: Mountain, mem: MemberState): void {
  const p = personOf(s, mem.id);
  if (!p.body.alive) return;
  if (mem.move) mem.pos = movePos(mem.move, s.minute);
  let a = p.activity;
  if (a && s.minute >= a.endsAt) {
    complete(s, m, mem, p, 'completed');
    a = null;
  }
  const due = mem.pending !== null || (a ? s.minute >= a.reviewAt : s.minute >= mem.idleUntil);
  if (!due) return;
  const offers = offersFor(s, mem.id).filter((o) => !a || o.id !== a.affordanceId);
  const fresh = !a;
  const voice =
    mem.pending ?? (fresh && mem.deferred && s.minute <= mem.deferred.until ? mem.deferred : null);
  const rec: DecisionRecord = decide(p, offers, voice ? { suggestion: voice.s } : {});
  if (voice) {
    const r = rec.suggestion;
    const wasDeferred = voice === mem.deferred;
    mem.pending = null;
    mem.deferred = null;
    if (r) {
      if (!wasDeferred || r.verdict !== 'deferred') line(s, mem.id, voice.input, r);
      if (r.verdict === 'deferred' && !wasDeferred)
        mem.deferred = { s: voice.s, input: voice.input, until: s.minute + 90 };
    }
  }
  if (a && rec.chosenAffordanceId === a.affordanceId) {
    reviewed(p);
    return;
  }
  const aff = offers.find((o) => o.id === rec.chosenAffordanceId);
  if (!aff) {
    if (!a) mem.idleUntil = s.minute + 5;
    else reviewed(p);
    return;
  }
  if (a) complete(s, m, mem, p, 'interrupted');
  if (!begin(p, aff, rec)) return;
  startMove(s, m, mem, aff);
}

function startMove(s: ClimbState, m: Mountain, mem: MemberState, aff: Affordance): void {
  const p = personOf(s, mem.id);
  const end = p.activity?.endsAt ?? s.minute + aff.duration;
  if (aff.id.startsWith('up:') || aff.id.startsWith('down:')) {
    const lg = legOf(m, aff.placeId ?? '');
    const up = aff.id.startsWith('up:');
    const fromT = mem.pos.leg ? mem.pos.t : up ? 0 : 1;
    if (!up && mem.turnedAt === null) {
      mem.turnedAt = s.minute;
      wantHome(s, p, mem.path.length + (mem.pos.leg ? 1 : 0));
      s.journal.push({
        at: s.minute,
        who: mem.id,
        text: `${memberOf(mem.id).name} turned for home from ${here(m, mem)}.`,
      });
    }
    mem.move = { leg: lg.id, dir: up ? 'up' : 'down', fromT, toT: up ? 1 : 0, start: s.minute, end };
    mem.pos = { place: null, leg: lg.id, t: fromT };
  } else {
    mem.move = null;
  }
}

/**
 * The top is halfway. Once someone stands on it or turns for home, getting down becomes their goal: an HF temporal
 * goal advanced by each leg of descent, so the hours left before dark weigh on it.
 */
function wantHome(s: ClimbState, p: Person, legsLeft: number): void {
  if (p.agenda.goals.some((g) => g.label === 'get down safely' && g.status === 'active')) return;
  adoptGoal(
    p,
    {
      label: 'get down safely',
      serves: ['safety', 'security'],
      advancedBy: [{ action: 'descend', amount: 1 / Math.max(1, legsLeft) }],
      importance: 0.7,
      temporal: { halfLifeMinutes: 180 },
      deadline: s.day * 1440 + mountainOf(s).duskMinuteOfDay,
    },
    s.minute,
  );
}

/** Say a story beat once. */
function beat(s: ClimbState, when: string): void {
  if (s.beatsDone.includes(when)) return;
  const b: Beat | undefined = mountainOf(s).beats.find((x) => x.when === when);
  if (!b) return;
  s.beatsDone.push(when);
  s.journal.push({ at: s.minute, text: b.text, ...(b.who ? { who: b.who } : {}), story: true });
  if (b.who && b.memory) {
    const p = personOf(s, b.who);
    perceive(p, [
      {
        at: s.minute,
        channel: 'saw',
        kind: 'memory',
        salience: 0.8,
        valence: -0.4,
        summary: b.memory.summary,
        threat: { severity: b.memory.severity, chance: b.memory.chance, sourceId: b.memory.sourceId },
      },
    ]);
  }
}

function here(m: Mountain, mem: MemberState): string {
  if (mem.pos.place) return placeOf(m, mem.pos.place).name;
  return legOf(m, mem.pos.leg ?? '').name;
}

/** End the running activity with an HF outcome built from what the world did. */
function complete(
  s: ClimbState,
  m: Mountain,
  mem: MemberState,
  p: Person,
  status: Outcome['status'],
  extra: Partial<Outcome> = {},
): void {
  const a = p.activity;
  if (!a) return;
  const out: Outcome = {
    affordanceId: a.affordanceId,
    action: a.action,
    status,
    at: s.minute,
    ...(a.targetId ? { targetId: a.targetId } : {}),
    ...(a.protest ? { quality: 0.6 } : {}),
    ...extra,
  };
  const mv = mem.move;
  if (mv) {
    mem.pos = movePos(mv, s.minute);
    if (status === 'completed') {
      const lg = legOf(m, mv.leg);
      if (mv.dir === 'up') {
        mem.pos = at(lg.to);
        mem.path.push(lg.id);
        if (placeOf(m, lg.to).alt > placeOf(m, mem.high).alt) mem.high = lg.to;
        beat(s, lg.to === m.summit ? 'summit' : lg.to);
        if (lg.to === m.summit && mem.summitAt === null) {
          mem.summitAt = s.minute;
          wantHome(s, p, mem.path.length);
          out.needs = { esteem: 0.25, meaning: 0.3, competence: 0.2 };
          s.journal.push({
            at: s.minute,
            who: mem.id,
            text: `${memberOf(mem.id).name} stood on the summit.`,
          });
          witness(s, mem.id, 'summit', `${memberOf(mem.id).name} reached the top`, 0.3, null);
        }
      } else {
        mem.pos = at(lg.from);
        mem.path.pop();
        if (lg.from === m.hut && mem.homeAt === null) {
          mem.homeAt = s.minute;
          s.journal.push({
            at: s.minute,
            who: mem.id,
            text: `${memberOf(mem.id).name} was back at the hut.`,
          });
        }
      }
    }
    mem.move = null;
  } else if (status === 'completed') {
    if (a.action === 'eat') {
      if (mem.pos.place !== m.hut) mem.rations = Math.max(0, mem.rations - 1);
      out.needs = { food: 0.45 };
    } else if (a.action === 'drink') out.needs = { water: 0.35 };
    else if (a.action === 'relieve') out.needs = { relief: 0.8 };
    else if (a.action === 'pack') {
      mem.pack = false;
      s.leader.carrying.push(mem.id);
      s.journal.push({ at: s.minute, who: mem.id, text: `${memberOf(mem.id).name} let you take the pack.` });
    } else if (a.action === 'rope' && a.targetId) {
      const other = memberState(s, a.targetId);
      if (other.ropeReady?.with === mem.id && s.minute - other.ropeReady.at <= 15 && other.ropedTo === null) {
        mem.ropedTo = other.id;
        other.ropedTo = mem.id;
        other.ropeReady = null;
        s.journal.push({
          at: s.minute,
          who: mem.id,
          text: `${memberOf(mem.id).name} and ${memberOf(other.id).name} tied in together.`,
        });
      } else mem.ropeReady = { with: other.id, at: s.minute };
    }
  }
  finish(p, out);
}

/** A rope comes off when the two drift apart. */
function ropeCheck(s: ClimbState): void {
  for (const mem of s.members) {
    if (!mem.ropedTo || mem.id > mem.ropedTo) continue;
    const other = memberState(s, mem.ropedTo);
    if (distance(s, mem.pos, other.pos) > 60) {
      s.journal.push({
        at: s.minute,
        who: mem.id,
        text: `The rope between ${memberOf(mem.id).name} and ${memberOf(other.id).name} came off as they went different ways.`,
      });
      mem.ropedTo = null;
      other.ropedTo = null;
    }
  }
}

/** Slips: keyed by leg, minute and member, so the same step at the same minute always goes the same way. */
function slips(s: ClimbState, m: Mountain): void {
  s.members.forEach((mem, idx) => {
    const mv = mem.move;
    if (!mv) return;
    const p = personOf(s, mem.id);
    const lg = legOf(m, mv.leg);
    const li = legIndex(m, lg.id);
    const fatigue = readPerson(p).body.fatigue;
    const c =
      slipChance(s.seed, s.weather, lg, s.minute) *
      (s.fixed.includes(lg.id) ? 0.4 : 1) *
      (p.activity?.protest ? 1.4 : 1) *
      (1 + fatigue) *
      (1.3 - (p.skills.climbing?.level ?? 0.5) * 0.6);
    if (hashUnit(s.seed, DRAW.slip, s.day, li, s.minute, idx) >= c) return;
    let sev = 0.12 + 0.55 * hashUnit(s.seed, DRAW.slipSeverity, s.day, li, s.minute, idx);
    const partner = mem.ropedTo ? memberState(s, mem.ropedTo) : null;
    const caught = partner !== null && distance(s, mem.pos, partner.pos) < 60;
    if (caught) sev *= 0.25;
    const name = memberOf(mem.id).name;
    mem.injuries.push({ at: s.minute, severity: sev, leg: lg.id, caught });
    const part =
      ['leg', 'arm', 'head'][Math.floor(hashUnit(s.seed, DRAW.slipPart, s.day, li, s.minute, idx) * 3)] ??
      'leg';
    if (caught && partner) {
      s.journal.push({
        at: s.minute,
        who: mem.id,
        text: `${name} slipped on ${lg.name}; ${memberOf(partner.id).name} held the rope.`,
      });
      perceive(p, [
        {
          at: s.minute,
          channel: 'social',
          kind: 'help',
          actorId: partner.id,
          targetId: mem.id,
          salience: 0.9,
          valence: 0.6,
          summary: `${memberOf(partner.id).name} held me on the rope`,
        },
      ]);
    } else {
      s.journal.push({
        at: s.minute,
        who: mem.id,
        text:
          sev > 0.45
            ? `${name} fell on ${lg.name} and lay still a long minute.`
            : `${name} slipped on ${lg.name} and got up hurt.`,
      });
    }
    if (sev >= 0.1) {
      complete(s, m, mem, p, 'failed', {
        injury: { part, severity: sev, healRatePerDay: 0.08 },
        percepts: [
          {
            at: s.minute,
            channel: 'felt',
            kind: 'fall',
            placeId: lg.id,
            salience: 1,
            valence: -0.7,
            threat: { severity: 0.6, chance: 0.4, sourceId: lg.id },
            summary: `I fell on ${lg.name}`,
          },
        ],
      });
      if (sev > 0.45) knockDown(p, { reason: 'fall', until: s.minute + 40 });
    }
    witness(s, mem.id, 'fall', `${name} fell on ${lg.name}`, sev, lg.id);
  });
}

/** Tell everyone near `who` what they saw. Salient sights bring their decisions forward. */
function witness(
  s: ClimbState,
  who: string,
  kind: string,
  summary: string,
  severity: number,
  source: string | null,
): void {
  const mem = memberState(s, who);
  for (const other of s.members) {
    if (other.id === who || other.homeAt !== null) continue;
    if (distance(s, mem.pos, other.pos) > 300) continue;
    const p = personOf(s, other.id);
    perceive(p, [
      {
        at: s.minute,
        channel: 'saw',
        kind,
        actorId: who,
        salience: 0.5 + severity * 0.5,
        valence: kind === 'fall' ? -0.5 : 0.3,
        summary,
        near: true,
        ...(kind === 'fall' && source ? { threat: { severity, chance: 0.4, sourceId: source } } : {}),
      },
    ]);
    if (kind === 'fall' && p.activity) interrupt(p, s.minute, 'percept:fall');
  }
}

/** Every quarter hour each person sees the sky and feels the air. */
function sky(s: ClimbState, m: Mountain): void {
  const wind = windAt(s.seed, s.weather, s.minute);
  for (const mem of s.members) {
    if (mem.homeAt !== null) continue;
    const w = where(m, mem.pos);
    const cold = coldAt(s.seed, s.weather, s.minute, w.alt);
    const percepts: Percept[] = [];
    if (wind > 0.3) {
      percepts.push({
        at: s.minute,
        channel: 'saw',
        kind: 'weather',
        salience: 0.3 + wind * 0.5,
        valence: -wind * 0.6,
        threat: { severity: wind * 0.7, chance: 0.5, sourceId: 'storm' },
        summary: wind > 0.6 ? 'the wind was tearing at us' : 'the wind was rising',
      });
    }
    if (cold > 0.55) {
      percepts.push({
        at: s.minute,
        channel: 'felt',
        kind: 'cold',
        salience: cold * 0.6,
        valence: -cold * 0.4,
        summary: 'I was cold',
      });
    }
    if (percepts.length) perceive(personOf(s, mem.id), percepts);
  }
}

function checkPromise(s: ClimbState): void {
  const pr = s.promise;
  if (pr?.status !== 'open') return;
  const deadline = s.day * 1440 + pr.hour * 60 + 30;
  const kept = s.leader.turnedAt !== null && s.leader.turnedAt <= deadline;
  if (!kept && s.minute < deadline) return;
  pr.status = kept ? 'kept' : 'broken';
  for (const id of pr.hearers) {
    const p = personOf(s, id);
    const trust = voiceOf(p, LEADER)?.trust ?? 0.5;
    // Host step (docs/hf-requests.md 2): HF has no rule for a voice keeping its own promise.
    adoptVoiceTrust(p, LEADER, Math.max(0, Math.min(1, trust + (kept ? 0.05 : -0.15))), 1);
    perceive(p, [
      {
        at: s.minute,
        channel: 'social',
        kind: kept ? 'promise-kept' : 'promise-broken',
        actorId: LEADER,
        targetId: id,
        salience: 0.8,
        valence: kept ? 0.3 : -0.5,
        summary: kept ? 'the leader turned back when they said' : 'the leader said two and kept going',
      },
    ]);
  }
  s.journal.push({
    at: s.minute,
    text: kept
      ? 'You turned when you said you would.'
      : `It was past ${clock(deadline - 30)} and you had not turned.`,
  });
}

/** Unprompted words are the journal's, not the people's: only the dusk prayer, quietly. */
function quietLines(s: ClimbState, m: Mountain): void {
  const mod = minuteOfDay(s);
  if (mod !== 19 * 60 + 5) return;
  const bilal = s.members.find((x) => x.id === 'bilal');
  if (!bilal) return;
  const where = bilal.pos.place ? placeOf(m, bilal.pos.place).name : 'the path';
  s.journal.push({
    at: s.minute,
    who: 'bilal',
    text: `At dusk Bilal stepped aside at ${where} to pray, then came back to the others.`,
  });
}

// ---------------------------------------------------------------- run and replay

export const snapshot = (s: ClimbState): string => JSON.stringify(s);
export const restore = (json: string): ClimbState => JSON.parse(json) as ClimbState;

/** Replay a start state with a list of inputs to the end of the climb. */
export function replay(startJson: string, inputs: readonly Input[], until?: number): ClimbState {
  const s = restore(startJson);
  s.inputs = inputs.map((x) => ({ ...x }));
  while (!s.over && (until === undefined || s.minute < until)) step(s);
  return s;
}

export function minuteOfDayOf(s: ClimbState): number {
  return minuteOfDay(s);
}
