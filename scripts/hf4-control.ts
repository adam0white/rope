/** Technical public-HF control. No browser, model calls or private actor mutation. */

import { performance } from 'node:perf_hooks';
import { replay as replayHF } from '@adam0white/human-framework';
import { advanceFrame, queueInput, replay, snapshot, startClimb, step } from '../src/sim/climb.ts';
import { archiveOf } from '../src/sim/hf4.ts';
import { SEASON } from '../src/sim/mountain.ts';
import { dayOfClimb, newSeason, valley } from '../src/sim/season.ts';

const { climb, season } = newSeason(7);
queueInput(climb, { t: 'say', to: 'oskar', act: 'climb', force: 'ask' });
queueInput(climb, { t: 'lead', dir: 'up' });
const started = performance.now();
const startingMinute = climb.minute,
  frames: { wallMs: number; cpuMs: number }[] = [];
while (climb.minute < startingMinute + 110 || climb.hfPhase) {
  const at = performance.now(),
    cpu = process.cpuUsage();
  advanceFrame(climb);
  if (climb.minute >= startingMinute + 10)
    frames.push({
      wallMs: performance.now() - at,
      cpuMs: Object.values(process.cpuUsage(cpu)).reduce((a, b) => a + b, 0) / 1000,
    });
}
const climbElapsedMs = performance.now() - started;
const percentile = (values: number[], p: number) =>
  values.toSorted((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))];
const initial = archiveOf(climb);
if (snapshot(replay(season.start!, climb.inputs, climb.minute)) !== snapshot(climb))
  throw Error('Game replay mismatch');
console.log(
  JSON.stringify({
    stage: 'climb',
    minutes: 110,
    elapsedMs: climbElapsedMs,
    frameSamplesAfter10minWarmup: frames.length,
    frameWallP95Ms: percentile(
      frames.map((f) => f.wallMs),
      0.95,
    ),
    frameWallMaxMs: Math.max(...frames.map((f) => f.wallMs)),
    frameCpuP95Ms: percentile(
      frames.map((f) => f.cpuMs),
      0.95,
    ),
    framesOver10ms: frames.filter((f) => f.wallMs > 10).length,
    transactions: initial.history.length,
    bytes: Buffer.byteLength(snapshot(climb)),
    path: climb.members.find((m) => m.id === 'oskar')!.path,
  }),
);
if (process.argv.includes('--frames-only')) process.exit(0);
const target = dayOfClimb(2) * 1440 + SEASON[1]!.startMinuteOfDay;
const valleyStarted = performance.now(),
  cpuStarted = process.cpuUsage();
valley(climb, target);
const continued = startClimb(7, dayOfClimb(2), undefined, SEASON[1]!.id, 2, archiveOf(climb), climb.hfActive);
const continuedOpening = snapshot(continued);
for (let i = 0; i < 3; i++) step(continued);
if (snapshot(replay(continuedOpening, continued.inputs, continued.minute)) !== snapshot(continued))
  throw Error('Continued game replay mismatch');
const full = archiveOf(continued),
  serialized = snapshot(continued);
const valleyCpuMs = Object.values(process.cpuUsage(cpuStarted)).reduce((a, b) => a + b, 0) / 1000;
const replayStarted = performance.now(),
  replayed = replayHF(full);
if (!replayed.ok || replayed.value.fullHash !== full.hashes.full) throw Error(JSON.stringify(replayed));
console.log(
  JSON.stringify({
    stage: 'valley-and-next-opening',
    from: initial.current.at / 60000,
    to: target,
    elapsedMs: replayStarted - valleyStarted,
    cpuMs: valleyCpuMs,
    transactions: full.history.length,
    archiveBytes: Buffer.byteLength(JSON.stringify(full)),
    stateBytes: Buffer.byteLength(serialized),
    fullHash: full.hashes.full,
    replayMs: performance.now() - replayStarted,
    replayExact: replayed.ok,
  }),
);
