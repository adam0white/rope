/** The scene uses a neutral figure when no outward condition has been observed.
 * The host's private body, feelings and trust are not player evidence. */
import type { Person } from '../sim/hf4.ts';

export interface Look {
  stride: number;
  lean: number;
  hunch: number;
  limp: number;
  gaze: number;
  bowed: number;
  blot: number;
  downed: boolean;
  protest: boolean;
}

/** Neutral drawing parameters describe no observed condition or relationship. */
export function lookOf(_person: Person): Look {
  return {
    stride: 1,
    lean: 0.06,
    hunch: 0,
    limp: 0,
    gaze: 0,
    bowed: 0,
    blot: 0,
    downed: false,
    protest: false,
  };
}

/** No outward condition reading is available for another person yet. */
export function moodWord(_person: Person, _cold: number): string {
  return '';
}
