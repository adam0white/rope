/** Full current-pin public climb and playtest-export proof; no browser, shelf or model. */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { readRunHistory, replay as replayHF } from '@adam0white/human-framework';
import { snapshot, startClimb } from '../src/sim/climb.ts';
import { FRAMEWORK_VERSION } from '../src/sim/hf4.ts';
import { exportClimb, replayExport } from '../src/sim/season.ts';
import { playScripted } from '../test/script.ts';

const began = performance.now();
const stamp = (stage: string) =>
  console.log(JSON.stringify({ stage, elapsedMs: Math.round(performance.now() - began) }));
const climb = startClimb(3, 3);
const start = snapshot(climb);
playScripted(climb, { turnAt: 12 * 60 });
assert.equal(climb.over, true);
stamp('complete-climb');
const exported = exportClimb(start, climb, FRAMEWORK_VERSION);
stamp('complete-export');
const restored = replayExport(exported);
assert.equal(snapshot(restored), exported.state);
stamp('complete-game-replay');
const archive = JSON.parse(exported.state).hf;
const verified = replayHF(archive);
assert.ok(verified.ok && verified.value.verified && verified.value.fullHash === archive.hashes.full);
stamp('complete-hf-replay');
const file = process.argv[2];
if (file) writeFileSync(file, gzipSync(JSON.stringify(exported)));
console.log(
  JSON.stringify({
    framework: FRAMEWORK_VERSION,
    minute: climb.minute,
    over: climb.over,
    inputs: climb.inputs.length,
    transactions: readRunHistory(archive).length,
    bytes: Buffer.byteLength(JSON.stringify(exported)),
    hfFullHash: archive.hashes.full,
    gameReplayExact: true,
    hfReplayExact: true,
    elapsedMs: Math.round(performance.now() - began),
  }),
);
