/**
 * The season: the same five people across three climbs. Trust, grudges, memories and injuries carry over because
 * the HF people do: between climbs they live a few days in the valley (sleep, meals, rest, each other's company),
 * stepped through the same HF decide/begin/finish loop. SCOPE: the valley is offers only, no places or events; a
 * season ends after the last mountain or when the party can no longer climb. Not modelled: jobs, families, travel.
 */
import {
  type Affordance,
  begin,
  decide,
  finish,
  type Person,
  readPerson,
  tick,
  voiceOf,
} from '@adam0white/human-framework';
import {
  type ClimbState,
  hurtLevel,
  type NarrationVersion,
  replay,
  restore,
  snapshot,
  startClimb,
} from './climb.ts';
import { type Branch, type Facts, factsOf } from './debrief.ts';
import { SEASON } from './mountain.ts';
import { createParty, LEADER, MEMBERS } from './party.ts';

export interface ClimbSummary {
  climbNo: number;
  mountain: string;
  facts: Facts;
  branch: Branch | null;
  /** Story and person lines kept for the season's notebook. */
  notes: string[];
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
}

/** First climb day of a season; each climb is four days after the last. */
export const FIRST_DAY = 3;
export const DAYS_BETWEEN = 4;

export const dayOfClimb = (climbNo: number): number => FIRST_DAY + DAYS_BETWEEN * (climbNo - 1);

export function newSeason(seed: number): { season: SeasonState; climb: ClimbState } {
  const day = dayOfClimb(1);
  const people = createParty(seed, day * 1440 + (SEASON[0]?.startMinuteOfDay ?? 300) - 30);
  const climb = startClimb(seed, day, people, SEASON[0]?.id ?? 'hollin', 1);
  const season: SeasonState = {
    v: 1,
    seed,
    climbNo: 1,
    people: [],
    history: [],
    start: snapshot(climb),
    over: false,
  };
  return { season, climb };
}

/** Close a played climb into the season, then live the valley days and start the next climb (or end). */
export function nextClimb(season: SeasonState, played: ClimbState, branch: Branch | null): ClimbState | null {
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
  const people = played.people;
  valley(people, played.minute, day * 1440 + next.startMinuteOfDay);
  season.climbNo = played.climbNo + 1;
  const climb = startClimb(season.seed, day, people, next.id, season.climbNo);
  aftermath(climb, season.history.at(-1)?.facts ?? {});
  season.start = snapshot(climb);
  season.people = [];
  return climb;
}

/**
 * The next climb opens on what the last one left: who spent the night out and was brought down, who is still hurt
 * (read from the HF body), and who has stopped trusting you (read from HF voice trust). Words, never numbers.
 */
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
        )} spent the night out. The hut warden's party brought ${out.length > 1 ? 'them' : out[0]?.they === 'she' ? 'her' : 'him'} down at first light.`,
      undefined,
    ]);
  for (const p of climb.people) {
    const m = MEMBERS.find((x) => x.id === p.id);
    if (!m) continue;
    const cap = readPerson(p).body.capacity;
    const f = facts[m.id];
    if (f && (hurtLevel(f.hurt) === 'hurt' || hurtLevel(f.hurt) === 'badly'))
      lines.push([
        cap < 0.7
          ? `${m.name} was still hurt from ${f.hurtWhere ?? 'the last climb'}, and came anyway.`
          : `${m.name}'s knock from ${f.hurtWhere ?? 'the last climb'} had mostly mended.`,
        m.id,
      ]);
    const trust = voiceOf(p, LEADER)?.trust ?? 0.5;
    if (trust < 0.35) lines.push([`${m.name} hardly looked at you over breakfast.`, m.id]);
    else if (trust > 0.75) lines.push([`${m.name} saved you the good mug.`, m.id]);
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
export function valley(people: Person[], from: number, to: number): void {
  for (const p of people) {
    let now = Math.max(from, p.now);
    if (p.activity) {
      tick(p, now);
      finish(p, {
        affordanceId: p.activity.affordanceId,
        action: p.activity.action,
        status: 'interrupted',
        at: now,
      });
    }
    const offers: Affordance[] = [
      ...VALLEY,
      ...MEMBERS.filter((m) => m.id !== p.id).map(
        (m): Affordance => ({
          id: `talk:${m.id}`,
          action: 'talk',
          label: `talk with ${m.name}`,
          targetId: m.id,
          with: [m.id],
          duration: 60,
          effort: 0.05,
          advertises: { belonging: 0.4, leisure: 0.15 },
          tags: ['social'],
        }),
      ),
    ];
    while (now < to) {
      tick(p, now);
      const rec = decide(p, offers);
      const aff = offers.find((o) => o.id === rec.chosenAffordanceId);
      if (!aff) {
        now += 30;
        continue;
      }
      begin(p, aff, rec);
      const end = Math.min(to, p.activity?.endsAt ?? now + aff.duration);
      tick(p, end);
      finish(p, {
        affordanceId: aff.id,
        action: aff.action,
        status: end < (p.activity?.endsAt ?? end) ? 'interrupted' : 'completed',
        at: end,
        ...(aff.action === 'eat' ? { needs: { food: 0.8, water: 0.4 } } : {}),
        ...(aff.action === 'talk' && aff.targetId
          ? {
              percepts: [
                {
                  at: end,
                  channel: 'social' as const,
                  kind: 'chat',
                  actorId: aff.targetId,
                  targetId: p.id,
                  salience: 0.4,
                  valence: 0.2,
                  summary: `I talked with ${aff.label.replace('talk with ', '')}`,
                },
              ],
            }
          : {}),
      });
      now = Math.max(end, now + 1);
    }
    tick(p, to);
  }
}

/** Playtest export (AGENTS.md): seed, start state, input log and final state replay the player's climb. */
export interface PlaytestExport {
  game: 'rope';
  v: 1;
  engine: string;
  seed: number;
  climbNo: number;
  /** Day of the season, 1-based (the simulation's own day counter starts at FIRST_DAY). */
  seasonDay: number;
  mountain: string;
  start: string;
  inputs: ClimbState['inputs'];
  state: string;
}

export function exportClimb(start: string, s: ClimbState, engine: string): PlaytestExport {
  return {
    game: 'rope',
    v: 1,
    engine,
    seed: s.seed,
    climbNo: s.climbNo,
    seasonDay: s.day - FIRST_DAY + 1,
    mountain: s.mountain,
    start,
    inputs: s.inputs,
    state: snapshot(s),
  };
}

/**
 * Reconstruct an export snapshot at its saved minute. Unversioned releases used several narration revisions.
 * Their saved words identify the narrator revision only; the simulation regenerates every line and journal entry.
 * A start state and input log alone cannot distinguish those releases. Rules 2 identifies the current narrator.
 * This reconstructs a snapshot only: the temporary legacy override is removed to preserve the saved JSON shape.
 * Continuing an unversioned result with step() requires an explicit narration version.
 */
export function replayExport(e: PlaytestExport): ClimbState {
  const start = restore(e.start);
  const saved = restore(e.state);
  let narration: NarrationVersion | undefined;
  if (start.rules === undefined && start.narration === undefined) {
    const causes = saved.lines.some((l) =>
      / (?:My food's gone|One of us is tied in already|.+?'s too far off to tie to)\.$/.test(l.says),
    );
    const truthfulEscort = saved.journal.some((j) =>
      / (?:turned to go down toward .+, who is far off|went down with [^,.]+)\.$/.test(j.text),
    );
    narration = truthfulEscort ? 3 : causes ? 2 : 1;
  }
  return replay(e.start, e.inputs, saved.minute, narration);
}
