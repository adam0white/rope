/** Current public host intake/voiding control. No browser, model or shelf. */
import assert from 'node:assert/strict';
import { replay as replayHF } from '@adam0white/human-framework';
import { queueInput, replay, snapshot, startClimb, step } from '../src/sim/climb.ts';
import { archiveOf, FRAMEWORK_VERSION, readBladder } from '../src/sim/hf4.ts';

const climb = startClimb(4, 3);
const start = snapshot(climb);
queueInput(climb, { t: 'say', to: 'oskar', act: 'drink', force: 'ask' });
for (let i = 0; i < 600 && !climb.over; i++) step(climb);
const archive = archiveOf(climb);
const completed = archive.history
  .flatMap((tx) => tx.inputs)
  .filter(
    (input) =>
      input.kind === 'action.resolved' &&
      input.payload.outcome?.status === 'completed' &&
      input.payload.outcome.actionId === 'relieve' &&
      input.payload.outcome.actual?.voidedBladder === true,
  );
assert.ok(completed.length > 0, 'At least one actor must actually finish a chosen step-aside action');
assert.ok(climb.people.every((p) => readBladder(p) !== undefined));
assert.equal(snapshot(replay(start, climb.inputs, climb.minute)), snapshot(climb));
const verified = replayHF(archive);
assert.ok(verified.ok && verified.value.verified && verified.value.fullHash === archive.hashes.full);
console.log(
  JSON.stringify({
    framework: FRAMEWORK_VERSION,
    completedVoids: completed.length,
    gameReplayExact: true,
    hfReplayExact: true,
    hfFullHash: archive.hashes.full,
  }),
);
