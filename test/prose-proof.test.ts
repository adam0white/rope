import { expect, it } from 'vitest';
import { queueInput, replay, snapshot, startClimb, step } from '../src/sim/climb.ts';
import { FRAMEWORK_VERSION } from '../src/sim/hf4.ts';
import { exportClimb, replayExport } from '../src/sim/season.ts';
import { expectArchiveReplay } from './hf-narration-proof.ts';

it('preserves the full HF archive and exactly replays a current public input', () => {
  const s = startClimb(4, 3);
  const start = snapshot(s);
  queueInput(s, { t: 'say', to: 'oskar', act: 'climb', force: 'ask' });
  for (let i = 0; i < 10; i++) step(s);
  expectArchiveReplay(s);
  expect(snapshot(replay(start, s.inputs, s.minute))).toBe(snapshot(s));
  expect(snapshot(replayExport(exportClimb(start, s, FRAMEWORK_VERSION)))).toBe(snapshot(s));
});
