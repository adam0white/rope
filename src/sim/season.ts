/**
 * The season: the same five people across three climbs. Trust, grudges, memories and injuries carry over because
 * the HF people do: between climbs they live a few days in the valley (sleep, meals, rest, each other's company),
 * stepped through the same HF decide/begin/finish loop. SCOPE: the valley is offers only, no places or events; a
 * season ends after the last mountain or when the party can no longer climb. Not modelled: jobs, families, travel.
 */
import type { PersonAuthoring } from '@adam0white/human-framework';
import { canonicalPersona, lifeAdmission } from '@adam0white/lab-client';
import {
  type ClimbState,
  hurtLevel,
  makeWorld,
  type NarrationVersion,
  replay,
  restore,
  snapshot,
  startClimb,
} from './climb.ts';
import { interruptActivity } from './commands.ts';
import { type Branch, type Facts, factsOf } from './debrief.ts';
import { type Affordance, archiveOf, type Person, stepPeople } from './hf4.ts';
import { SEASON } from './mountain.ts';
import { createParty, MEMBERS } from './party.ts';
import { admitClimber, type Chapter, checkChapter } from './passport.ts';

export interface ClimbSummary {
  climbNo: number;
  mountain: string;
  facts: Facts;
  branch: Branch | null;
  /** Story and person lines kept for the season's notebook. */
  notes: string[];
}

export interface PastClimb {
  start: string;
  inputs: ClimbState['inputs'];
  state: string;
  branch: Branch | null;
}

export interface SeasonState {
  v: 1;
  seed: number;
  climbNo: number;
  people: Person[];
  history: ClimbSummary[];
  /** The climb under way: its start (the replay substrate) and its live state. */
  start: string | null;
  over: boolean;
  chapter?: Chapter;
  past?: PastClimb[];
}

/** First climb day of a season; each climb is four days after the last. */
export const FIRST_DAY = 3;
export const DAYS_BETWEEN = 4;

export const dayOfClimb = (climbNo: number): number => FIRST_DAY + DAYS_BETWEEN * (climbNo - 1);

export function openingParty(seed: number): PersonAuthoring[] {
  return createParty(seed, dayOfClimb(1) * 1440 + (SEASON[0]?.startMinuteOfDay ?? 300));
}
export function newSeason(seed: number, chapter?: Chapter): { season: SeasonState; climb: ClimbState } {
  const day = dayOfClimb(1);
  if (chapter) {
    checkChapter(chapter);
    const expected = Object.fromEntries(openingParty(seed).map((p) => [p.id, p]));
    for (const input of chapter.inputs) {
      const id = input.castId.split('.')[2] ?? '';
      const opening = expected[id];
      if (!opening) throw new Error('This person does not belong in the starting party.');
      expected[id] = admitClimber(input, opening);
    }
    if (canonicalPersona(expected) !== canonicalPersona(chapter.initial))
      throw new Error('The starting party does not match the accepted history records.');
  }
  const people = chapter
    ? MEMBERS.map((m) => {
        const p = chapter.initial[m.id];
        if (!p) throw new Error('The starting party is incomplete.');
        return structuredClone(p);
      })
    : openingParty(seed);
  const climb = startClimb(seed, day, people, SEASON[0]?.id ?? 'hollin', 1);
  for (const preparation of chapter?.preparations ?? []) {
    const life = lifeAdmission(preparation, 'rope');
    const id = preparation.parent.castId.split('.')[2]!;
    const member = climb.members.find((m) => m.id === id)!;
    const name = MEMBERS.find((m) => m.id === id)!.name;
    const routine =
      life.life.work === 'free-time'
        ? 'left time free'
        : life.life.work === 'local-help'
          ? 'set aside time for local help'
          : 'kept time for their own routine';
    const place =
      life.life.place === 'home'
        ? 'home'
        : life.life.place === 'local-workplace'
          ? 'their local workplace'
          : 'the public garden';
    if (!life.availableForExtraWork) member.idleUntil = climb.minute + (life.startsAtHome ? 8 : 4);
    climb.journal.push({
      at: climb.minute,
      who: id,
      text: `${name} is assigned to ${life.assignment} and ${routine}; their last local stop was ${place}.${life.contacts.length ? ` They read public work notes from ${life.contacts.join(', ')}.` : ''} ${life.availableForExtraWork ? 'They have time to help with preparations.' : 'They have preparations to make at the hut.'}`,
      story: true,
    });
  }
  const season: SeasonState = {
    v: 1,
    seed,
    climbNo: 1,
    people: [],
    history: [],
    start: snapshot(climb),
    over: false,
    ...(chapter ? { chapter: structuredClone(chapter) } : {}),
  };
  return { season, climb };
}

