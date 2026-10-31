/**
 * One climb: the party, the leader (the player's body on the mountain), the input log and a deterministic minute
 * step. SCOPE: each person is an HF person stepped every minute (tick, decide at activity end, review or a voice,
 * begin, finish). Positions, slips, weather and the rope are the host's world. Every answer a person gives comes
 * from an HF resolution: `answerNow` for refusals between decisions, otherwise the next `decide` with the
 * suggestion. World draws are keyed by (seed, kind, leg, minute, member), never by draw order. Not modelled: a
 * negotiated route plans, carrying an injured person, ropes longer than one partner, navigation.
 */
import type { Input as HFInput, RunArchive, StepResult } from '@adam0white/human-framework';
import { canonicalPersona } from '@adam0white/lab-client';
import { type GatherPlan, type Segment, segmentMove, trailRoute } from './approach.ts';
import { commit, endGoal, forecast, interruptActivity, receive, setGoal } from './commands.ts';
import { DISCOVERIES } from './discoveries.ts';
import {
  type Activity,
  type Affordance,
  archiveOf,
  createClimbRun,
  enqueue,
  type FollowOn,
  FRAMEWORK_VERSION,
  MINUTE,
  type Outcome,
  type Percept,
  type Person,
  type ReceivedConsequence,
  readBladder,
  readPerson,
  type SimEvent,
  type Suggestion,
  type SuggestionResolution,
  stepPeople,
  syncReadings,
  type World,
} from './hf4.ts';
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
  routeName,
  SEASON,
  slipChance,
  sunAt,
  type Weather,
  weatherFor,
  windAt,
} from './mountain.ts';
import { createParty, LEADER, MEMBERS, memberOf } from './party.ts';
import { DRAW, hashUnit } from './rng.ts';

/** Cast edition of a climb's start. Climbs from another edition are refused, never converted. */
export const CAST_EDITION = 'rope-hf4-2';

function memberIn(s: ClimbState, id: string) {
  const member = memberOf(id);
  return !s.castEdition && id === 'tamar' ? { ...member, name: 'Tamar' } : member;
}

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
  /** Sent ahead: at the next place they reach going up, they call down what the way above looks like. */
  ahead?: boolean;
  /** Chose to go down with nobody going down beside them: they ask the leader who will come, and wait. */
  asks?: { at: number } | null;
  /** Nobody answered the ask in time: they go down alone. */
  alone?: boolean;
  /** Sent to go down with this person. */
  escortFor?: string | null;
  /** An explicit, finite rendezvous request; absent in all older input paths. */
  gather?: GatherPlan;
  /** A report exists only after physically completing the requested crossing. */
  escortMeeting?: {
    with: string;
    input: number;
    until: number;
    /** Actual original HF resolution, never a host-authored accepted flag. */
    answer?: SuggestionResolution;
    activity?: { id: string; startedAt: number };
  };
  /** Nearby company accepted after a real meeting; never invokes legacy auto-rope. */
  companyFor?: string;
  scoutReport?: { leg: string; at: number; words: string; fact?: FactId };
}

export interface LeaderState {
  pos: Pos;
  path: string[];
  move: Move | null;
  fixing: { leg: string; until: number } | null;
  /** Gone a little way up a leg to look at it, and back. */
  scouting?: { leg: string; until: number } | null;
  carrying: string[];
  rations: number;
  /** Route chosen at the fork: the leg id up from the fork. */
  route: string | null;
  turnedAt: number | null;
  /** Walking with someone: 'party' keeps to the middle of those still out, a member id walks to that person. */
  follow?: string | null;
  /** Explicit close approach; old pursuit keeps its original rules. */
  near?: string;
}

export type Force = 'ask' | 'urge' | 'insist';
export type Act =
  | 'climb'
  | 'descend'
  | 'rest'
  | 'eat'
  | 'wait'
  | 'rope'
  | 'pack'
  | 'ahead'
  | 'escort'
  | 'gather'
  | 'escort-reach'
  | 'scout-route'
  | 'drink'
  | 'relieve';
export type FactId = 'storm' | 'gully-quiet' | 'gully-loose' | 'ridge-solid' | 'descent-tiring';

export type Input =
  | { t: 'field-rules'; at: number; bladder: boolean }
  | { t: 'say'; at: number; to: string; act: Act; force: Force; via?: string; with?: string }
  | { t: 'promise'; at: number; hour: number }
  | { t: 'tell'; at: number; fact: FactId }
  | { t: 'lead'; at: number; dir: 'up' | 'down' | 'stop' | 'with' | 'near'; via?: string; who?: string }
  | { t: 'fix'; at: number }
  | { t: 'scout'; at: number; via?: string }
  | { t: 'share'; at: number; to: string }
  | { t: 'ask-life'; at: number; to: string }
  | { t: 'release-person'; at: number; to: string };

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

/** 1: original HF words; 2: host refusal causes; 3: truthful escort narration. */
export type NarrationVersion = 1 | 2 | 3;

export interface ClimbState {
  hf: RunArchive;
  hfQueue: HFInput[];
  hfOffers: Record<string, { revision: number; offers: Affordance[] }>;
  hfActive: Record<string, Activity>;
  hfEventCursor?: string;
  hfPhase?: {
    from: number;
    to: number;
    target: number;
    steps: number;
    lastNote?: JournalEntry;
    events?: SimEvent[];
    result?: StepResult;
  };
  hfLastDecision: Record<string, string>;
  hfRequests: Record<string, { kind: 'release' | 'life'; input: number; offer: Affordance }>;
  hfMode?: 'valley';
  hfReleased: Record<string, true>;
  /** Explicit input opt-in; absent in every legacy tape. HF owns bodily dynamics. */
  fieldRules?: {
    bladder: boolean;
    observations?: Partial<Record<FactId, { at: number; source: 'direct' | 'scout' }>>;
  };
  castEdition?: typeof CAST_EDITION;
  v: 1;
  /** Host rules version. Absent (1): climbs saved before HF 2.8.0. 2: fullness on, alongside, reconsider. */
  rules?: 2;
  /** Explicit override for replaying releases that predate the saved rules field. */
  narration?: NarrationVersion;
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

export const EARSHOT = 400;
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
  people?: import('@adam0white/human-framework').PersonAuthoring[],
  mountainId = 'hollin',
  climbNo = 1,
  continuing?: RunArchive,
  active: Record<string, Activity> = {},
): ClimbState {
  const m = MOUNTAINS[mountainId];
  if (!m) throw new Error(`no mountain ${mountainId}`);
  const start = day * 1440 + m.startMinuteOfDay;
  const party = people ?? createParty(seed, start);
  const s: ClimbState = {
    v: 1,
    castEdition: CAST_EDITION,
    hf: continuing as RunArchive,
    hfQueue: [],
    hfOffers: continuing
      ? Object.fromEntries(
          Object.entries(continuing.current.offers).map(([id, offer]) => [
            id,
            { revision: offer.revision, offers: [] },
          ]),
        )
      : {},
    hfActive: structuredClone(active),
    hfLastDecision: {},
    hfRequests: {},
    hfReleased: {},
    rules: 2,
    fieldRules: { bladder: true, observations: {} },
    seed,
    day,
    mountain: mountainId,
    minute: start,
    startMinute: start,
    weather: weatherFor(seed, day),
    people: [],
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
  if (continuing) syncReadings(s);
  else createClimbRun(s, party);
  // Climb 1 meets the party a person at a time: two at the hut door, the rest along the first leg (quietLines).
  if (climbNo === 1)
    for (const x of MEMBERS.slice(0, 2)) s.journal.push({ at: start, text: x.first, who: x.id });
  const wren = s.people.find((p) => p.id === 'wren');
  if (climbNo === 1 && wren && wren.body.satiety < 0.5)
    s.journal.push({
      at: start,
      who: 'wren',
      text: 'Wren had left without breakfast; she said she wasn’t hungry.',
    });
  if (continuing)
    for (const authored of party) {
      const p = personOf(s, authored.id);
      for (const goal of authored.state.agenda.goals)
        enqueue(s, 'agenda.requested', {
          person: p.id,
          request: { type: 'goal', goal: { ...goal, id: `${goal.id}:climb:${climbNo}` } },
        });
    }
  aims(s, m);
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
  return EARSHOT * (1 - 0.35 * windAt(s.seed, s.weather, s.minute));
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
  const late = Math.max(0, Math.min(1, (mod - 12 * 60) / (5 * 60)));
  const wind = windAt(s.seed, s.weather, s.minute);
  return Math.min(1, 0.5 * late + 0.6 * wind * Math.min(1, (alt - 1400) / 1200));
}

function pace(s: ClimbState, p: Person, mem: MemberState, lg: Leg, roped = true, down = false): number {
  // A rope team moves at the pace of its slower member.
  if (roped && mem.ropedTo) {
    const o = memberState(s, mem.ropedTo);
    return Math.max(pace(s, p, mem, lg, false, down), pace(s, personOf(s, o.id), o, lg, false, down));
  }
  const body = readPerson(p).body;
  const wind = windAt(s.seed, s.weather, s.minute) * lg.exposure;
  // Going down, tiredness slows you less than climbing does: gravity helps (at worst about 1.7x, not 2.9x).
  const legs = down ? 1 / (0.6 + 0.4 * body.capacity) : 1 / (0.35 + 0.65 * body.capacity);
  return legs * (1 + 0.4 * wind) * (mem.pack ? 1 : 0.88);
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
      belonging: (ahead ? 0.1 : -0.03) + ropeTug(s, mem, 'up'),
      safety: -0.15 * danger(s, placeOf(m, lg.to).alt) - chance,
    },
    risk: { chance, severity: 0.5, kind: 'fall' },
    followedBy: [descentAfter(s, mem, lg)],
    tags: ['outdoors', 'risky', 'work'],
    skill: { id: 'climbing', difficulty: 0.3 + lg.effort * 0.5 },
    requires: { moving: 0.3 },
  };
}

/**
 * Tied to a partner: going where they go serves belonging, going the other way (or on while they stop) costs it.
 * HF weighs it like any other appeal; the rope itself decides nothing.
 */
/** Rules 2 (HF 2.8.0): climbs started from this build. Older saves and exports replay under the old rules. */
const rules2 = (s: ClimbState): boolean => (s.rules ?? 1) >= 2;
const narrationVersion = (s: ClimbState): NarrationVersion => s.narration ?? (rules2(s) ? 3 : 1);

