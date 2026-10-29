import { expect, it } from 'vitest';
import { replay, snapshot, startClimb } from '../src/sim/climb.ts';
import { factsOf } from '../src/sim/debrief.ts';
import { playScripted } from './script.ts';

// Regression (Fable, 2026-10-18): a save taken during the end of the day, with the stamp still showing,
// must replay to the same finished climb so resume opens the read-back, not a dead map.
it('a save taken mid-ending replays to the finished climb and its read-back', () => {
  for (const seed of [1, 3, 7]) {
    const s0 = startClimb(seed, 3);
    const start = snapshot(s0);
    const done = playScripted(s0, { turnAt: 12 * 60 });
    expect(done.over).toBe(true);
    // The save during the stamp: the same inputs and minute as the finished climb.
    const r = replay(start, done.inputs, done.minute);
    expect(r.over).toBe(true);
    expect(r.journal).toEqual(done.journal);
    expect(factsOf(r)).toEqual(factsOf(done));
  }
});
