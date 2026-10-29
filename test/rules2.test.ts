import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { queueInput, restore, snapshot, startClimb, step } from '../src/sim/climb.ts';
import { FRAMEWORK_VERSION } from '../src/sim/hf4.ts';
import { exportClimb, replayExport } from '../src/sim/season.ts';

// HF3 calibration and numerical samples are preserved verbatim in docs/history/hf3-tests.
// HF4 bodily relief is actual public work, proved separately by scripts/field-control.ts.
it.each(['owner-2026-10-18-hollin-334144833', 'owner-2026-10-19-kestrel-334144833'])(
  '%s refuses with a keep-file/start-fresh message without changing its source',
  (file) => {
    const path = new URL(`../docs/playtests/${file}.json`, import.meta.url);
    const text = readFileSync(path, 'utf8');
    expect(() => replayExport(JSON.parse(text))).toThrow(/Keep|fresh|older/i);
    expect(readFileSync(path, 'utf8')).toBe(text);
  },
);
it('ordinary fresh climbs use current rules and have no faculty selector', () => {
  const climb = startClimb(23, 3);
  expect(climb.castEdition).toBe('rope-hf4-1');
  expect(climb.rules).toBe(2);
  expect(climb.fieldRules?.bladder).toBe(true);
  const old = JSON.parse(snapshot(climb));
  delete old.hf;
  expect(() => restore(JSON.stringify(old))).toThrow(/Keep the file and start a fresh/);
});
it('a current export replays complete state and refuses edited saved words', () => {
  const climb = startClimb(23, 3);
  const start = snapshot(climb);
  queueInput(climb, { t: 'say', to: 'oskar', act: 'climb', force: 'ask' });
  for (let i = 0; i < 15; i++) step(climb);
  const exported = exportClimb(start, climb, FRAMEWORK_VERSION);
  expect(snapshot(replayExport(exported))).toBe(exported.state);
  const original = exported.state;
  const edited = JSON.parse(original);
  edited.journal[0].text = 'This edited journal must never become replay output.';
  expect(() => replayExport({ ...exported, state: JSON.stringify(edited) })).toThrow(
    /Keep|fresh|replay|changed/i,
  );
  expect(exported.state).toBe(original);
});
