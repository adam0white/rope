import {
  adoptVoiceTrust,
  consequenceEvidence,
  predict,
  readPerson,
  type Suggestion,
} from '@adam0white/human-framework';
import { describe, expect, it } from 'vitest';
import {
  memberState,
  offersFor,
  personOf,
  queueInput,
  replay,
  snapshot,
  startClimb,
  step,
} from '../src/sim/climb.ts';
import { debrief, factsOf } from '../src/sim/debrief.ts';
import { playScripted } from './script.ts';

const SEED = 20261018;

describe('a climb', () => {
  it('is deterministic and replays from its start and input log', () => {
    const a = startClimb(SEED, 3);
    const start = snapshot(a);
    playScripted(a);
    const b = playScripted(startClimb(SEED, 3));
    expect(snapshot(b)).toBe(snapshot(a));
    expect(snapshot(replay(start, a.inputs))).toBe(snapshot(a));
  });

  it('is unchanged up to the minute of an input removed from the log', () => {
    const a = startClimb(SEED, 3);
    const start = snapshot(a);
    playScripted(a);
    const k = Math.floor(a.inputs.length / 2);
    const cut = a.inputs[k];
    if (!cut) throw new Error('no input');
    const kept = a.inputs.filter((_, j) => j !== k);
    const withIt = replay(start, a.inputs, cut.at - 1);
    const without = replay(start, kept, cut.at - 1);
    expect(snapshot({ ...without, inputs: [] })).toBe(snapshot({ ...withIt, inputs: [] }));
  });

  it('gets the party up and home on a plain day with a sensible turn', () => {
    const s = playScripted(startClimb(SEED, 3));
    const f = factsOf(s);
    expect(Object.values(f).some((x) => x.summit)).toBe(true);
    // 3 of 5 down by dark across seeds 1–12 at a 13:00 turn (docs/findings.md); 4 on this seed was luck.
    expect(Object.values(f).filter((x) => x.home).length).toBeGreaterThanOrEqual(3);
  });
});

describe('control: the same suggestion, different people, different answers', () => {
  it('is answered from HF state, not from the game', () => {
    const s = startClimb(SEED, 3);
    for (let i = 0; i < 2; i++) step(s);
    const sug: Suggestion = { voiceId: 'leader', affordanceId: 'up:meadow', strength: 0.7 };
    const fresh = predict(personOf(s, 'nell'), offersFor(s, 'nell'), sug);
    // Spent: Nell's body after a long hard day (the framework's own tick), same offer.
    const tired = startClimb(SEED, 3);
    const p = personOf(tired, 'nell');
    p.body.exertion = 1;
    p.body.fitness = 0.1;
    p.body.satiety = 0.05;
    p.body.hydration = 0.1;
    const spent = predict(p, offersFor(tired, 'nell'), sug);
    // Distrust: Wren, whose trust in the leader is lowered through the HF will.
    const wary = startClimb(SEED, 3);
    adoptVoiceTrust(personOf(wary, 'wren'), 'leader', 0.02, 1);
    const distrust = predict(personOf(wary, 'wren'), offersFor(wary, 'wren'), sug);
    expect(fresh.verdict).toBe('assented');
    expect(readPerson(p).body.capacity).toBeLessThan(readPerson(personOf(s, 'nell')).body.capacity);
    expect(
      new Set([
        fresh.verdict + fresh.reason,
        spent.verdict + spent.reason,
        distrust.verdict + distrust.reason,
      ]).size,
    ).toBe(3);
  });
});

describe('telling the route', () => {
  it('becomes retained HF knowledge that values the climb toward the top', () => {
    const s = startClimb(SEED, 3);
    for (const id of ['tamar', 'oskar', 'nell', 'bilal', 'wren']) {
      const mem = memberState(s, id);
      mem.pos = { place: 'col', leg: null, t: 0 };
      mem.path = ['meadow', 'moraine', 'snow'];
    }
    s.leader.pos = { place: 'col', leg: null, t: 0 };
    s.minute = s.day * 1440 + 8 * 60;
    const ridge = offersFor(s, 'oskar').find((o) => o.id === 'up:ridge');
    if (!ridge) throw new Error('no ridge offer');
    queueInput(s, { t: 'tell', fact: 'ridge-solid' });
    step(s);
    const p = personOf(s, 'oskar');
    const ev = consequenceEvidence(p, ridge, s.minute).entries;
    expect(ev.some((e) => e.matches && e.feasible)).toBe(true);
  });
});

describe('the debrief', () => {
  it('attributes an outcome to one input', () => {
    const a = startClimb(SEED, 3);
    const start = snapshot(a);
    queueInput(a, { t: 'promise', hour: 11 });
    playScripted(a, { turnAt: 11 * 60 });
    const b = debrief(start, a, 12);
    expect(b).not.toBeNull();
    expect(b?.sentence).toMatch(/^If you hadn't /);
  });
});
