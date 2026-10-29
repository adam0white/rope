import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { queueInput, restore, snapshot, step } from '../src/sim/climb.ts';
import { archiveOf, FRAMEWORK_VERSION } from '../src/sim/hf4.ts';
import { exportClimb, newSeason, replayExport } from '../src/sim/season.ts';
import { proofHash } from './prose-proof.ts';

it('pins the current published HF runtime in complete replay and source archives', () => {
  expect(FRAMEWORK_VERSION).toBe('4.8.1');
  const { climb, season } = newSeason(7);
  queueInput(climb, { t: 'lead', dir: 'up' });
  for (let i = 0; i < 3; i++) step(climb);
  const exported = exportClimb(season.start!, climb, FRAMEWORK_VERSION);
  expect(exported.v).toBe(2);
  expect(snapshot(replayExport(exported))).toBe(exported.state);
  expect(archiveOf(climb).engine.package).toBe('@adam0white/human-framework@4.8.1');
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
it('retains current full-state replay hashes', () => {
  const { climb } = newSeason(7);
  for (let i = 0; i < 3; i++) step(climb);
  expect(proofHash(JSON.parse(snapshot(climb)))).toBe(
    '38d6095f121761f6184fcc998fbb9fce475b9e02d896e8ae9f0da2986be5a271',
  );
});
