import { expect, it } from 'vitest';
import { snapshot } from '../src/sim/climb.ts';
import { DAYS_BETWEEN, dayOfClimb, newSeason, nextClimb } from '../src/sim/season.ts';

it('keeps four real calendar days between the three mountain openings', () => {
  expect([1, 2, 3].map(dayOfClimb)).toEqual([3, 7, 11]);
  expect(DAYS_BETWEEN).toBe(4);
});
it('closes the last season without replacing its people or source Run', () => {
  const { climb, season } = newSeason(4);
  climb.climbNo = 3;
  climb.over = true;
  const initial = snapshot(climb);
  expect(nextClimb(season, climb, null)).toBeNull();
  expect(season.over).toBe(true);
  expect(season.people).toEqual(climb.people);
  expect(season.past![0]!.state).toBe(initial);
});
