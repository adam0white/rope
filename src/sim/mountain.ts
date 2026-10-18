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
    l('snow', 'moraine', 'col', 'the snow to the col', 'snow', 85, 0.45, 0.05, 0.012, false, 0.65),
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
  return { id, from, to, name, kind, minutes, exposure, rockfall, footing, fixable, effort };
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
    stormAt: Math.round(12 * 60 + 210 * hashUnit(seed, DRAW.storm, day, 0)),
    stormStrength: 0.45 + 0.5 * hashUnit(seed, DRAW.storm, day, 1),
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
  return perHour / 60;
}
