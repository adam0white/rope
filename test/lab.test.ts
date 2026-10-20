import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { startClimb } from '../src/sim/climb.ts';
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

it('the stamp script writes public/release.json with the build', () => {
  execFileSync('node', ['scripts/stamp-release.ts'], { stdio: 'pipe' });
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