/** A roped person's offers that go the way the partner is going are 'alongside' the partner. */
function alongsidePartner(s: ClimbState, mem: MemberState, offers: Affordance[]): Affordance[] {
  if (!rules2(s) || !mem.ropedTo) return offers;
  const partner = mem.ropedTo;
  const dir = memberState(s, partner).move?.dir ?? 'stay';
  return offers.map((o) => {
    const d = o.id.startsWith('up:')
      ? 'up'
      : o.id.startsWith('down:')
        ? 'down'
        : o.id.startsWith('rope:') || o.id === 'pack'
          ? null
          : 'stay';
    return d === dir ? { ...o, alongside: [partner] } : o;
  });
}

function ropeTug(s: ClimbState, mem: MemberState, dir: 'up' | 'down' | 'stay'): number {
  if (!mem.ropedTo) return 0;
  const o = memberState(s, mem.ropedTo);
  const theirs = o.move?.dir ?? 'stay';
  return theirs === dir ? 0.3 : -0.3;
}

/** The way back to the hut after climbing `lg`: every leg climbed so far, plus this one, going down. */
function descentAfter(s: ClimbState, mem: MemberState, lg: Leg): FollowOn {
  const m = mountainOf(s);
  const legs = [...mem.path.map((id) => legOf(m, id)), lg];
  const minutes = legs.reduce((a, l) => a + l.minutes * DESCENT_FACTOR, 0);
  const effort = legs.reduce((a, l) => a + l.effort, 0) / legs.length;
  return { label: 'the descent', duration: Math.round(minutes), effort: effort * 0.6 };
}

function downOffer(s: ClimbState, p: Person, mem: MemberState, lg: Leg, fromT: number): Affordance {
  const m = mountainOf(s);
  const minutes = Math.max(
    3,
    Math.round(lg.minutes * DESCENT_FACTOR * fromT * pace(s, p, mem, lg, true, true)),
  );
  const d = danger(s, placeOf(m, lg.to).alt);
  return {
    id: `down:${lg.id}`,
    action: 'descend',
    label: s.fieldRules && mem.pos.leg === lg.id ? `turn back down ${lg.name}` : `go down ${lg.name}`,
    placeId: lg.id,
    targetId: lg.from,
    duration: minutes,
    effort: lg.effort * 0.6,
    advertises: {
      safety: 0.05 + 0.45 * d,
      competence: 0.02,
      belonging:
        (s.leader.move?.dir === 'down' || s.leader.turnedAt !== null ? 0.1 : -0.03) + ropeTug(s, mem, 'down'),
      // Pride: for someone who cares what others think of her nerve, being the first to turn costs face.
      ...(mem.id === 'wren' &&
      mem.turnedAt === null &&
      !s.members.some((x) => x.turnedAt !== null || x.summitAt !== null) &&
      s.leader.turnedAt === null
        ? { esteem: -0.3 }
        : {}),
    },
    tags: ['outdoors'],
    requires: { moving: 0.15 },
  };
}

const small = (id: string, action: string, label: string, duration: number, adv: Affordance['advertises']) =>
  ({ id, action, label, duration, effort: 0.05, advertises: adv, tags: ['rest'] }) satisfies Affordance;

