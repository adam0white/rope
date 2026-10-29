import { expect, it } from 'vitest';
import { canHear, queueInput, startClimb, step } from '../src/sim/climb.ts';
import { playScripted } from './script.ts';

it('nobody goes down alone unasked: a lone turn becomes a request the player answers', () => {
  let asked = 0;
  let alone = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const s = playScripted(startClimb(seed, 3), { turnAt: 15 * 60 });
    asked += s.lines.filter((l) => l.reason === 'asks:company').length;
    alone += s.journal.filter((j) => j.text.includes('went down alone')).length;
    // No lone descent ever starts without the ask before it.
    for (const j of s.journal.filter((x) => x.text.includes('went down alone')))
      expect(s.lines.some((l) => l.who === j.who && l.reason === 'asks:company' && l.at <= j.at - 45)).toBe(
        true,
      );
  }
  console.log({ asked, alone });
  expect(asked).toBeGreaterThan(0);
});

it('sending someone with the asker pairs them on the rope going down', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const s = startClimb(seed, 3);
    queueInput(s, { t: 'lead', dir: 'up' });
    let asker: string | undefined;
    for (let i = 0; i < 700 && !s.over && !asker; i++) {
      step(s);
      asker = s.members.find((x) => x.asks)?.id;
      if (s.leader.move === null && !asker) queueInput(s, { t: 'lead', dir: 'up' });
    }
    if (!asker) continue;
    const mate = s.members.find((x) => x.id !== asker && x.homeAt === null && canHear(s, x.id));
    if (!mate) continue;
    queueInput(s, { t: 'say', to: mate.id, act: 'escort', force: 'insist', with: asker });
    for (let i = 0; i < 30; i++) step(s);
    const went = s.journal.some(
      (j) => j.text.includes('roped together') || j.text.includes(`went down with`),
    );
    if (went) {
      expect(s.journal.some((j) => j.text.includes('went down alone') && j.who === asker)).toBe(false);
      return;
    }
  }
  throw new Error('no seed paired an escort');
});

it('turning for home answers a request for company within earshot', () => {
  let checked = 0;
  for (let seed = 1; seed <= 12 && checked < 2; seed++) {
    const s = startClimb(seed, 3);
    queueInput(s, { t: 'lead', dir: 'up' });
    queueInput(s, { t: 'say', to: 'all', act: 'climb', force: 'ask' });
    for (let k = 0; k < 900 && !s.over; k++) {
      step(s);
      const asker = s.members.find((x) => x.asks && canHear(s, x.id));
      if (asker) {
        queueInput(s, { t: 'lead', dir: 'down' });
        step(s);
        if (canHear(s, asker.id)) {
          expect(asker.asks ?? null).toBeNull();
          checked++;
        }
        break;
      }
    }
  }
  expect(checked).toBeGreaterThan(0);
});

it('current narration of an escort sent to someone far off does not claim a rope', async () => {
  const { readFileSync } = await import('node:fs');
  const { replay } = await import('../src/sim/climb.ts');
  const e = JSON.parse(
    readFileSync(
      new URL('../docs/playtests/owner-2026-10-19-kestrel-334144833.json', import.meta.url),
      'utf8',
    ),
  );
  // Exercise today's narrator against the original host-rules-1 decision sequence.
  const s = replay(e.start, e.inputs, undefined, 3);
  // Three people were sent to Oskar from the ice wall, hours from the lake where he sat.
  const far = s.journal.filter((j) => j.text.includes('who is far off'));
  expect(far.length).toBe(3);
  expect(s.journal.some((j) => j.text.includes('roped together'))).toBe(false);
  for (const m of s.members) expect(m.ropedTo).toBeNull();
});
