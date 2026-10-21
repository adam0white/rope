import { expect, it } from 'vitest';
import { type ClimbState, startClimb } from '../src/sim/climb.ts';
import { markSeen, newDisclosure, nextNote } from '../src/ui/disclosure.ts';
import { PACE } from '../src/ui/pace.ts';
import { playScripted } from './script.ts';

/**
 * Real time a climb takes at normal speed, modelled from the UI's pacing: the game runs at PACE.normal game minutes
 * per real second, and each slowdown trigger (a disagreeing answer, a fall or turn in the journal, a story line,
 * a margin note) holds it at PACE.slowFactor for PACE.slowMs. Choosing an order is not counted.
 */
function realMinutes(c: ClimbState, firstClimb: boolean): number {
  const triggers = new Map<number, number>();
  const brief = new Set<number>();
  const add = (at: number) => triggers.set(at, (triggers.get(at) ?? 0) + 1);
  for (const l of c.lines) if (l.verdict !== 'assented' && l.verdict !== 'heard') add(l.at);
  for (const j of c.journal)
    if (j.story || /fell|slipped|turned for home|would not|put you off|stood on the summit/.test(j.text))
      add(j.at);
  let notes = 0;
  if (firstClimb) {
    const d = newDisclosure();
    for (let k = 0; k < 12; k++) {
      const n = nextNote(d, c);
      if (!n) break;
      markSeen(d, n);
      notes++;
    }
  }
  let real = notes * PACE.noteHoldS;
  let slowLeft = 0;
  for (let minute = c.startMinute; minute < c.minute; minute++) {
    if (brief.has(minute)) slowLeft = Math.max(slowLeft, PACE.noteSlowMs / 1000);
    if (triggers.has(minute)) slowLeft = Math.max(slowLeft, PACE.slowMs / 1000);
    const rate = slowLeft > 0 ? PACE.normal * PACE.slowFactor : PACE.normal;
    const sec = 1 / rate;
    real += sec;
    slowLeft = Math.max(0, slowLeft - sec);
  }
  return real / 60;
}

it('a climb takes about 20 real minutes at normal speed', () => {
  const out: string[] = [];
  for (const mt of ['hollin', 'tooth', 'kestrel']) {
    const ts: number[] = [];
    for (let seed = 1; seed <= 6; seed++) {
      const c = playScripted(startClimb(seed, 3, undefined, mt), { turnAt: 12 * 60 });
      ts.push(realMinutes(c, mt === 'hollin'));
    }
    const mean = ts.reduce((a, b) => a + b, 0) / ts.length;
    out.push(`${mt} ${mean.toFixed(1)}`);
    expect(mean).toBeGreaterThan(14);
    expect(mean).toBeLessThan(28);
  }
  console.log(out.join(', '));
});
