import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { queueInput, restore, snapshot, step } from '../src/sim/climb.ts';
import { archiveOf, FRAMEWORK_VERSION } from '../src/sim/hf4.ts';
import { exportClimb, newSeason, replayExport } from '../src/sim/season.ts';
import { proofHash } from './prose-proof.ts';

it('pins the current published HF runtime in complete replay and source archives', () => {
  expect(FRAMEWORK_VERSION).toBe('4.10.0');
  const { climb, season } = newSeason(7);
  queueInput(climb, { t: 'lead', dir: 'up' });
  for (let i = 0; i < 3; i++) step(climb);
  const exported = exportClimb(season.start!, climb, FRAMEWORK_VERSION);
  expect(exported.v).toBe(2);
  expect(snapshot(replayExport(exported))).toBe(exported.state);
  expect(archiveOf(climb).engine.package).toBe('@adam0white/human-framework@4.10.0');
});
it('refuses old HF3 saves explicitly instead of converting private actors', () => {
  expect(() => restore(JSON.stringify({ v: 1, castEdition: 'one-cast-1', people: [] }))).toThrow(
    /fresh|unsupported|older/i,
  );
  for (const file of ['commonstead-oskar-221.json', 'commonstead-oskar-hf3.json']) {
    const historical = JSON.parse(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8'));
    expect(historical.raw).toBeDefined(); // Preserve the exact original fixture as historical evidence.
  }
});
it('tells players to start fresh when a 4.8 save is restored', () => {
  const { climb } = newSeason(7);
  const old = JSON.parse(snapshot(climb));
  old.hf.engine.package = '@adam0white/human-framework@4.8.1';
  expect(() => restore(JSON.stringify(old))).toThrow(/start a fresh season/i);
});
it('retains current full-state replay hashes', () => {
  const { climb } = newSeason(7);
  for (let i = 0; i < 3; i++) step(climb);
  expect(proofHash(JSON.parse(snapshot(climb)))).toBe(
    'f6ada1620dd2949f6e9d06c5fb3e84b7f340af063b1be382bd8c68ee05c4a3bc',
  );
});