/** Close a played climb into the season, then live the valley days and start the next climb (or end). */
export function nextClimb(season: SeasonState, played: ClimbState, branch: Branch | null): ClimbState | null {
  const frames = nextClimbFrames(season, played, branch);
  let result = frames.next();
  while (!result.done) result = frames.next();
  return result.value;
}
/** Explicit paused transition; callers may yield rendering between each public HF call. */
export function* nextClimbFrames(
  season: SeasonState,
  played: ClimbState,
  branch: Branch | null,
): Generator<void, ClimbState | null, void> {
  season.past ??= [];
  season.past.push({
    start: season.start ?? '',
    inputs: structuredClone(played.inputs),
    state: snapshot(played),
    branch,
  });
  season.history.push({
    climbNo: played.climbNo,
    mountain: played.mountain,
    facts: factsOf(played),
    branch,
    notes: played.journal.filter((j) => j.story).map((j) => j.text),
  });
  const next = SEASON[played.climbNo];
  if (!next) {
    season.over = true;
    season.people = played.people;
    season.start = null;
    return null;
  }
  const day = dayOfClimb(played.climbNo + 1);
  yield* valleyFrames(played, day * 1440 + next.startMinuteOfDay);
  const continued = archiveOf(played);
  season.climbNo = played.climbNo + 1;
  const climb = startClimb(season.seed, day, undefined, next.id, season.climbNo, continued, played.hfActive);
  if (played.fieldRules) climb.fieldRules = { ...played.fieldRules };
  aftermath(climb, season.history.at(-1)?.facts ?? {});
  season.start = snapshot(climb);
  season.people = [];
  return climb;
}

/** The next climb recalls recorded physical events. Current condition is unavailable. */
function aftermath(climb: ClimbState, facts: Facts): void {
  const at = climb.minute;
  const add = (text: string, who?: string) =>
    climb.journal.splice(1, 0, { at, text, story: true, ...(who ? { who } : {}) });
  const lines: [string, string | undefined][] = [];
  const out = MEMBERS.filter((m) => facts[m.id] && !facts[m.id]?.home);
  if (out.length)
    lines.push([
      `After the last climb, ${out
        .map((m) => m.name)
        .join(', ')
        .replace(
          /, ([^,]*)$/,
          ' and $1',
        )} stayed on the mountain overnight. The hut warden's party brought ${out.length > 1 ? 'them' : out[0]?.they === 'she' ? 'her' : 'him'} down at first light.`,
      undefined,
    ]);
  for (const p of climb.people) {
    const m = MEMBERS.find((x) => x.id === p.id);
    if (!m) continue;
    const f = facts[m.id];
    if (f && (hurtLevel(f.hurt) === 'hurt' || hurtLevel(f.hurt) === 'badly'))
      lines.push([
        `${m.name} was injured at ${f.hurtWhere ?? 'the last climb'}. Current condition is unavailable.`,
        m.id,
      ]);
  }
  for (const [t, w] of lines.reverse()) add(t, w);
}

const VALLEY: Affordance[] = [
  {
    id: 'sleep',
    action: 'sleep',
    label: 'sleep',
    duration: 480,
    effort: 0,
    mode: 'sleep',
    advertises: { sleep: 1 },
  },
  {
    id: 'meal',
    action: 'eat',
    label: 'eat a meal',
    duration: 40,
    effort: 0.05,
    advertises: { food: 0.8, water: 0.4 },
  },
  {
    id: 'rest',
    action: 'rest',
    label: 'rest',
    duration: 90,
    effort: 0.02,
    advertises: { rest: 0.4, leisure: 0.2 },
  },
  {
    id: 'walk',
    action: 'walk',
    label: 'walk by the river',
    duration: 60,
    effort: 0.3,
    advertises: { leisure: 0.3, meaning: 0.05 },
  },
  {
    id: 'relieve',
    action: 'relieve',
    label: 'wash',
    duration: 15,
    effort: 0.05,
    advertises: { relief: 0.9 },
  },
];

