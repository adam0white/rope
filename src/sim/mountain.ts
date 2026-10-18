/**
 * The mountain: a small graph of named places joined by legs, the weather over the day and the hazard on each leg.
 * Scope: one hut, one summit, at most one fork (two routes that rejoin at the top). Weather is one value per minute
 * for the whole mountain; a leg's exposure decides how much of it a climber feels. Rockfall follows the sun. It does
 * not model snow conditions, visibility, avalanches or route finding.
 */
import { DRAW, hashUnit } from './rng.ts';

export type LegKind = 'path' | 'scree' | 'snow' | 'ridge' | 'gully';

export interface Place {
  id: string;
  name: string;
  /** Metres above sea level. */
  alt: number;
  /** Horizontal metres from the hut, for drawing and earshot. */
  x: number;
}

export interface Leg {
  id: string;
  /** Lower end. */
  from: string;
  /** Upper end. */
  to: string;
  name: string;
  kind: LegKind;
  /** Minutes for a fresh climber going up. Descending takes `DESCENT_FACTOR` of it. */
  minutes: number;
  /** 0..1: how much of the wind reaches you here. */
  exposure: number;
  /** 0..1: how much loose rock the afternoon sun brings down here. */
  rockfall: number;
  /** Footing hazard at its calmest, slips per hour of climbing. */
  footing: number;
  /** The leader can fix a rope here. */
  fixable: boolean;
  /** Physical effort 0..1. */
  effort: number;
}

export interface Mountain {
  id: string;
  name: string;
  places: Place[];
  legs: Leg[];
  hut: string;
  summit: string;
  /** Minute of day the party leaves the hut. */
  startMinuteOfDay: number;
  /** Minute of day it is dark. */
  duskMinuteOfDay: number;
  /** Journal lines that carry the season's story, said once: at the start, on reaching a place, at the top. */
  beats: Beat[];
  /** Small things on the approach, one every half hour of the first hours: the walk-in is never empty. */
  approach?: string[];
}

/** A line of the story, implied rather than told. `when` is 'start', 'summit' or a place id. */
export interface Beat {
  when: string;
  text: string;
  who?: string;
}

export const DESCENT_FACTOR = 0.7;

export function place(m: Mountain, id: string): Place {
  const p = m.places.find((x) => x.id === id);
  if (!p) throw new Error(`no place ${id}`);
  return p;
}

export function leg(m: Mountain, id: string): Leg {
  const l = m.legs.find((x) => x.id === id);
  if (!l) throw new Error(`no leg ${id}`);
  return l;
}

/** Legs leading up from a place. */
export const legsUp = (m: Mountain, from: string): Leg[] => m.legs.filter((l) => l.from === from);

/** Index of a leg, used as the place key of world draws. */
export const legIndex = (m: Mountain, id: string): number => m.legs.findIndex((l) => l.id === id);

/** The first climb of the season: Hollin Crag. Two ways from the col: the long ridge or the short gully. */
export const HOLLIN: Mountain = {
  id: 'hollin',
  name: 'Hollin Crag',
  hut: 'hut',
  summit: 'summit',
  startMinuteOfDay: 5 * 60,
  duskMinuteOfDay: 19 * 60 + 30,
  approach: [
    'Cowbells somewhere below, then nothing but boots on the path.',
    'The sun found the top of the crag before it found any of you.',
    'Someone had built a little cairn by the path. Oskar added a stone.',
    'The meadow grass was soaked; everyone’s socks were wet by the stile.',
    'A marmot whistled from the boulders and was gone.',
    'The path steepened. Talk thinned to the odd word.',
  ],
  beats: [
    { when: 'start', text: 'Ezra’s map was still pinned up in the hut, his pencil line going up the gully.' },
    {
      when: 'col',
      who: 'tamar',
      text: 'At the col Tamar looked at the gully for a long time and said nothing.',
    },
    {
      when: 'summit',
      who: 'bilal',
      text: 'On the top Bilal took a small tin from his pack, turned it over, and put it back.',
    },
  ],
  places: [
    { id: 'hut', name: 'the hut', alt: 1400, x: 0 },
    { id: 'meadow', name: 'the meadow', alt: 1720, x: 1300 },
    { id: 'moraine', name: 'the moraine', alt: 2060, x: 2500 },
    { id: 'col', name: 'the col', alt: 2420, x: 3500 },
    { id: 'tower', name: 'the tower', alt: 2680, x: 3900 },
    { id: 'gully-top', name: 'the gully top', alt: 2790, x: 4250 },
    { id: 'summit', name: 'the summit', alt: 2910, x: 4500 },
  ],
  legs: [
    l('meadow', 'hut', 'meadow', 'the hut path', 'path', 70, 0.1, 0, 0.004, false, 0.45),
    l('moraine', 'meadow', 'moraine', 'the moraine', 'scree', 75, 0.25, 0.1, 0.01, false, 0.6),
    l('snow', 'moraine', 'col', 'the snow slope below the col', 'snow', 85, 0.45, 0.05, 0.012, false, 0.65),
    l('ridge', 'col', 'tower', 'the ridge', 'ridge', 80, 1, 0.05, 0.016, true, 0.7),
    l('step', 'tower', 'summit', 'the summit step', 'ridge', 55, 0.9, 0.05, 0.03, true, 0.75),
    l('gully', 'col', 'gully-top', 'the gully', 'gully', 60, 0.2, 1, 0.012, true, 0.7),
    l('scramble', 'gully-top', 'summit', 'the last scramble', 'scree', 30, 0.6, 0.2, 0.01, false, 0.6),
  ],
};

