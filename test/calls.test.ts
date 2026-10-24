import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { replay } from '../src/sim/climb.ts';
import { haltReason, hurtCall, onlyWalkingLeft } from '../src/ui/calls.ts';

// The owner's Hollin climb (docs/playtests/owner-2026-10-18.md) as a fixture for the leader's calls.
const ex = JSON.parse(readFileSync('docs/playtests/owner-2026-10-18-hollin-334144833.json', 'utf8'));
const at = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return 3 * 1440 + (h ?? 0) * 60 + (m ?? 0);
};

it("Wren's fall at 14:31 calls the leader, and the call fades after 45 minutes", () => {
  const c = replay(ex.start, ex.inputs, at('14:35'));
  expect(hurtCall(c)).toMatchObject({ who: 'wren', where: 'the last scramble' });
  const later = replay(ex.start, ex.inputs, at('15:30'));
  expect(hurtCall(later)?.who).not.toBe('wren');
});

it('no call before anyone is hurt', () => {
  expect(hurtCall(replay(ex.start, ex.inputs, at('09:00')))).toBeNull();
});

it('the leader stopping on their own says why', () => {
  // The owner pressed "lead on" again and again between 13:41 and 17:04 while the leader kept stopping.
  expect(haltReason(replay(ex.start, ex.inputs, at('14:20')))).toBe(
    'You are waiting for Tamar Vale and Bilal to catch up.',
  );
  expect(haltReason(replay(ex.start, ex.inputs, at('16:47')))).toMatch(
    /summit step: it could take a fixed rope/,
  );
  expect(haltReason(replay(ex.start, ex.inputs, at('05:05')))).toBeNull();
});

it('after the turn, with nobody asking or freshly hurt, only the walk is left', () => {
  expect(onlyWalkingLeft(replay(ex.start, ex.inputs, at('12:00')))).toBe(false);
  expect(onlyWalkingLeft(replay(ex.start, ex.inputs, at('21:00')))).toBe(true);
});

it('the promised hour says who can hear the call and who cannot', async () => {
  const { queueInput, startClimb, step } = await import('../src/sim/climb.ts');
  const { promiseDue } = await import('../src/ui/calls.ts');
  const s = startClimb(2, 3);
  queueInput(s, { t: 'promise', hour: 9 });
  queueInput(s, { t: 'lead', dir: 'up' });
  while (s.minute < s.day * 1440 + 9 * 60 - 1) step(s);
  expect(promiseDue(s)).toBeNull();
  step(s);
  const due = promiseDue(s);
  expect(due?.hour).toBe(9);
  expect((due?.near.length ?? 0) + (due?.far.length ?? 0)).toBe(5);
  queueInput(s, { t: 'lead', dir: 'down' });
  step(s);
  step(s);
  expect(promiseDue(s)).toBeNull();
});
