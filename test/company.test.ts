import { readFileSync } from 'node:fs';
import { readRunHistory } from '@adam0white/human-framework';
import { expect, it } from 'vitest';
import { canHear, memberState, queueInput, replay, startClimb, step } from '../src/sim/climb.ts';
import { archiveOf } from '../src/sim/hf4.ts';

/** Authored host positions and paths, not a claim that anyone climbed to the col. */
function atCol() {
  const s = startClimb(2, 3);
  for (const x of [...s.members, s.leader]) {
    x.pos = { place: 'col', leg: null, t: 0 };
    x.path = ['meadow', 'moraine', 'snow'];
  }
  for (const x of s.members) x.high = 'col';
  return s;
}

it('a lone descent requests company and waits 45 minutes before going alone', () => {
  const s = atCol();
  for (const x of s.members.filter((m) => m.id !== 'wren')) x.pos = { place: 'hut', leg: null, t: 0 };
  const input = queueInput(s, {
    t: 'say',
    to: 'wren',
    act: 'descend',
    force: 'insist',
  });
  for (let i = 0; i < 150; i++) step(s);
  expect(s.lines.some((l) => l.input === input && l.who === 'wren' && l.verdict === 'assented')).toBe(true);
  const ask = s.lines.find((l) => l.who === 'wren' && l.reason === 'asks:company');
  const alone = s.journal.find((j) => j.who === 'wren' && j.text.includes('went down alone'));
  expect(ask).toBeDefined();
  expect(alone).toBeDefined();
  expect(alone!.at - ask!.at).toBeGreaterThanOrEqual(45);
});

it('an escort request produces a real HF answer and honest physical effects', () => {
  const s = atCol();
  // Authored pending host request, used to exercise the response without inventing an HF decision.
  memberState(s, 'nell').asks = { at: s.minute };
  const input = queueInput(s, {
    t: 'say',
    to: 'tamar',
    act: 'escort',
    force: 'insist',
    with: 'nell',
  });
  step(s);
  expect(s.lines.find((l) => l.input === input && l.who === 'tamar')?.verdict).toBe('assented');
  expect(memberState(s, 'tamar').ropedTo).toBe('nell');
  expect(memberState(s, 'nell').ropedTo).toBe('tamar');
  expect(memberState(s, 'nell').asks).toBeNull();
  expect(
    s.journal.some((j) => j.who === 'tamar' && j.text.includes('went down with Nell, roped together')),
  ).toBe(true);
  for (let i = 0; i < 90; i++) step(s);
  const receipt = readRunHistory(archiveOf(s))
    .flatMap((t) => t.inputs)
    .find(
      (i) =>
        i.kind === 'action.resolved' &&
        i.payload.person === 'tamar' &&
        i.payload.outcome?.actionId === 'descend' &&
        i.payload.outcome.status === 'completed',
    );
  expect(receipt).toBeDefined();
  if (receipt?.kind === 'action.resolved')
    expect(receipt.payload.outcome!.end - receipt.payload.outcome!.start).toBeGreaterThan(0);
});

it('turning home answers a request within earshot', () => {
  const s = atCol();
  // Authored host request and location; no HF decision is simulated.
  const asker = memberState(s, 'wren');
  asker.asks = { at: s.minute };
  expect(canHear(s, asker.id)).toBe(true);
  queueInput(s, { t: 'lead', dir: 'down' });
  step(s);
  expect(asker.asks).toBeNull();
  expect(s.journal.some((j) => j.who === asker.id && j.text.includes('had someone to walk down with'))).toBe(
    true,
  );
});

it('refuses the legacy owner replay without changing its source file', () => {
  const url = new URL('../docs/playtests/owner-2026-10-19-kestrel-334144833.json', import.meta.url);
  const original = readFileSync(url, 'utf8');
  const e = JSON.parse(original);
  expect(() => replay(e.start, e.inputs, undefined, 3)).toThrow(/fresh|unsupported|older/i);
  expect(readFileSync(url, 'utf8')).toBe(original);
});