/** What the mountain affords one member right now. */
export function offersFor(s: ClimbState, id: string, asking?: string): Affordance[] {
  const m = mountainOf(s);
  const p = personOf(s, id);
  const mem = memberState(s, id);
  const out: Affordance[] = [];
  const pos = mem.pos;
  // A carried routine is a real, costed HF opportunity at the hut.
  if (s.minute < mem.idleUntil && pos.place === m.hut)
    return [
      small('arrival-preparation', 'wait', 'prepare at the hut', mem.idleUntil - s.minute, {
        belonging: 0.06,
      }),
    ];
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
  const tug = ropeTug(s, mem, 'stay');
  const stay = (a0: Affordance): Affordance => {
    const a = tug
      ? { ...a0, advertises: { ...a0.advertises, belonging: (a0.advertises.belonging ?? 0) + tug } }
      : a0;
    return exposed < 0.05
      ? a
      : {
          ...a,
          advertises: { ...a.advertises, safety: (a.advertises.safety ?? 0) - 0.3 * exposed },
          risk: { chance: Math.min(0.5, 0.25 * exposed * (a.duration / 15)), severity: 0.4, kind: 'cold' },
        };
  };
  out.push(stay(small('rest', 'rest', 'sit and rest', 15, { rest: 0.25 })));
  out.push(stay(small('drink', 'drink', 'drink', 4, { water: 0.35 })));
  // HF reads `relief` as relief from pain, not the toilet, and has no bladder (2.8.0 triage): from rules 2 there is
  // no "step aside" offer, since an offer that advertises nothing is only ever chosen as filler.
  if (!rules2(s)) out.push(stay(small('relieve', 'relieve', 'step aside', 4, { relief: 0.8 })));
  // Optional HF storage/intake/choice faculty, never a host urge clock or pain relief.
  // Only settled footing permits stepping aside; completion confirms actual voiding.
  if (s.fieldRules?.bladder && readBladder(p) && !pos.leg && !mem.ropedTo)
    out.push(
      stay({ ...small('relieve', 'relieve', 'step aside behind the rocks', 4, {}), voidsBladder: true }),
    );
  if (mem.rations > 0 || atHut) out.push(stay(small('eat', 'eat', 'eat something', 10, { food: 0.45 })));
  out.push(
    stay({
      ...small('wait', 'wait', 'wait for the others', 10, { belonging: 0.06 }),
      tags: ['social'],
    }),
  );
  // Rope and pack are the leader's ideas: offered only while the leader is asking for them.
  const asked = asking ?? (mem.pending ?? mem.deferred)?.s.affordanceId ?? '';
  if (
    mem.gather &&
    s.minute < mem.gather.until &&
    (asked === `gather:${mem.gather.with}` || p.activity?.affordanceId === `gather:${mem.gather.with}`) &&
    gatherRoute(s, mem, mem.gather.point).reduce((n, x) => n + x.minutes, 0) <= mem.gather.until - s.minute
  )
    out.push(
      mem.escortMeeting
        ? {
            ...gatherOffer(s, mem, mem.gather),
            label: `reach ${memberIn(s, mem.gather.with).name}, then consider going down together`,
          }
        : gatherOffer(s, mem, mem.gather),
    );
  if (
    s.fieldRules &&
    (asked === 'scout-route' || asked.startsWith('scout:') || p.activity?.affordanceId.startsWith('scout:'))
  ) {
    const lg = nextLegUp(s, mem);
    if (lg && !mem.ropedTo && mem.homeAt === null) {
      const walk = upOffer(s, p, mem, lg, mem.pos.leg ? mem.pos.t : 0);
      out.push({
        ...walk,
        id: `scout:${lg.id}`,
        label: `cross ${lg.name} and report what I find`,
        advertises: { ...walk.advertises, belonging: 0.12 },
        action: 'climb',
      });
    }
  }
  for (const other of s.members) {
    if (other.id === id || asked !== `rope:${other.id}`) continue;
    if (mem.ropedTo === null && other.ropedTo === null && distance(s, pos, other.pos) < 40) {
      out.push({
        id: `rope:${other.id}`,
        action: 'rope',
        label: `rope up with ${memberIn(s, other.id).name}`,
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
  drainAdvance(s);
  const full = { ...input, at: input.at ?? s.minute + 1 } as Input;
  s.inputs.push(full);
  return s.inputs.length - 1;
}

function line(s: ClimbState, who: string, input: number, r: SuggestionResolution): void {
  const mission = memberState(s, who).escortMeeting;
  if (
    mission?.input === input &&
    s.inputs[input]?.t === 'say' &&
    (s.inputs[input] as Extract<Input, { t: 'say' }>).act === 'escort-reach' &&
    !mission.activity
  ) {
    if (r.verdict === 'assented' || r.verdict === 'complied') mission.answer = structuredClone(r);
    else if (r.verdict !== 'deferred') {
      delete memberState(s, who).escortMeeting;
      delete memberState(s, who).gather;
    }
  }
  const says = withCause(s, who, input, r, withForecast(s, who, input, r, withPromise(s, who, r)));
  // Reconsidering the same standing request across an interruption is one
  // outward answer unless HF changes its verdict or reason.
  if (
    s.lines.some(
      (l) => l.who === who && l.input === input && l.verdict === r.verdict && l.reason === r.reason,
    )
  )
    return;
  s.lines.push({
    at: s.minute,
    who,
    input,
    verdict: r.verdict,
    ...(r.kind ? { kind: r.kind } : {}),
    reason: r.reason,
    says,
  });
  if (s.fieldRules && ['assented', 'complied'].includes(r.verdict)) {
    const current = s.inputs[input];
    if (current?.t === 'say' && ['climb', 'descend'].includes(current.act)) {
      const opposite = current.act === 'climb' ? 'descend' : 'climb';
      const previous = s.lines.findLast((l) => {
        if (l.who === who || s.minute - l.at > 10 || !canHear(s, l.who)) return false;
        const request = s.inputs[l.input];
        return (
          (opposite === 'descend' && l.reason === 'asks:company') ||
          (request?.t === 'say' && request.act === opposite && ['assented', 'complied'].includes(l.verdict))
        );
      });
      if (
        previous &&
        canHear(s, who) &&
        distance(s, memberState(s, who).pos, memberState(s, previous.who).pos) <= earshot(s)
      ) {
        const key = `exchange:${[who, previous.who].sort().join(':')}`;
        if (!s.beatsDone.includes(key)) {
          s.beatsDone.push(key);
          s.journal.push({
            at: s.minute,
            story: true,
            text: `${memberIn(s, previous.who).name} had said: “${previous.says}” When you asked ${memberIn(s, who).name} to ${current.act === 'climb' ? 'climb on' : 'turn back'}, ${memberIn(s, who).they} answered: “${says}”`,
          });
          // Both utterances were actually spoken within reach, not read from either mind.
          for (const [listener, speaker, words] of [
            [who, previous.who, previous.says],
            [previous.who, who, says],
          ])
            if (listener && speaker && words)
              receive(s, personOf(s, listener), [
                {
                  at: s.minute,
                  channel: 'social',
                  kind: 'speech',
                  actorId: speaker,
                  targetId: listener,
                  summary: `${memberIn(s, speaker).name} said: “${words}”`,
                  salience: 0.5,
                },
              ]);
        }
      }
    }
  }
  if (r.verdict !== 'assented')
    s.journal.push({ at: s.minute, who, text: journalFor(s, who, { ...r, says }) });
}

/**
 * A reasoned no to climbing: when HF weighed the person's own forecast of their body through the way down
 * (`forecast:body`, 2.5.0) or a reason of their own (a need, a goal, a promise), they add HF's first-person forecast line ("I can do it, but I'll be spent for the descent").
 */
function withForecast(
  s: ClimbState,
  who: string,
  input: number,
  r: SuggestionResolution,
  says: string,
): string {
  const yes = r.verdict === 'assented' || r.verdict === 'complied';
  const inp = s.inputs[input];
  if (inp?.t !== 'say' || (inp.act !== 'climb' && inp.act !== 'ahead')) return says;
  const mem = memberState(s, who);
  const lg = nextLegUp(s, mem, inp.via ?? s.leader.route);
  if (!lg) return says;
  const p = personOf(s, who);
  const fc = forecast(s, p, upOffer(s, p, mem, lg, mem.pos.leg ? mem.pos.t : 0));
  if (!fc.line) return says;
  // A yes with a hard descent ahead says so now, while turning is still cheap: the warning comes early.
  if (yes) return /\b(but|though|won't|can't)\b/.test(fc.line) ? `${says} ${fc.line}` : says;
  if (!/^(forecast|need|goal|commitment):/.test(r.reason)) return says;
  return `${says} ${fc.line}`;
}

/**
 * When HF refuses because the act is not on offer (`unavailable`), the person says what the host knows is missing:
 * the partner is too far off to tie to, or their food is gone. The verdict stays HF's; only the plain cause is added,
 * so the player can learn what "not here" meant (owner playtest 2026-10-18).
 */
function withCause(s: ClimbState, who: string, input: number, r: SuggestionResolution, says: string): string {
  // Narrator 1 saved HF's original words before host cause narration was added.
  if (narrationVersion(s) < 2 || r.reason !== 'unavailable') return says;
  const inp = s.inputs[input];
  if (inp?.t !== 'say') return says;
  const mem = memberState(s, who);
  if (inp.act === 'rope') {
    const other = inp.to === who ? inp.with : inp.to;
    if (!other || other === who) return says;
    const o = memberState(s, other);
    const name = memberIn(s, other).name;
    if (o.ropedTo !== null || mem.ropedTo !== null) return `${says} One of us is already attached to a rope.`;
    if (distance(s, mem.pos, o.pos) >= 40)
      return `${says} ${name} is too far away to attach to the same rope.`;
    return says;
  }
  if (s.fieldRules && inp.act === 'pack' && distance(s, mem.pos, s.leader.pos) >= 40)
    return `${says} You are too far away to take my pack. Walk closer first.`;
  if (inp.act === 'eat' && mem.rations <= 0) return `${says} I have no food left.`;
  return says;
}

/**
 * When HF names a commitment as the reason (`commitment:<id>`), the person says which promise, quoting the label of
 * that HF commitment record. The verdict and reason stay HF's; only the record's own words are added.
 */
function withPromise(s: ClimbState, who: string, r: SuggestionResolution): string {
  const id = r.reason.startsWith('commitment:') ? r.reason.slice('commitment:'.length) : r.commitmentId;
  if (!id || r.verdict === 'assented') return r.says;
  const c = personOf(s, who).agenda.commitments.find((x) => x.id === id);
  return c?.label ? `${r.says} I promised: ${c.label}.` : r.says;
}

function journalFor(s: ClimbState, who: string, r: SuggestionResolution): string {
  const n = memberIn(s, who).name;
  switch (r.verdict) {
    case 'refused':
      return `${n} refused your request. “${r.says}”`;
    case 'deferred':
      return `${n} asked you to wait. “${r.says}”`;
    case 'modified':
      return `${n} did something else instead. “${r.says}”`;
    case 'complied':
      return `${n} did it because you insisted.`;
    default:
      return `${n}: “${r.says}”`;
  }
}

/** News prompts a genuine public HF suggestion. Its later resolution supplies the answer. */
function reaction(
  s: ClimbState,
  id: string,
  input: number,
  act: 'climb' | 'descend' | 'eat',
  _reason: string,
): void {
  const mem = memberState(s, id);
  const sug: Suggestion =
    act === 'climb'
      ? (() => {
          const lg = nextLegUp(s, mem);
          return lg
            ? { voiceId: LEADER, affordanceId: `up:${lg.id}`, strength: 0.35 }
            : { voiceId: LEADER, action: 'climb', strength: 0.35 };
        })()
      : { voiceId: LEADER, action: act, strength: 0.35 };
  mem.pending = { s: { ...sug, since: s.minute }, input };
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
    case 'escort':
      return { ...base, action: 'descend' };
    case 'escort-reach':
      return {
        ...base,
        affordanceId: s.fieldRules ? `gather:${inp.with ?? ''}` : 'escort-unavailable',
        appeal: 'belonging',
      };
    case 'gather':
      return { ...base, affordanceId: `gather:${inp.with ?? ''}`, appeal: 'belonging' };
    case 'rope':
      return { ...base, affordanceId: `rope:${inp.with ?? ''}`, appeal: 'safety' };
    case 'pack':
      return { ...base, affordanceId: 'pack', appeal: 'rest' };
    case 'scout-route': {
      const lg = nextLegUp(s, mem);
      return { ...base, affordanceId: lg && s.fieldRules ? `scout:${lg.id}` : 'scout-unavailable' };
    }
    case 'ahead': {
      const lg = nextLegUp(s, mem, inp.via ?? s.leader.route);
      return lg ? { ...base, affordanceId: `up:${lg.id}` } : { ...base, action: 'climb' };
    }
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
    case 'field-rules': {
      // An explicit logged choice, never inferred from a package upgrade or loaded actor.
      if (s.fieldRules || s.minute > s.startMinute + 1) return;
      s.fieldRules = { bladder: inp.bladder };
      // Every HF4 bodily faculty is on from authoring; this records only the host rules input.
      return;
    }
    case 'say': {
      // A rope ties two: the request goes to both, each asked to rope up with the other.
      const targets =
        inp.to === 'all'
          ? s.members.map((x) => x.id)
          : (inp.act === 'rope' || inp.act === 'gather') && inp.with
            ? [inp.to, inp.with]
            : [inp.to];
      for (const id of targets) {
        const mem = memberState(s, id);
        if (!mem.escortMeeting || !canHear(s, id) || mem.homeAt !== null) continue;
        delete mem.escortMeeting;
        if (mem.gather && personOf(s, id).activity?.affordanceId.startsWith('gather:'))
          complete(s, m, mem, personOf(s, id), 'interrupted');
        else delete mem.gather;
      }
      if (s.fieldRules && inp.act === 'escort-reach' && inp.to !== 'all' && inp.with && inp.to !== inp.with) {
        const helper = memberState(s, inp.to);
        const target = memberState(s, inp.with);
        if (canHear(s, helper.id) && helper.homeAt === null && target.homeAt === null) {
          const point = { ...target.pos };
          const segments = gatherRoute(s, helper, point);
          const until = s.minute + Math.ceil(segments.reduce((n, x) => n + x.minutes, 0)) + 10;
          helper.gather = { with: target.id, point, segments, started: s.minute, until };
          helper.escortMeeting = { with: target.id, input: idx, until };
        }
      }
      if (inp.act === 'gather' && inp.with && inp.to !== 'all' && inp.to !== inp.with) {
        const a = memberState(s, inp.to);
        const b = memberState(s, inp.with);
        for (const x of [a, b]) {
          const p = personOf(s, x.id);
          if (
            x.homeAt === null &&
            canHear(s, x.id) &&
            x.gather &&
            p.activity?.affordanceId.startsWith('gather:')
          )
            complete(s, m, x, p, 'interrupted');
        }
        const point = { ...a.pos };
        const routes = [a, b].map((x) => gatherRoute(s, x, point));
        const duration = Math.ceil(Math.max(...routes.map((r) => r.reduce((n, x) => n + x.minutes, 0)))) + 10;
        for (const [i, x] of [a, b].entries())
          if (canHear(s, x.id) && x.homeAt === null)
            x.gather = {
              with: x.id === a.id ? b.id : a.id,
              point,
              segments: routes[i] ?? [],
              started: s.minute,
              until: s.minute + duration,
            };
      }
      let heard = 0;
      for (const id of targets) {
        const mem = memberState(s, id);
        if (mem.homeAt !== null || !canHear(s, id)) continue;
        heard += 1;
        if (inp.act === 'ahead') mem.ahead = true;
        if (inp.act === 'escort') mem.escortFor = inp.with ?? null;
        const sug = suggestionFor(
          s,
          mem,
          (inp.act === 'rope' || inp.act === 'gather') && id === inp.with ? { ...inp, with: inp.to } : inp,
        );
        mem.pending = { s: sug, input: idx };
        mem.deferred = null;
      }
      if (heard === 0) s.unheard.push(idx);
      return;
    }
    case 'release-person':
    case 'ask-life': {
      const p = personOf(s, inp.to),
        mem = memberState(s, inp.to);
      if (!p.body.alive || (inp.t === 'release-person' && (!s.over || mem.pos.place !== m.hut))) {
        s.journal.push({
          at: s.minute,
          who: inp.to,
          text: `${p.name} cannot end this chapter away from the hut or during the climb.`,
        });
        return;
      }
      const release = inp.t === 'release-person',
        clue = DISCOVERIES[inp.to];
      if (!release && (!clue || !canHear(s, inp.to))) {
        s.unheard.push(idx);
        return;
      }
      const offer: Affordance = {
        id: release ? 'end-chapter' : 'private-talk',
        action: release ? 'rest' : 'talk',
        label: release ? 'end this mountain chapter at the hut' : `talk about ${clue!.topic}`,
        duration: 5,
        effort: 0.02,
        placeId: mem.pos.place ?? mem.pos.leg ?? m.hut,
        advertises: release
          ? { rest: 0.6, safety: 0.5, leisure: 0.3 }
          : { belonging: 0.6, leisure: 0.4, meaning: 0.2 },
        tags: release ? ['rest'] : ['social'],
      };
      s.hfRequests[inp.to] = { kind: release ? 'release' : 'life', input: idx, offer };
      mem.pending = {
        s: { voiceId: LEADER, affordanceId: offer.id, strength: 0.35, since: s.minute },
        input: idx,
      };
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
        receive(s, p, [
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
        commit(s, p, {
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
        receive(s, personOf(s, id), [factPercept(s, inp.fact, id)]);
        reaction(s, id, idx, FACTS[inp.fact].bears, `told:${inp.fact}`);
      }
      s.told[inp.fact] = [...(s.told[inp.fact] ?? []), ...hearers];
      s.journal.push({ at: s.minute, text: `You told the party, “${FACTS[inp.fact].words}”` });
      return;
    }
    case 'lead':
      if (inp.dir === 'near') {
        if (!inp.who || !s.members.some((x) => x.id === inp.who && x.homeAt === null)) return;
        leaderGo(s, m, 'stop');
        s.leader.follow = null;
        s.leader.near = inp.who;
        s.journal.push({ at: s.minute, text: `You started walking close to ${memberIn(s, inp.who).name}.` });
        return;
      }
      if (s.leader.near) delete s.leader.near;
      if (inp.dir === 'with') {
        s.leader.follow = inp.who ?? 'party';
        leaderGo(s, m, 'stop');
        s.journal.push({
          at: s.minute,
          text:
            s.leader.follow === 'party'
              ? 'You stayed with the party.'
              : `You went to ${memberIn(s, s.leader.follow).name}.`,
        });
        return;
      }
      s.leader.follow = null;
      leaderGo(s, m, inp.dir, inp.via);
      // Turning answers anyone asking for company within earshot: the party is going down with them.
      if (inp.dir === 'down')
        for (const x of s.members)
          if (x.asks && canHear(s, x.id)) {
            x.asks = null;
            s.journal.push({
              at: s.minute,
              who: x.id,
              text: `You turned for home, and ${memberIn(s, x.id).name} had someone to walk down with.`,
            });
          }
      return;
    case 'scout': {
      const L = s.leader;
      if (L.move || !L.pos.place) {
        s.unheard.push(idx);
        return;
      }
      const ups = legsUp(m, L.pos.place);
      const lg = ups.find((x) => x.id === (inp.via ?? L.route)) ?? ups[0];
      if (!lg) {
        s.unheard.push(idx);
        return;
      }
      L.scouting = { leg: lg.id, until: s.minute + Math.max(10, Math.round(lg.minutes * 0.4)) };
      s.journal.push({ at: s.minute, text: `You went a little way up ${routeName(lg)} to look.` });
      return;
    }
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
      s.journal.push({ at: s.minute, text: `You began fixing a rope on ${routeName(lg)}.` });
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
      receive(s, personOf(s, inp.to), [
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
      s.journal.push({ at: s.minute, text: `You gave ${memberIn(s, inp.to).name} some of your food.` });
      return;
    }
  }
}

// ---------------------------------------------------------------- facts the leader can tell

export const FACTS: Record<FactId, { words: string; short: string; bears: 'climb' | 'descend' }> = {
  storm: {
    short: 'weather turning',
    bears: 'descend',
    words: 'Clouds are building in the west. The wind will get stronger this afternoon.',
  },
  'gully-quiet': {
    short: 'shaded rock channel',
    bears: 'climb',
    words: 'The rock channel is shaded and quiet. From its top, the summit is about half an hour away.',
  },
  'gully-loose': {
    short: 'falling stones',
    bears: 'descend',
    words: 'The sun is on the rock channel. Stones are falling.',
  },
  'ridge-solid': {
    short: 'ridge solid',
    bears: 'climb',
    words: 'The ridge is long, but the rock is solid. From the tower, the summit is less than an hour away.',
  },
  'descent-tiring': {
    short: 'save strength',
    bears: 'descend',
    words: 'The way down is long. Save some strength for it.',
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

// These words belong to HF memory records. Changing them would change saved person state.
const FACT_RECORD_WORDS: Record<FactId, string> = {
  storm: 'cloud is building in the west; it will blow this afternoon.',
  'gully-quiet': 'the gully is in shade and quiet; from its top the summit is half an hour.',
  'gully-loose': 'the sun is on the gully; stones are coming down.',
  'ridge-solid': 'the ridge is long but the rock is good; from the tower it is under an hour.',
  'descent-tiring': 'the way down is long. Keep something back for it.',
};

function factPercept(s: ClimbState, fact: FactId, to: string): Percept {
  const base = {
    at: s.minute,
    channel: 'told' as const,
    kind: 'route',
    actorId: LEADER,
    targetId: to,
    salience: 0.75,
    summary: `the leader said ${FACT_RECORD_WORDS[fact]}`,
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
    if (s.fieldRules) {
      s.fieldRules.observations ??= {};
      s.fieldRules.observations[f] = { at: s.minute, source: 'direct' };
    }
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

/** What a leg looks like now, from the world itself (sun on loose rock, wind on exposure, footing). */
export function legReport(s: ClimbState, lg: Leg): string {
  const sun = sunAt(s.weather, s.minute);
  const wind = windAt(s.seed, s.weather, s.minute);
  const bits: string[] = [];
  if (lg.rockfall * sun > 0.3) bits.push('stones were coming down');
  if (lg.exposure * wind > 0.4) bits.push('strong wind blew across it');
  if (lg.footing > 0.015) bits.push('it was difficult to keep a secure foothold');
  const name = routeName(lg);
  return bits.length
    ? `On ${name}, ${bits.join(', ').replace(/, ([^,]*)$/, ' and $1')}`
    : `${name[0]?.toUpperCase()}${name.slice(1)} looked safe to walk on`;
}

/** Seeing a leg up close makes its route facts known (for telling the others). */
function learnLeg(s: ClimbState, lg: Leg): void {
  const add = (f: FactId) => {
    if (s.fieldRules) {
      s.fieldRules.observations ??= {};
      s.fieldRules.observations[f] = { at: s.minute, source: 'direct' };
    }
    if (!s.known.includes(f)) s.known.push(f);
  };
  if (lg.id === 'ridge') add('ridge-solid');
  if (lg.id === 'gully') {
    const f: FactId = lg.rockfall * sunAt(s.weather, s.minute) > 0.3 ? 'gully-loose' : 'gully-quiet';
    s.known = s.known.filter((x) => x !== (f === 'gully-loose' ? 'gully-quiet' : 'gully-loose'));
    add(f);
  }
}

// ---------------------------------------------------------------- the minute step

export function clock(minute: number): string {
  const mod = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(mod / 60)).padStart(2, '0')}:${String(Math.floor(mod % 60)).padStart(2, '0')}`;
}

/** The frame path yields after each admitted public HF call. The synchronous
 * path drains the same generator, so save/replay preserve identical chunking. */
const pendingSteps = new WeakMap<ClimbState, Generator<void, void, void>>();
export function advanceFrame(s: ClimbState): boolean {
  let pending = pendingSteps.get(s);
  if (!pending) {
    pending = stepping(s);
    pendingSteps.set(s, pending);
  }
  const result = pending.next();
  if (result.done) {
    pendingSteps.delete(s);
    return true;
  }
  return false;
}
export function drainAdvance(s: ClimbState): void {
  let pending = pendingSteps.get(s);
  if (!pending && s.hfPhase) pending = stepping(s);
  if (!pending) return;
  let result = pending.next();
  while (!result.done) result = pending.next();
  pendingSteps.delete(s);
}
export function step(s: ClimbState): void {
  if (pendingSteps.has(s) || s.hfPhase) {
    drainAdvance(s);
    return;
  }
  const generator = stepping(s);
  let result = generator.next();
  while (!result.done) result = generator.next();
}
function* stepping(s: ClimbState): Generator<void, void, void> {
  const m = mountainOf(s),
    resuming = !!s.hfPhase;
  if (
    s.over &&
    !resuming &&
    !Object.keys(s.hfRequests).length &&
    !s.hfQueue.length &&
    !s.inputs.some((i) => i.t === 'release-person' && i.at === s.minute + 1)
  )
    return;
  const target = s.hfPhase?.to ?? s.minute + 1;
  if (!resuming) {
    s.minute = target;
    if (!s.over) {
      stepLeader(s, m);
      learn(s);
    }
    for (let i = 0; i < s.inputs.length; i++) if (s.inputs[i]?.at === s.minute) applyInput(s, i);
    if (!s.over) {
      slips(s, m);
      if ((s.minute - s.startMinute) % 15 === 0) sky(s, m);
      checkPromise(s);
      for (const member of s.members) stepMember(s, m, member);
    }
    s.minute = target - 1;
  }
  const suggestions = Object.fromEntries(
    s.members.flatMap((mem) => {
      const pending = mem.pending ?? mem.deferred;
      return pending ? [[mem.id, pending.s]] : [];
    }),
  );
  yield* stepPeople(s, makeWorld, target, suggestions);
  s.minute = target;
  delete s.hfPhase;
  if (s.over) return;
  ropeCheck(s);
  quietLines(s, m);
  const allHome = s.members.every((x) => x.homeAt !== null) && s.leader.pos.place === m.hut;
  const left = s.members.some((x) => x.high !== m.hut);
  if ((allHome && left) || s.minute >= s.day * 1440 + 23 * 60) {
    s.over = true;
    s.journal.push({ at: s.minute, text: dayAccount(s).line });
  }
}

/** Hurt, in the one set of words every account uses: the journal at the slip, the read-back, the next morning. */
export type HurtLevel = 'none' | 'knock' | 'hurt' | 'badly';
export function hurtLevel(severity: number): HurtLevel {
  return severity >= 0.4 ? 'badly' : severity >= 0.15 ? 'hurt' : severity > 0 ? 'knock' : 'none';
}

/** The end of the day, once: who is down, who was down by dark (sunset plus 45 minutes of twilight), and the line. */
export function dayAccount(s: ClimbState): {
  dusk: number;
  out: string[];
  late: string[];
  line: string;
  stamp: string;
} {
  const m = mountainOf(s);
  const dusk = s.day * 1440 + m.duskMinuteOfDay + 45;
  const out = s.members.filter((x) => x.homeAt === null).map((x) => x.id);
  const late = s.members.filter((x) => x.homeAt !== null && x.homeAt > dusk).map((x) => x.id);
  const names = (ids: string[]) =>
    ids
      .map((id) => memberIn(s, id).name)
      .join(', ')
      .replace(/, ([^,]*)$/, ' and $1');
  const line =
    out.length === 0
      ? late.length === 0
        ? 'Everyone was back at the hut.'
        : `Everyone was back at the hut. ${names(late)} returned after dark.`
      : `Night fell while ${names(out)} remained on the mountain.`;
  const stamp =
    out.length === 0
      ? late.length === 0
        ? 'Everyone is back.'
        : 'Everyone is back, after dark.'
      : out.length === 1
        ? `${names(out)} is still on the mountain.`
        : `${out.length === 5 ? 'All five people' : `${out.length} people`} are still on the mountain.`;
  return { dusk, out, late, line, stamp };
}

/** Start the leader walking (or stop). Shared by the 'lead' input and the leader's own walking on. */
function leaderGo(s: ClimbState, m: Mountain, dir: 'up' | 'down' | 'stop', via?: string): void {
  const L = s.leader;
  if (L.move) L.pos = movePos(L.move, s.minute);
  L.move = null;
  L.fixing = null;
  L.scouting = null;
  if (dir === 'stop') return;
  // Leading up again undoes a turn: the next turn is the one a promise, a request or a debrief reads.
  if (dir === 'up') L.turnedAt = null;
  const pos = L.pos;
  let lg: Leg | undefined;
  let fromT: number;
  if (dir === 'up') {
    if (pos.leg) lg = legOf(m, pos.leg);
    else {
      const ups = legsUp(m, pos.place ?? '');
      lg = ups.find((x) => x.id === (via ?? L.route)) ?? ups[0];
      if (lg && ups.length > 1) {
        if (L.route !== lg.id) s.journal.push({ at: s.minute, text: `You chose ${routeName(lg)}.` });
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

/** Estimate the explicit close approach, without advancing the simulation. */
export function approachEstimate(s: ClimbState, who: string): { metres: number; minutes: number } {
  const target = memberState(s, who);
  const route = trailRoute(mountainOf(s), s.leader.pos, target.pos);
  return {
    metres: distance(s, s.leader.pos, target.pos),
    minutes: Math.ceil(
      route.reduce((n, x) => n + x.minutes, 0) * 0.95 * (1 + 0.12 * s.leader.carrying.length),
    ),
  };
}

function gatherRoute(s: ClimbState, mem: MemberState, point: Pos): Segment[] {
  return trailRoute(mountainOf(s), mem.pos, point).map((x) => ({
    ...x,
    minutes: Math.max(
      1,
      x.minutes * pace(s, personOf(s, mem.id), mem, legOf(mountainOf(s), x.leg), true, x.toT < x.fromT),
    ),
  }));
}

function gatherOffer(s: ClimbState, mem: MemberState, plan: GatherPlan): Affordance {
  const m = mountainOf(s);
  const segments = gatherRoute(s, mem, plan.point);
  const travel = segments.reduce((n, x) => n + x.minutes, 0);
  const duration = Math.max(1, plan.until - s.minute);
  const effort =
    segments.reduce((n, x) => n + legOf(m, x.leg).effort * x.minutes * (x.toT < x.fromT ? 0.6 : 1), 0) /
    duration;
  const risk = Math.min(
    0.6,
    segments.reduce(
      (n, x) =>
        n +
        slipChance(s.seed, s.weather, legOf(m, x.leg), s.minute) *
          x.minutes *
          2.5 *
          (s.fixed.includes(x.leg) ? 0.4 : 1),
      0,
    ),
  );
  const waiting = Math.max(0, duration - travel);
  const exposed = plan.point.place === m.hut ? 0 : danger(s, posXY(s, plan.point).alt);
  const waitRisk = Math.min(0.5, 0.25 * exposed * (waiting / 15));
  return {
    id: `gather:${plan.with}`,
    action: 'gather',
    targetId: plan.with,
    label: `meet ${memberIn(s, plan.with).name} ${plan.point.place ? `at ${placeOf(m, plan.point.place).name}` : `on ${legOf(m, plan.point.leg ?? '').name}`} and wait until ${clock(plan.until)}`,
    duration,
    effort,
    advertises: { belonging: 0.3, safety: -risk - 0.3 * exposed, autonomy: -0.04 },
    ...(travel > 0 ? { requires: { moving: 0.3 } } : {}),
    risk: { chance: Math.min(0.8, risk + waitRisk), severity: 0.5, kind: travel > 0 ? 'fall' : 'cold' },
    tags: travel > 0 ? ['outdoors', 'work', 'social'] : ['outdoors', 'social'],
  };
}

/** A valid way down from the lower end of an approach leg, including after crossing the summit. */
function approachPath(m: Mountain, place: string): string[] {
  if (place === m.hut) return [];
  const leg = m.legs.find((x) => x.to === place);
  return leg ? [...approachPath(m, leg.from), leg.id] : [];
}

/** Partial approaches stay on their leg. Descending a different branch replaces its ascent history. */
function approachEndpoint(m: Mountain, actor: { pos: Pos; path: string[] }, mv: Move): void {
  const lg = legOf(m, mv.leg);
  actor.path = approachPath(m, lg.from);
  if (mv.toT === 1) {
    actor.pos = at(lg.to);
    actor.path.push(lg.id);
  } else if (mv.toT === 0) actor.pos = at(lg.from);
  else actor.pos = { place: null, leg: lg.id, t: mv.toT };
}

function gatherArrival(s: ClimbState, m: Mountain, mem: MemberState, mv: Move): void {
  const lg = legOf(m, mv.leg);
  const p = personOf(s, mem.id);
  if (mv.toT === 1) {
    if (placeOf(m, lg.to).alt > placeOf(m, mem.high).alt) mem.high = lg.to;
    beat(s, lg.to === m.summit ? 'summit' : lg.to, mem.id);
    if (lg.to === m.summit && mem.summitAt === null) {
      mem.summitAt = s.minute;
      wantHome(s, p, mem.path.length);
      s.journal.push({ at: s.minute, who: mem.id, text: `${memberIn(s, mem.id).name} stood on the summit.` });
      witness(s, mem.id, 'summit', `${memberIn(s, mem.id).name} reached the top`, 0.3, null);
    }
  } else if (mv.toT === 0 && lg.from === m.hut && mem.homeAt === null) {
    mem.homeAt = s.minute;
    s.journal.push({ at: s.minute, who: mem.id, text: `${memberIn(s, mem.id).name} was back at the hut.` });
  }
}

function gatherStep(s: ClimbState, m: Mountain, mem: MemberState): void {
  const plan = mem.gather;
  if (!plan) return;
  mem.move = null;
  while (plan.segments.length) {
    const segment = plan.segments[0];
    if (!segment) break;
    const mv = segmentMove(segment, plan.started);
    if (s.minute < mv.end) {
      mem.path = approachPath(m, legOf(m, mv.leg).from);
      mem.move = mv;
      mem.pos = movePos(mv, s.minute);
      return;
    }
    approachEndpoint(m, mem, mv);
    gatherArrival(s, m, mem, mv);
    plan.started = mv.end;
    plan.segments.shift();
  }
}

function nearStep(s: ClimbState, m: Mountain): void {
  const L = s.leader;
  const target = s.members.find((x) => x.id === L.near && x.homeAt === null);
  if (L.move) {
    L.pos = movePos(L.move, s.minute);
    if (s.minute >= L.move.end) {
      approachEndpoint(m, L, L.move);
      L.move = null;
    }
  }
  if (!target) {
    L.move = null;
    delete L.near;
    return;
  }
  if (distance(s, L.pos, target.pos) < 25) {
    L.move = null;
    return;
  }
  if (L.move) return;
  const route = trailRoute(m, L.pos, target.pos);
  const first = route[0];
  if (!first) return;
  const segment = { ...first, minutes: Math.max(1, first.minutes * 0.95 * (1 + 0.12 * L.carrying.length)) };
  L.path = approachPath(m, legOf(m, segment.leg).from);
  L.move = segmentMove(segment, s.minute);
}

/** Who the leader walks toward: the middle of the party still out, or one person. */
function followTarget(s: ClimbState): MemberState | null {
  const f = s.leader.follow;
  if (!f) return null;
  if (f !== 'party') return s.members.find((x) => x.id === f && x.homeAt === null) ?? null;
  const out = s.members
    .filter((x) => x.homeAt === null)
    .sort((a, b) => posXY(s, a.pos).alt - posXY(s, b.pos).alt);
  return out[Math.floor(out.length / 2)] ?? null;
}

/** Walk toward the one followed along the legs: up the way they went, or back down. Stop beside them. */
function followStep(s: ClimbState, m: Mountain): void {
  const L = s.leader;
  const t = followTarget(s);
  if (!t) {
    if (L.follow && L.follow !== 'party')
      s.journal.push({
        at: s.minute,
        text: `${memberIn(s, L.follow).name} was back at the hut. You stopped where you were.`,
      });
    L.follow = null;
    return;
  }
  const lp = L.move ? movePos(L.move, s.minute) : L.pos;
  const close = distance(s, t.pos, lp) <= earshot(s) * 0.35;
  const dAlt = posXY(s, t.pos).alt - posXY(s, lp).alt;
  if (close || Math.abs(dAlt) < 4) {
    if (L.move) leaderGo(s, m, 'stop');
    return;
  }
  // Their way up from where you are: a leg they climbed or the one they are on.
  const legs = [...t.path, ...(t.pos.leg ? [t.pos.leg] : [])];
  const upWay = (place: string | null) => legs.find((id) => legOf(m, id).from === place);
  if (dAlt > 0) {
    if (L.move?.dir === 'up') return;
    if (lp.place && !upWay(lp.place)) {
      if (L.move?.dir !== 'down') leaderGo(s, m, 'down');
      return;
    }
    if (lp.leg && !legs.includes(lp.leg)) {
      if (L.move?.dir !== 'down') leaderGo(s, m, 'down');
      return;
    }
    // Going up to fetch someone is not leading on: a turn already made still stands.
    const turned = L.turnedAt;
    leaderGo(s, m, 'up', lp.place ? upWay(lp.place) : undefined);
    L.turnedAt = turned;
  } else if (L.move?.dir !== 'down' && (L.path.length > 0 || L.pos.leg)) leaderGo(s, m, 'down');
}

/**
 * Whom the leader is waiting for while leading up: those still climbing who have fallen out of easy earshot behind,
 * once they are half or more of the climbers. Leading from the middle: waiting for the very last turns you into the
 * sweeper, and the turn never reaches the front. Empty when not waiting.
 */
export function waitingFor(s: ClimbState): string[] {
  const L = s.leader;
  if (L.move?.dir !== 'up' || L.follow) return [];
  const here = posXY(s, L.pos).alt;
  const climbing = s.members.filter(
    (x) => x.homeAt === null && x.turnedAt === null && x.move?.dir !== 'down',
  );
  const behind = climbing.filter((x) => posXY(s, x.pos).alt < here - 5);
  const far = behind.filter((x) => distance(s, x.pos, L.pos) > earshot(s) * 0.6);
  return far.length > 0 && far.length >= Math.ceil(climbing.length / 2) ? far.map((x) => x.id) : [];
}

function stepLeader(s: ClimbState, m: Mountain): void {
  const L = s.leader;
  if (L.scouting && s.minute >= L.scouting.until) {
    const lg = legOf(m, L.scouting.leg);
    s.journal.push({ at: s.minute, text: `You came back from ${routeName(lg)}. ${legReport(s, lg)}.` });
    learnLeg(s, lg);
    L.scouting = null;
  }
  if (L.fixing && s.minute >= L.fixing.until) {
    s.fixed.push(L.fixing.leg);
    s.journal.push({ at: s.minute, text: `The rope on ${routeName(legOf(m, L.fixing.leg))} was fixed.` });
    L.fixing = null;
  }
  if (L.near && !L.fixing && !L.scouting) {
    nearStep(s, m);
    return;
  }
  if (L.follow && !L.fixing && !L.scouting) followStep(s, m);
  if (!L.move) return;
  // Leading up means leading the party: you keep to the pace of the last of them still climbing, and wait
  // when they fall back out of easy earshot.
  if (waitingFor(s).length > 0 && L.move) {
    L.move.start += 1;
    L.move.end += 1;
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
      // A leg turned back on halfway was never in the path: only a completed leg comes off it.
      if (L.path[L.path.length - 1] === lg.id) L.path.pop();
    }
    L.move = null;
    // Walk on until the fork, the top or the hut: the player stops you, or chooses the way at a fork.
    const here = L.pos.place ?? '';
    // Going up, you wait at a place when nobody behind is in earshot any more: you do not walk away from them.
    const company = s.members.some((x) => x.homeAt === null && canHear(s, x.id));
    const nextUp = legsUp(m, here);
    // The leader stops below a leg a rope could be fixed on: the choice to fix it is the player's.
    const fixHere = nextUp.some((x) => x.fixable && !s.fixed.includes(x.id));
    if (L.follow) return;
    if (dir === 'up' && here !== m.summit && nextUp.length === 1 && company && !fixHere) leaderGo(s, m, 'up');
    else if (dir === 'down' && L.path.length > 0) leaderGo(s, m, 'down');
  }
}

function stepMember(s: ClimbState, m: Mountain, mem: MemberState): void {
  const p = personOf(s, mem.id);
  const mission = mem.escortMeeting;
  if (mission && s.minute > mission.until) {
    delete mem.escortMeeting;
    if (mem.pending?.input === mission.input) mem.pending = null;
    if (mem.deferred?.input === mission.input) mem.deferred = null;
    if (
      mem.gather &&
      p.activity?.affordanceId === mission.activity?.id &&
      p.activity?.startedAt === mission.activity?.startedAt
    )
      complete(s, m, mem, p, 'interrupted');
    else delete mem.gather;
  }
  if (!p.body.alive) return;
  if (mem.scoutReport && canHear(s, mem.id)) {
    const report = mem.scoutReport;
    s.journal.push({
      at: s.minute,
      who: mem.id,
      text: `${p.name} reported the route crossed at ${clock(report.at)}: ${report.words}. Conditions may have changed.`,
    });
    if (report.fact && s.fieldRules) {
      s.fieldRules.observations ??= {};
      const observations = s.fieldRules.observations;
      const related: FactId[] = report.fact.startsWith('gully-')
        ? ['gully-loose', 'gully-quiet']
        : [report.fact];
      const newest = Math.max(-Infinity, ...related.map((f) => observations[f]?.at ?? -Infinity));
      if (report.at > newest) {
        s.known = s.known.filter((f) => !related.includes(f));
        s.known.push(report.fact);
        observations[report.fact] = { at: report.at, source: 'scout' };
      }
    }
    delete mem.scoutReport;
  }
  if (mem.gather && p.activity?.affordanceId === `gather:${mem.gather.with}`) gatherStep(s, m, mem);
  if (mem.move) mem.pos = movePos(mem.move, s.minute);
}

/** Going down from above the hut, first turn, with the leader still going up and nobody turned close by. */
function needsCompany(s: ClimbState, mem: MemberState): boolean {
  if (mem.turnedAt !== null || mem.alone || s.leader.turnedAt !== null) return false;
  if (mem.high === mountainOf(s).hut && mem.pos.place === mountainOf(s).hut) return false;
  if (mem.escortFor) return false;
  if (mem.companyFor && distance(s, mem.pos, memberState(s, mem.companyFor).pos) < 60) return false;
  return !s.members.some(
    (o) =>
      o.id !== mem.id &&
      o.homeAt === null &&
      (o.turnedAt !== null || o.escortFor === mem.id || o.companyFor === mem.id) &&
      distance(s, o.pos, mem.pos) < 60,
  );
}

const ASK_WAIT = 45;

function askCompany(s: ClimbState, mem: MemberState): void {
  const name = memberIn(s, mem.id).name;
  if (!mem.asks) {
    mem.asks = { at: s.minute };
    s.lines.push({
      at: s.minute,
      who: mem.id,
      input: -1,
      verdict: 'heard',
      reason: 'asks:company',
      says: 'I want to go down. Who will come with me?',
    });
    s.journal.push({
      at: s.minute,
      who: mem.id,
      text: `${name} wanted to go down, and asked who would come.`,
    });
    return;
  }
  if (s.minute - mem.asks.at >= ASK_WAIT) {
    mem.alone = true;
    mem.asks = null;
    s.journal.push({ at: s.minute, who: mem.id, text: `Nobody came. ${name} went down alone.` });
  }
}

function startMove(s: ClimbState, m: Mountain, mem: MemberState, aff: Affordance): void {
  const p = personOf(s, mem.id);
  const end = p.activity?.endsAt ?? s.minute + aff.duration;
  if (aff.id.startsWith('gather:') && mem.gather) {
    if (mem.escortMeeting?.answer && p.activity)
      mem.escortMeeting.activity = { id: p.activity.affordanceId, startedAt: p.activity.startedAt };
    mem.gather.segments = gatherRoute(s, mem, mem.gather.point);
    mem.gather.started = s.minute;
    mem.gather.until = end;
    mem.move = null;
    gatherStep(s, m, mem);
    return;
  }
  if (aff.id.startsWith('up:') || aff.id.startsWith('scout:') || aff.id.startsWith('down:')) {
    const lg = legOf(m, aff.placeId ?? '');
    const up = aff.id.startsWith('up:') || aff.id.startsWith('scout:');
    const fromT = mem.pos.leg ? mem.pos.t : up ? 0 : 1;
    if (up && mem.turnedAt !== null) {
      // Turned and then went up again: the turn no longer stands, so the day's record does not say both.
      mem.turnedAt = null;
      s.journal.push({
        at: s.minute,
        who: mem.id,
        text: `${memberIn(s, mem.id).name} changed ${memberIn(s, mem.id).they === 'she' ? 'her' : 'his'} mind and went up again.`,
      });
    }
    if (!up && mem.companyFor) {
      const other = memberState(s, mem.companyFor);
      if (distance(s, mem.pos, other.pos) < 60) {
        other.asks = null;
        s.journal.push({
          at: s.minute,
          who: mem.id,
          text: `${memberIn(s, mem.id).name} went down with ${memberIn(s, other.id).name}${mem.ropedTo === other.id ? ', already roped together' : ''}.`,
        });
      }
      delete mem.companyFor;
    }
    if (!up && mem.escortFor) {
      const o = memberState(s, mem.escortFor);
      const nm = memberIn(s, mem.id).name;
      const on = memberIn(s, o.id).name;
      // The ask counts as answered either way (kept so saved runs replay exactly); only the words and the rope are honest.
      if (o.asks) o.asks = null;
      if (distance(s, mem.pos, o.pos) < 60) {
        if (mem.ropedTo === null && o.ropedTo === null) {
          mem.ropedTo = o.id;
          o.ropedTo = mem.id;
        }
        const tied = mem.ropedTo === o.id;
        s.journal.push({
          at: s.minute,
          who: mem.id,
          text: `${nm} went down with ${on}${narrationVersion(s) < 3 || tied ? ', roped together' : ''}.`,
        });
      } else {
        // Sent to someone far off: they turn, but nobody is with the asker, who goes on asking (owner playtest 2026-10-19).
        s.journal.push({
          at: s.minute,
          who: mem.id,
          // Narrators 1 and 2 used this same sentence even when no rope could be tied.
          text:
            narrationVersion(s) >= 3
              ? `${nm} turned to go down toward ${on}, who is far off.`
              : `${nm} went down with ${on}, roped together.`,
        });
      }
      mem.escortFor = null;
    }
    if (!up && mem.turnedAt === null) {
      mem.turnedAt = s.minute;
      wantHome(s, p, mem.path.length + (mem.pos.leg ? 1 : 0));
      s.journal.push({
        at: s.minute,
        who: mem.id,
        text: `${memberIn(s, mem.id).name} turned for home from ${here(m, mem)}.`,
      });
    }
    // Set the move before the tug, so the partner's decision always sees it.
    mem.move = { leg: lg.id, dir: up ? 'up' : 'down', fromT, toT: up ? 1 : 0, start: s.minute, end };
    mem.pos = { place: null, leg: lg.id, t: fromT };
    // A tug on the rope: the partner, if standing, decides again now (HF still decides whether to follow).
    if (mem.ropedTo) {
      const o = memberState(s, mem.ropedTo);
      const op = personOf(s, o.id);
      if (o.move === null) {
        if (op.activity) interruptActivity(s, op, 'rope:tug');
        o.idleUntil = s.minute;
      }
    }
  } else {
    mem.move = null;
  }
}

/**
 * The top is halfway. Once someone stands on it or turns for home, getting down becomes their goal: an HF temporal
 * goal advanced by each leg of descent, so the hours left before dark weigh on it.
 */
function promisedDown(p: Person, now: number): boolean {
  return p.agenda.commitments.some(
    (c) => c.actions.includes('descend') && c.status !== 'kept' && c.status !== 'broken' && c.until > now,
  );
}

function wantHome(s: ClimbState, p: Person, legsLeft: number): void {
  if (p.agenda.goals.some((g) => g.label === 'get down safely' && g.status === 'active')) return;
  setGoal(s, p, {
    label: 'get down safely',
    serves: ['safety', 'security'],
    advancedBy: [{ action: 'descend', amount: 1 / Math.max(1, legsLeft) }],
    // Someone already bound by a promise to be down goes down for that promise; the goal only backs it up.
    importance: promisedDown(p, s.minute) ? 0.3 : 0.7,
    temporal: { halfLifeMinutes: 180 },
    deadline: s.day * 1440 + mountainOf(s).duskMinuteOfDay,
  });
}

/**
 * What each person brings to the day besides the top, as HF goals and promises, so that a sensible plan still
 * collides with someone: Nell promised her mother she would be down before dark; Bilal carries Ezra's tin and means
 * to leave it on the top. (Oskar's hunger for the top and Wren's pride live in their summit goal and her down offer.)
 */
function aims(s: ClimbState, m: Mountain): void {
  const dusk = s.day * 1440 + m.duskMinuteOfDay;
  const nell = personOf(s, 'nell');
  commit(s, nell, {
    kind: 'promise',
    toId: 'nell-mother',
    actions: ['descend'],
    from: dusk - 300,
    until: dusk - 150,
    importance: 0.9,
    label: 'down before dark, as I told Mum',
  });
  s.journal.push({
    at: s.minute,
    who: 'nell',
    text: 'Nell had promised her mother a call from the hut before dark.',
  });
  const bilal = personOf(s, 'bilal');
  if (!bilal.agenda.goals.some((g) => g.label === 'leave the tin on the top' && g.status === 'active'))
    setGoal(s, bilal, {
      label: 'leave the tin on the top',
      serves: ['tradition', 'benevolence'],
      advancedBy: [{ action: 'summit', amount: 1 }],
      importance: 0.85,
      temporal: { halfLifeMinutes: 600 },
    });
}

/** Say a story beat once. */
function beat(s: ClimbState, when: string, arriving?: string): void {
  if (s.beatsDone.includes(when)) return;
  const b: Beat | undefined = mountainOf(s).beats.find((x) => x.when === when);
  if (!b) return;
  // A beat about one person waits for that person to arrive: Bilal's tin opens only when Bilal is on the top.
  if (b.who && arriving && b.who !== arriving) return;
  s.beatsDone.push(when);
  s.journal.push({ at: s.minute, text: b.text, ...(b.who ? { who: b.who } : {}), story: true });
}

function here(m: Mountain, mem: MemberState): string {
  if (mem.pos.place) return routeName(placeOf(m, mem.pos.place));
  return routeName(legOf(m, mem.pos.leg ?? ''));
}

/** End the running activity with an HF outcome built from what the world did. */
function resolvePhysical(
  s: ClimbState,
  m: Mountain,
  mem: MemberState,
  p: Person,
  status: Outcome['status'],
  extra: Partial<Outcome> = {},
): Outcome {
  const a = p.activity;
  if (!a) throw Error('Missing accepted physical activity');
  const out: Outcome = {
    affordanceId: a.affordanceId,
    action: a.action,
    status,
    at: s.minute,
    ...(a.targetId ? { targetId: a.targetId } : {}),
    ...(a.protest ? { quality: 0.6 } : {}),
    ...extra,
  };
  if (a.affordanceId.startsWith('gather:') && mem.gather) {
    // Short movement never becomes a completed full leg or a turn for home.
    if (mem.move) mem.pos = movePos(mem.move, s.minute);
    mem.move = null;
    delete mem.gather;
    const meeting = mem.escortMeeting;
    if (
      meeting &&
      status === 'completed' &&
      s.minute <= meeting.until &&
      meeting.answer &&
      ['assented', 'complied'].includes(meeting.answer.verdict) &&
      meeting.activity?.id === a.affordanceId &&
      meeting.activity.startedAt === a.startedAt &&
      a.targetId === meeting.with
    ) {
      const other = memberState(s, meeting.with);
      if (other.homeAt === null && distance(s, mem.pos, other.pos) < 40) {
        s.journal.push({
          at: s.minute,
          who: mem.id,
          text: `${p.name} reached ${memberIn(s, other.id).name}. They still choose whether to go down together.`,
        });
        mem.pending = {
          s: { voiceId: LEADER, action: 'descend', strength: FORCE.ask, since: s.minute },
          input: meeting.input,
        };
      } else {
        s.journal.push({
          at: s.minute,
          who: mem.id,
          text: `${p.name} reached the meeting place; ${memberIn(s, other.id).name} had moved. They have not met.`,
        });
        delete mem.escortMeeting;
      }
    } else if (meeting) delete mem.escortMeeting;
  }
  const mv = mem.move;
  if (mv) {
    mem.pos = movePos(mv, s.minute);
    if (status === 'completed') {
      const lg = legOf(m, mv.leg);
      if (mv.dir === 'up') {
        mem.pos = at(lg.to);
        mem.path.push(lg.id);
        if (a.affordanceId.startsWith('scout:'))
          mem.scoutReport = {
            leg: lg.id,
            at: s.minute,
            words: legReport(s, lg),
            ...(lg.id === 'ridge'
              ? { fact: 'ridge-solid' as const }
              : lg.id === 'gully'
                ? {
                    fact: (lg.rockfall * sunAt(s.weather, s.minute) > 0.3
                      ? 'gully-loose'
                      : 'gully-quiet') as FactId,
                  }
                : {}),
          };
        if (mem.ahead) {
          mem.ahead = false;
          const next = lg.to === m.summit ? null : nextLegUp(s, mem);
          if (next) {
            s.journal.push({
              at: s.minute,
              who: mem.id,
              text: `${memberIn(s, mem.id).name} called down from ${routeName(placeOf(m, lg.to))}. ${legReport(s, next)}.`,
            });
            learnLeg(s, next);
          }
        }
        if (placeOf(m, lg.to).alt > placeOf(m, mem.high).alt) mem.high = lg.to;
        beat(s, lg.to === m.summit ? 'summit' : lg.to, mem.id);
        if (lg.to === m.summit && mem.summitAt === null) {
          mem.summitAt = s.minute;
          wantHome(s, p, mem.path.length);
          out.needs = { esteem: 0.25, meaning: 0.3, competence: 0.2 };
          s.journal.push({
            at: s.minute,
            who: mem.id,
            text: `${memberIn(s, mem.id).name} stood on the summit.`,
          });
          witness(s, mem.id, 'summit', `${memberIn(s, mem.id).name} reached the top`, 0.3, null);
        }
      } else {
        mem.pos = at(lg.from);
        // A leg turned back on halfway was never in the path: only a completed leg comes off it.
        if (mem.path[mem.path.length - 1] === lg.id) mem.path.pop();
        if (lg.from === m.hut && mem.homeAt === null) {
          mem.homeAt = s.minute;
          s.journal.push({
            at: s.minute,
            who: mem.id,
            text: `${memberIn(s, mem.id).name} was back at the hut.`,
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
    else if (a.action === 'relieve' && s.fieldRules?.bladder) out.voidedBladder = true;
    else if (a.action === 'relieve' && !rules2(s)) out.needs = { relief: 0.8 };
    else if (a.action === 'pack') {
      mem.pack = false;
      s.leader.carrying.push(mem.id);
      s.journal.push({
        at: s.minute,
        who: mem.id,
        text: `${memberIn(s, mem.id).name} let you take the pack.`,
      });
    } else if (a.action === 'rope' && a.targetId) {
      const other = memberState(s, a.targetId);
      if (other.ropeReady?.with === mem.id && s.minute - other.ropeReady.at <= 15 && other.ropedTo === null) {
        mem.ropedTo = other.id;
        other.ropedTo = mem.id;
        other.ropeReady = null;
        s.journal.push({
          at: s.minute,
          who: mem.id,
          text: `${memberIn(s, mem.id).name} and ${memberIn(s, other.id).name} tied in together.`,
        });
      } else mem.ropeReady = { with: other.id, at: s.minute };
    }
  }
  return out;
}

function ropeOffText(s: ClimbState, a: MemberState, b: MemberState): string {
  const [na, nb] = [memberIn(s, a.id).name, memberIn(s, b.id).name];
  const goer = a.move && !b.move ? [na, nb] : b.move && !a.move ? [nb, na] : null;
  if (goer)
    return `${goer[1]} stayed where ${memberIn(s, goer[1] === na ? a.id : b.id).they} was; ${goer[0]} untied and went on.`;
  return `The rope between ${na} and ${nb} came off as they went different ways.`;
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
        text: ropeOffText(s, mem, other),
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
    const name = memberIn(s, mem.id).name;
    mem.injuries.push({ at: s.minute, severity: sev, leg: lg.id, caught });
    const part =
      ['leg', 'arm', 'head'][Math.floor(hashUnit(s.seed, DRAW.slipPart, s.day, li, s.minute, idx) * 3)] ??
      'leg';
    if (caught && partner) {
      s.journal.push({
        at: s.minute,
        who: mem.id,
        text: `${name} slipped on ${routeName(lg)}; ${memberIn(s, partner.id).name} held the rope.`,
      });
      receive(s, p, [
        {
          at: s.minute,
          channel: 'social',
          kind: 'help',
          actorId: partner.id,
          targetId: mem.id,
          salience: 0.9,
          valence: 0.6,
          summary: `${memberIn(s, partner.id).name} held me on the rope`,
        },
      ]);
    } else {
      s.journal.push({
        at: s.minute,
        who: mem.id,
        text:
          hurtLevel(sev) === 'badly'
            ? `${name} fell on ${routeName(lg)} and lay still for a long minute.`
            : hurtLevel(sev) === 'hurt'
              ? `${name} slipped on ${routeName(lg)} and got up hurt.`
              : `${name} slipped on ${routeName(lg)} and got up, shaken.`,
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
      if (sev > 0.45)
        enqueue(s, 'body.received', {
          person: p.id,
          evidenceId: `fall:${p.id}:${s.minute}`,
          receipt: { type: 'fallen', cause: 'fall', observedUntil: Math.round((s.minute + 40) * MINUTE) },
        });
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
    receive(s, p, [
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
    if (kind === 'fall' && p.activity) interruptActivity(s, p, 'percept:fall');
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
    if (percepts.length) receive(s, personOf(s, mem.id), percepts);
  }
}

function checkPromise(s: ClimbState): void {
  const pr = s.promise;
  if (pr?.status !== 'open') return;
  const deadline = s.day * 1440 + pr.hour * 60 + 30;
  // Kept only by a turn made after the promise: a turn already behind you keeps nothing.
  const kept = s.leader.turnedAt !== null && s.leader.turnedAt >= pr.at && s.leader.turnedAt <= deadline;
  // Settled no earlier than the hour itself: a short walk down to fetch someone, then on up again, keeps nothing
  // (owner and late playtests 2026-10-18: the promise read as kept by "stay with them" at 10:46).
  const hour = s.day * 1440 + pr.hour * 60;
  if ((!kept || s.minute < hour) && s.minute < deadline) return;
  pr.status = kept ? 'kept' : 'broken';
  for (const id of pr.hearers) {
    const p = personOf(s, id);
    // HF learns from the actual kept/broken promise through its public evidence input.
    enqueue(s, 'voice.promise-received', {
      person: p.id,
      evidenceId: `promise:${p.id}:${s.minute}`,
      voiceId: LEADER,
      promise: { kept, action: 'descend' },
    });
    receive(s, p, [
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
  if (s.climbNo === 1) {
    const k = (s.minute - s.startMinute) / 20;
    const x = Number.isInteger(k) ? MEMBERS[k + 1] : undefined;
    if (x && k >= 1) s.journal.push({ at: s.minute, text: x.first, who: x.id, story: true });
  }
  // The walk-in: a small thing every half hour after the introductions, so the first hours are never empty.
  const since = s.minute - s.startMinute;
  const ap = m.approach ?? [];
  const ai = since % 30 === 0 ? since / 30 - 3 : -1;
  if (ai >= 0 && ai < ap.length) {
    const t = ap[ai];
    if (t) s.journal.push({ at: s.minute, text: t, story: true });
  }
  // The light going is a fact everyone on the hill can see: four hours before dark, getting down becomes a goal.
  if (mod === m.duskMinuteOfDay - 240) {
    s.journal.push({ at: s.minute, text: 'The shadows grew longer, and yellow light covered the snow.' });
    for (const mem of s.members)
      if (mem.homeAt === null && mem.path.length + (mem.pos.leg ? 1 : 0) > 0)
        wantHome(s, personOf(s, mem.id), mem.path.length + (mem.pos.leg ? 1 : 0));
  }
  if (mod !== 19 * 60 + 5) return;
  const bilal = s.members.find((x) => x.id === 'bilal');
  if (!bilal) return;
  const where = bilal.pos.place ? routeName(placeOf(m, bilal.pos.place)) : 'the path';
  s.journal.push({
    at: s.minute,
    who: 'bilal',
    text: `At dusk Bilal stepped aside at ${where} to pray, then came back to the others.`,
  });
}

// ---------------------------------------------------------------- run and replay

export const snapshot = (s: ClimbState): string =>
  canonicalPersona(JSON.parse(JSON.stringify({ ...s, hf: archiveOf(s) })));
export const restore = (json: string): ClimbState => {
  const s = JSON.parse(json) as ClimbState;
  if (
    !s.hf ||
    s.castEdition !== CAST_EDITION ||
    s.hf.engine?.package !== `@adam0white/human-framework@${FRAMEWORK_VERSION}`
  )
    throw Error('This saved climb uses an older simulation. Keep the file and start a fresh season.');
  syncReadings(s);
  return s;
};

/** Replay a start state with a list of inputs to the end of the climb. */
export function replay(
  startJson: string,
  inputs: readonly Input[],
  until?: number,
  narration?: NarrationVersion,
  phase?: Pick<NonNullable<ClimbState['hfPhase']>, 'from' | 'to' | 'steps'>,
): ClimbState {
  const s = restore(startJson);
  const savedNarration = s.narration;
  if (narration !== undefined) s.narration = narration;
  s.inputs = inputs.map((x) => ({ ...x }));
  while (
    (!s.over ||
      Object.keys(s.hfRequests).length > 0 ||
      s.hfQueue.length > 0 ||
      s.inputs.some((i) => i.t === 'release-person' && i.at === s.minute + 1)) &&
    ((phase?.from ?? until) === undefined || s.minute < (phase?.from ?? until)!)
  )
    step(s);
  if (phase) {
    if (
      s.minute !== phase.from ||
      phase.to !== phase.from + 1 ||
      !Number.isSafeInteger(phase.steps) ||
      phase.steps < 1
    )
      throw Error('Unsupported partial simulation phase');
    const generator = stepping(s);
    for (let n = 0; n < phase.steps; n++)
      if (generator.next().done) throw Error('Partial phase exceeds its admitted steps');
    pendingSteps.set(s, generator);
  }
  // The compatibility override does not rewrite the original saved state's metadata.
  if (savedNarration === undefined) delete s.narration;
  else s.narration = savedNarration;
  return s;
}

/** Host evidence requests an HF interruption; it cannot finish an actor itself. */
function complete(
  s: ClimbState,
  _m: Mountain,
  _mem: MemberState,
  p: Person,
  status: Outcome['status'],
  extra: Partial<Outcome> = {},
) {
  if (extra.injury)
    enqueue(s, 'body.received', {
      person: p.id,
      evidenceId: `injury:${p.id}:${s.minute}`,
      receipt: { type: 'injured', injury: extra.injury as never },
    });
  if (extra.percepts?.length) receive(s, p, extra.percepts);
  interruptActivity(s, p, `world:${status}`);
}

export function makeWorld(s: ClimbState): World {
  const m = mountainOf(s);
  return {
    now: () => s.minute,
    converse: (a, b) =>
      !a.body.asleep &&
      !b.body.asleep &&
      distance(s, memberState(s, a.id).pos, memberState(s, b.id).pos) < earshot(s)
        ? { placeId: `place:${s.mountain}:${memberState(s, a.id).pos.place ?? memberState(s, a.id).pos.leg}` }
        : false,
    affordancesFor: (p) => {
      const mem = memberState(s, p.id);
      if (mem.homeAt !== null && !s.over) return [];
      if (s.hfReleased[p.id]) return [];
      const request = s.hfRequests[p.id];
      const boundary = s.hfPhase?.result?.boundary;
      const starting =
        boundary?.type === 'world-required'
          ? boundary.requests.find((r) => r.kind === 'action' && r.person === p.id && r.stage === 'start')
          : undefined;
      // A genuine HF start request retains its offer authorization after its
      // answer is shown. Revalidate physical availability with that same request.
      const offers = alongsidePartner(
        s,
        mem,
        offersFor(s, p.id, starting?.kind === 'action' ? starting.offerId : undefined),
      ).filter(
        (o) => !s.over || ['eat', 'drink', 'relieve', 'rest', 'wait', 'sleep', 'talk'].includes(o.action),
      );
      return request ? [...offers, request.offer] : offers;
    },
    perceptsFor: () => [],
    scarcityFor: () => 0,
    observed: () => {
      for (const p of s.people) {
        const mem = memberState(s, p.id),
          pending = mem.pending ?? mem.deferred;
        if (!pending) continue;
        const resolved = p.events.findLast(
          (e) =>
            e.data.kind === 'suggestion-resolved' &&
            e.data.adviceId === `${pending.s.voiceId}:${pending.s.since}`,
        );
        if (
          !resolved ||
          resolved.data.kind !== 'suggestion-resolved' ||
          s.hfLastDecision[p.id] === resolved.id
        )
          continue;
        s.hfLastDecision[p.id] = resolved.id;
        const decisionId = resolved.data.decisionId;
        const event = p.events.findLast(
          (e) => e.data.kind === 'decision' && e.data.decision.id === decisionId,
        );
        const result = resolved.data.resolution;
        const answer = { ...result, says: resolved.narration.map((l) => l.text).join(' ') };
        line(s, p.id, pending.input, answer);
        const switching =
          p.activity &&
          event?.data.kind === 'decision' &&
          event.data.decision.chosenAffordanceId &&
          event.data.decision.chosenAffordanceId !== p.activity.affordanceId &&
          ['assented', 'complied', 'commanded'].includes(result.verdict);
        mem.pending = switching ? pending : null;
        mem.deferred =
          result.verdict === 'deferred' ? { s: pending.s, input: pending.input, until: s.minute + 90 } : null;
      }
    },
    beginOptions: (p, offer) => {
      const mem = memberState(s, p.id);
      if (offer.id.startsWith('down:') && needsCompany(s, mem)) {
        askCompany(s, mem);
        if (!mem.alone) return false;
      }
      p.activity = s.hfActive[p.id] ?? null;
      startMove(s, m, mem, offer);
      return true;
    },
    resolve: (p, activity, reason) => {
      p.activity = activity;
      const result = resolvePhysical(
        s,
        m,
        memberState(s, p.id),
        p,
        reason === 'ended' ? 'completed' : 'interrupted',
      );
      const request = s.hfRequests[p.id];
      if (request && request.offer.id === activity.affordanceId && reason === 'ended') {
        if (request.kind === 'release') {
          s.hfReleased[p.id] = true;
          for (const goal of p.agenda.goals.filter(
            (g) =>
              g.status === 'active' &&
              ['summit', 'get down safely', 'leave the tin on the top'].some(
                (label) => g.id === label || g.label === label,
              ),
          ))
            endGoal(s, p, goal.id);
          s.journal.push({
            at: s.minute,
            who: p.id,
            text: `${p.name} ended this mountain chapter at the hut. Promises, debts and health remain.`,
          });
          s.hfOffers[p.id] = { revision: (s.hfOffers[p.id]?.revision ?? 0) + 1, offers: [] };
          enqueue(s, 'offers.received', { person: p.id, revision: s.hfOffers[p.id]!.revision, offers: [] });
        } else if (canHear(s, p.id)) {
          const clue = DISCOVERIES[p.id];
          if (clue)
            s.journal.push({ at: s.minute, who: p.id, text: `${p.name} said, “${clue.clue}”`, story: true });
        }
        delete s.hfRequests[p.id];
      }
      return result;
    },
  };
}
