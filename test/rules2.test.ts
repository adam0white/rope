import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { type Input, replay, snapshot, startClimb, step } from '../src/sim/climb.ts';
import { exportClimb, replayExport } from '../src/sim/season.ts';
import { playScripted } from './script.ts';

// HF 2.8.0 host rules (docs/findings.md, 2026-10-19): fullness, no "step aside" offer, alongside and reconsider.

it.each(['owner-2026-10-18-hollin-334144833', 'owner-2026-10-19-kestrel-334144833'])(
  '%s replays its complete saved JSON state exactly under rules 1',
  (f) => {
    const e = JSON.parse(readFileSync(new URL(`../docs/playtests/${f}.json`, import.meta.url), 'utf8'));
    expect(JSON.parse(e.start).rules).toBeUndefined();
    const c = replayExport(e);
    expect(c.rules).toBeUndefined();
    expect(snapshot(c)).toBe(e.state);
  },
);

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

it('a rules 2 export replays its complete state at the saved minute', () => {
  const s = startClimb(23, 3);
  const start = snapshot(s);
  for (let i = 0; i < 90; i++) step(s);
  const e = exportClimb(start, s, '2.8.0');
  expect(JSON.parse(snapshot(replayExport(e)))).toEqual(JSON.parse(e.state));
  expect(snapshot(replay(start, s.inputs, s.minute))).toBe(e.state);
});

it('legacy export replay uses saved words only to identify the narrator revision', () => {
  const e = JSON.parse(
    readFileSync(
      new URL('../docs/playtests/owner-2026-10-19-kestrel-334144833.json', import.meta.url),
      'utf8',
    ),
  );
  const expected = JSON.parse(e.state);
  const edited = JSON.parse(e.state);
  edited.lines[0].says = 'This edited line must never become replay output.';
  edited.journal[0].text = 'This edited journal must never become replay output.';
  e.state = JSON.stringify(edited);
  expect(JSON.parse(snapshot(replayExport(e)))).toEqual(expected);
});

it('an unversioned nearby escort tied to someone else replays narrator 3 exactly', () => {
  const s = startClimb(1, 3);
  delete s.rules;
  // A valid mid-path start: everyone is nearby and Tamar is already tied to Oskar.
  for (const mem of [...s.members, s.leader]) mem.pos = { place: null, leg: 'meadow', t: 0.5 };
  const tamar = s.members.find((m) => m.id === 'tamar');
  const oskar = s.members.find((m) => m.id === 'oskar');
  if (!tamar || !oskar) throw new Error('missing party');
  tamar.ropedTo = 'oskar';
  oskar.ropedTo = 'tamar';
  const start = snapshot(s);
  const inputs: Input[] = [
    { t: 'say', to: 'tamar', act: 'escort', force: 'insist', with: 'nell', at: s.minute + 1 },
  ];
  const played = replay(start, inputs, s.minute + 2, 3);
  expect(played.lines[0]?.verdict).toBe('assented');
  expect(played.journal.some((j) => j.text === 'Tamar Vale went down with Nell.')).toBe(true);
  expect(played.members.find((m) => m.id === 'tamar')?.ropedTo).toBe('oskar');
  const e = exportClimb(start, played, '2.6.0');
  expect(snapshot(replayExport(e))).toBe(e.state);
});
