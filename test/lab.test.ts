import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { queueInput, snapshot, startClimb, step } from '../src/sim/climb.ts';
import { exportClimb } from '../src/sim/season.ts';
import { climbMilestones, climbScreen } from '../src/ui/labnames.ts';
import { playScripted } from './script.ts';

it('lab names are short, stable and carry no player text', () => {
  const done = playScripted(startClimb(3, 3), { turnAt: 12 * 60 });
  const names = [
    ...climbMilestones(done),
    climbScreen(done, 'hut'),
    climbScreen(done, 'climb'),
    climbScreen(done, 'debrief'),
  ];
  expect(climbMilestones(done)[0]).toBe(`climb ${done.climbNo} done`);
  for (const n of names) expect(n).toMatch(/^[a-z0-9: ]{1,40}$/);
  // Same climb, same names.
  expect(climbMilestones(playScripted(startClimb(3, 3), { turnAt: 12 * 60 }))).toEqual(climbMilestones(done));
});

it('the released lab-kit stamp writes public/release.json with the build', () => {
  execFileSync('node', ['node_modules/@adam0white/lab-kit/bin/stamp-release'], { stdio: 'pipe' });
  const r = JSON.parse(readFileSync('public/release.json', 'utf8'));
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const hf = JSON.parse(readFileSync('node_modules/@adam0white/human-framework/package.json', 'utf8'));
  expect(r.app).toBe(pkg.version);
  expect(r.framework).toBe(hf.version);
  expect(typeof r.commit).toBe('string');
  expect(typeof r.dirty).toBe('boolean');
});

it('the CSP lets the lab client reach the lab, and the service worker never caches the stamp', () => {
  expect(readFileSync('public/_headers', 'utf8')).toMatch(
    /connect-src [^;]*https:\/\/human\.adamwhite\.work/,
  );
  expect(readFileSync('public/sw.js', 'utf8')).toContain("'/release.json'");
});

it('the replay CLI reconstructs a downloaded in-progress run at its saved minute', () => {
  const climb = startClimb(41, 3);
  const start = snapshot(climb);
  queueInput(climb, { t: 'promise', hour: 12 });
  step(climb);
  const dir = mkdtempSync(join(tmpdir(), 'rope-export-'));
  try {
    const path = join(dir, 'partial.json');
    writeFileSync(path, JSON.stringify(exportClimb(start, climb, '2.8.0')));
    const output = execFileSync('node', ['scripts/replay-export.ts', path], { encoding: 'utf8' });
    expect(output).toContain(
      'replay matches saved answers: true; journal text identical: true; over=false; minute 05:01',
    );
  } finally {
    rmSync(dir, { recursive: true });
  }
});