function l(
  id: string,
  from: string,
  to: string,
  name: string,
  kind: LegKind,
  minutes: number,
  exposure: number,
  rockfall: number,
  footing: number,
  fixable: boolean,
  effort: number,
): Leg {
  return {
    id,
    from,
    to,
    name,
    kind,
    minutes: Math.round(
      minutes * 1.3,
    ) /* big mountains (2026-10-18 tuning): the top comes as the weather turns */,
    exposure,
    rockfall,
    footing,
    fixable,
    effort,
  };
}

/** The day's weather for a seed and day. */
export interface Weather {
  /** Minute of day the afternoon storm arrives. */
  stormAt: number;
  /** How hard it hits, 0..1. */
  stormStrength: number;
}

export function weatherFor(seed: number, day: number): Weather {
  return {
    stormAt: Math.round(11 * 60 + 180 * hashUnit(seed, DRAW.storm, day, 0)),
    stormStrength: 0.6 + 0.4 * hashUnit(seed, DRAW.storm, day, 1),
  };
}

const clamp = (x: number, lo = 0, hi = 1): number => Math.max(lo, Math.min(hi, x));

/** Wind 0..1 at an absolute minute: hourly gusts keyed by the hour, plus the storm's build and blow. */
export function windAt(seed: number, w: Weather, minute: number): number {
  const day = Math.floor(minute / 1440);
  const mod = minute - day * 1440;
  const h = Math.floor(mod / 60);
  const f = (mod % 60) / 60;
  const a = hashUnit(seed, DRAW.wind, day, h);
  const b = hashUnit(seed, DRAW.wind, day, h + 1);
  const gust = 0.08 + 0.18 * (a + (b - a) * f);
  const toStorm = mod - w.stormAt;
  const storm =
    toStorm < -90 ? 0 : toStorm < 0 ? (0.35 * (toStorm + 90)) / 90 : 0.35 + 0.65 * clamp(toStorm / 60);
  return clamp(gust + storm * w.stormStrength);
}

/** Sun on the rock 0..1: rises through the morning, highest early afternoon, gone at the storm. */
export function sunAt(w: Weather, minute: number): number {
  const mod = minute % 1440;
  if (mod > w.stormAt) return 0.1;
  return clamp((mod - 9 * 60) / (4 * 60));
}

/** Air feeling cold 0..1 for the drawing: altitude, wind and the hour. */
export function coldAt(seed: number, w: Weather, minute: number, alt: number): number {
  const mod = minute % 1440;
  const night = mod < 7 * 60 || mod > 19 * 60 ? 0.35 : 0;
  return clamp(((alt - 1400) / 1500) * 0.5 + windAt(seed, w, minute) * 0.5 + night);
}

/** Slip chance per minute for one climber on a leg at a minute (before rope and fixed-rope protection). */
export function slipChance(seed: number, w: Weather, lg: Leg, minute: number): number {
  const perHour =
    lg.footing + lg.exposure * windAt(seed, w, minute) * 0.09 + lg.rockfall * sunAt(w, minute) * 0.1;
  // 0.6: tuned 2026-10-18 from 18 of 60 people hurt across 12 scripted Hollin days (docs/findings.md).
  return (0.6 * perHour) / 60;
}

