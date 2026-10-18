/**
 * World randomness keyed by place and minute (pattern from HF's game The Night Watch, `worldRng`/`hashUnit`).
 * Every world draw is a pure function of the seed, what it is for, where and when. Nothing the player does can move
 * a draw that it does not itself change the key of, so a replay with one input removed sees the same mountain.
 */

/** A 32-bit mix of integers (murmur3's finaliser over each). */
export function mixSeed(...xs: number[]): number {
  let h = 0x9e3779b9;
  for (const x of xs) {
    h = Math.imul(h ^ (x | 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h | 0;
}

/** A uniform draw in [0, 1) from integers alone. */
export function hashUnit(...xs: number[]): number {
  return (mixSeed(...xs) >>> 0) / 4294967296;
}

/** What a world draw is for. Each kind is its own stream. */
export const DRAW = {
  storm: 1,
  wind: 2,
  slip: 3,
  slipSeverity: 4,
  slipPart: 5,
  party: 6,
  rock: 7,
} as const;
