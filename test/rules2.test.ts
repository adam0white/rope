import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { replay, startClimb, step } from '../src/sim/climb.ts';
import { playScripted } from './script.ts';

// HF 2.8.0 host rules (docs/findings.md, 2026-10-19): fullness, no "step aside" offer, alongside and reconsider.

it('exports saved before rules 2 replay under the old rules and match their saved answers', () => {
  for (const f of ['owner-2026-10-18-hollin-334144833', 'owner-2026-10-19-kestrel-334144833']) {
    const e = JSON.parse(readFileSync(new URL(`../docs/playtests/${f}.json`, import.meta.url), 'utf8'));
    expect(JSON.parse(e.start).rules).toBeUndefined();
    const c = replay(e.start, e.inputs);
    const saved = JSON.parse(e.state);
    const key = (ls: { at: number; who: string; verdict: string }[]) =>
      JSON.stringify(ls.map((l) => [l.at, l.who, l.verdict]));
    expect(c.rules).toBeUndefined();
    expect(key(c.lines)).toBe(key(saved.lines));
    expect(c.journal.length).toBe(saved.journal.length);
  }
});

it('control: with nothing asked, nobody drinks all day, and no one steps aside as an HF act', () => {
  let drinks = 0;
  let relieves = 0;
  for (let seed = 1; seed <= 4; seed++) {
    const s = startClimb(seed, 3, undefined, 'kestrel');
    expect(s.rules).toBe(2);
    const last: Record<string, string> = {};
    while (!s.over && s.minute < s.startMinute + 1200) {
      step(s);
      for (const p of s.people) {
        const id = p.activity?.affordanceId ?? '';
        if (id === last[p.id]) continue;
        last[p.id] = id;
        if (id === 'drink') drinks++;
        if (id === 'relieve') relieves++;
      }
    }
  }
  // 20 person-days: the old loop gave about 20 drinks each.
  expect(drinks).toBeLessThan(20 * 10);
  expect(relieves).toBe(0);
});

it('control: roped partners mostly stay together on Kestrel', () => {
  let off = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const s = playScripted(startClimb(seed, 3, undefined, 'kestrel'), { turnAt: 12 * 60, careful: true });
    off += s.journal.filter((j) => /came off|untied/.test(j.text)).length;
  }
  // 12 of 12 split before alongside and reconsider.
  expect(off).toBeLessThan(6);
});