/** The second climb: The Tooth. Steeper and earlier; the notch splits a snow couloir from the east arête. */
export const TOOTH: Mountain = {
  id: 'tooth',
  name: 'The Tooth',
  hut: 'hut',
  summit: 'summit',
  startMinuteOfDay: 4 * 60 + 30,
  duskMinuteOfDay: 19 * 60 + 15,
  approach: [
    'Larch needles underfoot, soft as a carpet in the dark.',
    'Through the trees the Tooth showed for a moment, black against grey.',
    'A stream crossing on wobbling stones. Nobody fell in.',
    'The wood ended all at once, and the screes began.',
    'A rock went clattering down somewhere above, far off to the side.',
    'The screes slid two steps back for every three.',
  ],
  beats: [
    { when: 'start', text: 'Nobody sat in the chair by the stove. It had been Ezra’s.' },
    { when: 'notch', who: 'wren', text: 'Wren said Ezra had always said the arête was the honest way up.' },
    {
      when: 'summit',
      who: 'oskar',
      text: 'Oskar was quiet on the top for once. He built a small cairn and did not say who it was for.',
    },
  ],
  places: [
    { id: 'hut', name: 'the hut', alt: 1250, x: 0 },
    { id: 'wood', name: 'the larch wood', alt: 1560, x: 1100 },
    { id: 'screes', name: 'the screes', alt: 1950, x: 2100 },
    { id: 'notch', name: 'the notch', alt: 2300, x: 2900 },
    { id: 'shelf', name: 'the snow shelf', alt: 2520, x: 3150 },
    { id: 'gendarme', name: 'the gendarme', alt: 2480, x: 3400 },
    { id: 'summit', name: 'the summit', alt: 2660, x: 3600 },
  ],
  legs: [
    l('wood', 'hut', 'wood', 'the wood path', 'path', 60, 0.05, 0, 0.004, false, 0.45),
    l('screes', 'wood', 'screes', 'the screes', 'scree', 85, 0.3, 0.25, 0.014, false, 0.65),
    l('notch', 'screes', 'notch', 'the notch gully', 'gully', 75, 0.2, 0.7, 0.014, true, 0.7),
    l('couloir', 'notch', 'shelf', 'the north couloir', 'snow', 55, 0.3, 0.3, 0.02, true, 0.75),
    l('headwall', 'shelf', 'summit', 'the headwall', 'snow', 40, 0.6, 0.2, 0.03, true, 0.8),
    l('arete', 'notch', 'gendarme', 'the east arête', 'ridge', 75, 1, 0.05, 0.02, true, 0.7),
    l('crest', 'gendarme', 'summit', 'the crest', 'ridge', 40, 1, 0.05, 0.025, false, 0.7),
  ],
};

/** The last climb: Kestrel Pike, the one Ezra turned back on. Long, high, one way up. */
export const KESTREL: Mountain = {
  id: 'kestrel',
  name: 'Kestrel Pike',
  hut: 'hut',
  summit: 'summit',
  startMinuteOfDay: 4 * 60,
  duskMinuteOfDay: 19 * 60,
  approach: [
    'Headtorches bobbing in a line along the tarn.',
    'The ice on the tarn creaked as the first light touched it.',
    'Frost on the moraine boulders; every hand went into a pocket.',
    'The glacier came into view, grey and enormous, and nobody said anything.',
    'Crampons on, by the edge of the ice, fingers clumsy with cold.',
    'Far above, the wall caught the sun.',
  ],
  beats: [
    {
      when: 'start',
      text: 'In the hut book, two summers back: “Turned at the shoulder. Wind. Next year. E.”',
    },
    {
      when: 'shoulder',
      who: 'tamar',
      text: 'At the shoulder Tamar touched the rock where the book said he had turned.',
    },
    {
      when: 'summit',
      who: 'bilal',
      text: 'Bilal opened the tin at last. Tea, the cheap kind Ezra liked. They made it on the top, in his mug, and passed it round.',
    },
  ],
  places: [
    { id: 'hut', name: 'the hut', alt: 1650, x: 0 },
    { id: 'lake', name: 'the tarn', alt: 1900, x: 1000 },
    { id: 'glacier', name: 'the glacier', alt: 2350, x: 2200 },
    { id: 'schrund', name: 'the bergschrund', alt: 2700, x: 3100 },
    { id: 'shoulder', name: 'the shoulder', alt: 3020, x: 3700 },
    { id: 'summit', name: 'the summit', alt: 3290, x: 4300 },
  ],
  legs: [
    l('lake', 'hut', 'lake', 'the tarn path', 'path', 55, 0.15, 0, 0.004, false, 0.45),
    l('glacier', 'lake', 'glacier', 'the moraine and the ice', 'snow', 85, 0.4, 0.1, 0.008, false, 0.5),
    l('schrund', 'glacier', 'schrund', 'the upper glacier', 'snow', 70, 0.5, 0.05, 0.012, false, 0.6),
    l('wall', 'schrund', 'shoulder', 'the ice wall', 'snow', 60, 0.6, 0.35, 0.022, true, 0.75),
    l('summit-ridge', 'shoulder', 'summit', 'the summit ridge', 'ridge', 60, 1, 0.05, 0.016, true, 0.65),
  ],
};

/** The season, in order. */
export const SEASON: Mountain[] = [HOLLIN, TOOTH, KESTREL];
