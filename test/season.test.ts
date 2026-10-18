import { describe, expect, it } from 'vitest';
import { replay, snapshot } from '../src/sim/climb.ts';
import { exportClimb, newSeason, nextClimb } from '../src/sim/season.ts';
import { playScripted } from './script.ts';

describe('a season', () => {
  it('carries the same people across three mountains and each climb replays from its export', () => {
    const { season, climb } = newSeason(7);
    let c: ReturnType<typeof nextClimb> = climb;
    const mountains: string[] = [];
    while (c) {
      const start = season.start ?? '';
      playScripted(c, { turnAt: 12 * 60 + 30 });
      const ex = exportClimb(start, c, '2.3.0');
      expect(snapshot(replay(ex.start, ex.inputs))).toBe(ex.state);
      mountains.push(c.mountain);
      c = nextClimb(season, c, null);
    }
    expect(mountains).toEqual(['hollin', 'tooth', 'kestrel']);
    expect(season.over).toBe(true);
    expect(season.history).toHaveLength(3);
    // Memory carries: the people remember the first climb on the last.
    const tamar = season.people.find((p) => p.id === 'tamar');
    expect(tamar?.memory.episodes.length).toBeGreaterThan(0);
  });
});
