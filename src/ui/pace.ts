/**
 * The game's clock against real time. Normal speed runs a 16-hour day in about 20 real minutes (48 game minutes per
 * real minute); fast is three times that. A slowdown (an answer that disagrees, a fall, a story line, a margin note)
 * briefly drops the clock to `slowFactor` for `slowMs`. `test/pacing.test.ts` models a scripted climb against these.
 */
export const PACE = {
  slow: 0.15,
  normal: 0.8,
  fast: 2.4,
  slowFactor: 0.25,
  slowMs: 7000,
  /** Tutorial notes and story lines slow the clock only briefly: long enough to read the first words. */
  noteSlowMs: 2500,
  /** Real seconds a tutorial note is assumed to hold the player (reading it), for the model only. */
  noteHoldS: 7,
} as const;
