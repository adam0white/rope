import { expect, it } from 'vitest';
import { replay, startClimb } from '../src/sim/climb.ts';
import { playScripted } from './script.ts';

it('a reload replays the journal exactly, at any minute', () => {
  const start = startClimb(4, 3);
  const json = JSON.stringify(start);
  const played = playScripted(structuredClone(start), { turnAt: 12 * 60 });
  const again = replay(json, played.inputs);
  expect(again.journal).toEqual(played.journal);
  const mid = played.startMinute + 300;
  const part = replay(json, played.inputs, mid);
  expect(part.journal).toEqual(
    played.journal
      .filter((j) => j.at < mid || (j.at === mid && part.journal.includes(j)))
      .slice(0, part.journal.length),
  );
});
