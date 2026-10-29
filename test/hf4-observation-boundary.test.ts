import { readRunHistory, replay as replayHF } from '@adam0white/human-framework';
import { expect, it } from 'vitest';
import { advanceFrame, drainAdvance, restore, snapshot } from '../src/sim/climb.ts';
import { archiveOf, enqueue } from '../src/sim/hf4.ts';
import { newSeason } from '../src/sim/season.ts';

it('admits a new host observation after a pending resolution and preserves cold continuation', () => {
  const { climb } = newSeason(7);
  advanceFrame(climb);
  expect(climb.hfPhase?.result?.boundary.type).toBe('world-required');
  // A host observation can arrive after HF has requested a receipt within this minute.
  enqueue(climb, 'context.received', {
    person: 'oskar',
    evidenceId: 'boundary-observation',
    context: { kind: 'scarcity', value: 0.3 },
  });
  const resumed = restore(snapshot(climb));
  drainAdvance(climb);
  drainAdvance(resumed);
  expect(snapshot(resumed)).toBe(snapshot(climb));
  const archive = archiveOf(climb);
  expect(
    readRunHistory(archive)
      .flatMap((tx) => tx.inputs)
      .some(
        (input) => input.kind === 'context.received' && input.payload.evidenceId === 'boundary-observation',
      ),
  ).toBe(true);
  const replayed = replayHF(archive);
  expect(replayed.ok && replayed.value.verified && replayed.value.fullHash === archive.hashes.full).toBe(
    true,
  );
});
