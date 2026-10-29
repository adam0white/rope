/** One headless host control: optional HF bodily intake/voiding and exact replay.
 * Run with Node >=24: node scripts/field-control.ts. No browser, model or shelf. */
import { strict as assert } from 'node:assert';
import { readBladder } from '@adam0white/human-framework';
import { personOf, queueInput, replay, snapshot, startClimb, step } from '../src/sim/climb.ts';

const climb = startClimb(4, 3);
const start = snapshot(climb);
const rng = climb.people.map((p) => JSON.stringify(p.rng));
queueInput(climb, { t: 'field-rules', bladder: true });
step(climb);
queueInput(climb, { t: 'say', to: 'oskar', act: 'drink', force: 'ask' });
let voids = 0;
for (let i = 0; i < 600; i++) {
  const before = readBladder(personOf(climb, 'oskar'))?.urgency ?? 0;
  step(climb);
  const after = readBladder(personOf(climb, 'oskar'))?.urgency ?? 0;
  if (before > 0 && after === 0) voids++;
}
assert(voids > 0, 'HF chose and completed a genuine step-aside offer');
assert.deepEqual(
  climb.people.map((p) => JSON.stringify(p.rng)),
  rng,
  'temperature-zero Person RNG remains unused',
);
assert.equal(snapshot(replay(start, climb.inputs, climb.minute)), snapshot(climb));
console.log(`field-control PASS: ${voids} completed voids, full replay exact, Person RNG unchanged`);