/** Live the days between climbs: each person decides among the valley's offers until `to`. */
export function valley(state: ClimbState, to: number): void {
  const frames = valleyFrames(state, to);
  let result = frames.next();
  while (!result.done) result = frames.next();
}
export function* valleyFrames(state: ClimbState, to: number): Generator<void, void, void> {
  state.hfMode = 'valley';
  for (const p of state.people) interruptActivity(state, p, 'the climb ended; return to the valley');
  const world = (s: ClimbState) => ({
    ...makeWorld(s),
    affordancesFor: (p: Person): Affordance[] => [
      ...VALLEY,
      ...MEMBERS.filter((m) => m.id !== p.id).map((m) => ({
        id: `talk:${m.id}`,
        action: 'talk',
        label: `talk with ${m.name}`,
        targetId: m.id,
        with: [m.id],
        placeId: 'valley',
        duration: 60,
        effort: 0.05,
        advertises: { belonging: 0.4, leisure: 0.15 },
        tags: ['social'],
      })),
    ],
    beginOptions: () => true,
    resolve: (
      _p: Person,
      a: import('./hf4.ts').Activity,
      reason: 'ended' | 'interrupted',
    ): import('./hf4.ts').Outcome => ({
      affordanceId: a.affordanceId,
      action: a.action,
      targetId: a.targetId,
      status: reason === 'ended' ? 'completed' : 'interrupted',
      at: s.minute,
      ...(reason === 'ended' && a.action === 'eat' ? { needs: { food: 0.8, water: 0.4 } } : {}),
      ...(reason === 'ended' && a.action === 'relieve' ? { voidedBladder: true } : {}),
    }),
    converse: () => ({ placeId: 'valley' }),
  });
  // The public Run advances every bodily/agenda owner across the actual valley interval.
  yield* stepPeople(state, world, to, {}, undefined, 30);
  state.minute = to;
  delete state.hfPhase;
  delete state.hfMode;
}

/** Reconstruct every prior played climb and valley interval before trusting a later initial state. */
export function validateSeasonStart(
  seed: number,
  chapter: Chapter | undefined,
  past: PastClimb[],
  start: string,
): SeasonState {
  if (!Array.isArray(past) || past.length > 2)
    throw new Error('This saved history contains an unsupported sequence of earlier climbs.');
  const opening = newSeason(seed, chapter);
  const season = opening.season;
  for (const entry of past) {
    if (entry.start !== season.start)
      throw new Error('An earlier climb starts from a different saved state.');
    const saved = restore(entry.state);
    const played = replay(entry.start, entry.inputs, saved.minute);
    if (!played.over || snapshot(played) !== entry.state)
      throw new Error('An earlier climb does not replay to its saved outcome.');
    if (!nextClimb(season, played, entry.branch))
      throw new Error('The season has ended, so there is no next climb.');
  }
  if (season.start !== start)
    throw new Error('This climb’s starting state does not match the accepted people and earlier climbs.');
  return season;
}

/** Playtest export (AGENTS.md): seed, start state, input log and final state replay the player's climb. */
export interface PlaytestExport {
  game: 'rope';
  v: 2;
  engine: string;
  seed: number;
  climbNo: number;
  /** Day of the season, 1-based (the simulation's own day counter starts at FIRST_DAY). */
  seasonDay: number;
  mountain: string;
  start: string;
  inputs: ClimbState['inputs'];
  state: string;
  chapter?: Chapter;
  past?: PastClimb[];
}

export function exportClimb(
  start: string,
  s: ClimbState,
  engine: string,
  chapter?: Chapter,
  past?: PastClimb[],
): PlaytestExport {
  return {
    game: 'rope',
    v: 2,
    engine,
    seed: s.seed,
    climbNo: s.climbNo,
    seasonDay: s.day - FIRST_DAY + 1,
    mountain: s.mountain,
    start,
    inputs: s.inputs,
    state: snapshot(s),
    ...(chapter ? { chapter: structuredClone(chapter) } : {}),
    ...(past ? { past: structuredClone(past) } : {}),
  };
}

/** Reconstruct the exact current Run, host phase and input tape. Older save formats refuse. */
export function replayExport(e: PlaytestExport): ClimbState {
  restore(e.start);
  const saved = restore(e.state);
  const narration: NarrationVersion | undefined = undefined;
  const reconstructed = replay(e.start, e.inputs, saved.minute, narration, saved.hfPhase);
  if (snapshot(reconstructed) !== e.state)
    throw new Error(
      'This saved climb uses different narration or rules. Keep its export and start a fresh climb.',
    );
  return reconstructed;
}
