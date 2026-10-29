import { readBladder } from '@adam0white/human-framework';
import { expect, it } from 'vitest';
import { offersFor, personOf, queueInput, replay, snapshot, startClimb, step } from '../src/sim/climb.ts';
import { exportClimb, replayExport } from '../src/sim/season.ts';

it('field rules opt in to the real HF bladder and current exports replay exactly', () => {
  const s = startClimb(4, 3);
  const start = snapshot(s);
  expect(personOf(s, 'oskar').body.bladder).toBeUndefined();
  queueInput(s, { t: 'field-rules', bladder: true });
  step(s);
  expect(readBladder(personOf(s, 'oskar'))).toBeDefined();
  // A completed host drink uses Outcome.needs.water; HF owns delayed intake and filling.
  queueInput(s, { t: 'say', to: 'oskar', act: 'drink', force: 'ask' });
  for (let i = 0; i < 600; i++) step(s);
  expect(personOf(s, 'oskar').memory.episodes.some((e) => e.action === 'relieve')).toBe(true);
  expect(snapshot(replay(start, s.inputs, s.minute))).toBe(snapshot(s));
  const exported = exportClimb(start, s, '3.0.0');
  expect(snapshot(replayExport(exported))).toBe(exported.state);
});

it('a new scout offer has real travel cost, HF resolution and no distant report', () => {
  const s = startClimb(1, 3);
  queueInput(s, { t: 'field-rules', bladder: false });
  queueInput(s, { t: 'say', to: 'oskar', act: 'scout-route', force: 'ask' });
  step(s);
  const answer = s.lines.find((l) => l.input === 1);
  expect(answer).toBeDefined();
  const offer = offersFor(s, 'oskar', 'scout-route').find((o) => o.id.startsWith('scout:'));
  expect(offer?.duration).toBeGreaterThan(60);
  expect(offer?.risk?.chance).toBeGreaterThan(0);
  expect(answer?.reason).not.toBe('unavailable');
  expect(s.people.find((p) => p.id === 'oskar')?.rng).toEqual(personOf(startClimb(1, 3), 'oskar').rng);
  // Walk the leader out of hearing without changing the scout's own travel.
  s.leader.pos = { place: 'summit', leg: null, t: 0 };
  for (let i = 0; i < 200; i++) step(s);
  expect(s.journal.filter((j) => j.text.includes('reported the route'))).toHaveLength(0);
  expect(s.known).not.toContain('gully-loose');
});

it('feature-off legacy continuation acquires no new state or bladder', () => {
  const s = startClimb(4, 3);
  const start = snapshot(s);
  for (let i = 0; i < 100; i++) step(s);
  expect(s.people.every((p) => !p.body.bladder)).toBe(true);
  expect(s).not.toHaveProperty('fieldRules');
  expect(snapshot(replay(start, [], s.minute))).toBe(snapshot(s));
});

it('only a reached and heard scout report supplies observed route knowledge', () => {
  const s = startClimb(1, 3);
  for (const actor of [...s.members, s.leader]) actor.pos = { place: 'col', leg: null, t: 0 };
  s.leader.route = 'gully';
  queueInput(s, { t: 'field-rules', bladder: false });
  queueInput(s, { t: 'say', to: 'tamar', act: 'scout-route', force: 'insist' });
  step(s);
  const start = snapshot(s);
  for (let i = 0; i < 230 && !s.members.find((x) => x.id === 'tamar')?.scoutReport; i++) step(s);
  expect(s.members.find((x) => x.id === 'tamar')?.scoutReport).toBeDefined();
  const mem = s.members.find((x) => x.id === 'tamar');
  if (!mem) throw new Error('Missing Tamar');
  s.leader.pos = { ...mem.pos };
  step(s);
  expect(s.journal.some((j) => j.text.includes('reported the route'))).toBe(true);
  expect(s.known.some((f) => f.startsWith('gully-'))).toBe(true);
  expect(start).toContain('scout:gully');
});

it('field cruxes retain travel cost and uncertain observed weather without reading the hidden storm time', async () => {
  const { fieldNotice } = await import('../src/ui/field.ts');
  const s = startClimb(4, 3);
  s.fieldRules = { bladder: false };
  s.leader.pos = { place: 'col', leg: null, t: 0 };
  s.known.push('storm');
  const notice = fieldNotice(s);
  expect(notice).toContain('rock channel');
  expect(notice).toContain('minutes');
  expect(notice).toContain('estimate');
  s.weather.stormAt += 10;
  expect(fieldNotice(s)).toBe(notice);
});

it('colliding wants quote only actual spoken answers within hearing reach', () => {
  const s = startClimb(1, 3);
  for (const x of [...s.members, s.leader]) x.pos = { place: 'col', leg: null, t: 0 };
  for (const x of s.members) x.path = ['meadow', 'moraine', 'snow'];
  queueInput(s, { t: 'field-rules', bladder: false });
  queueInput(s, { t: 'say', to: 'nell', act: 'descend', force: 'ask' });
  step(s);
  queueInput(s, { t: 'say', to: 'oskar', act: 'climb', force: 'ask' });
  step(s);
  const exchange = s.journal.find((j) => j.text.includes('had said:'));
  expect(exchange).toBeDefined();
  for (const who of ['nell', 'oskar']) {
    const spoken = s.lines.findLast((l) => l.who === who);
    expect(exchange?.text).toContain(spoken?.says);
  }
});

it('a far escort must physically meet before the company call can be answered', () => {
  const s = startClimb(1, 3);
  for (const x of [...s.members, s.leader]) x.pos = { place: null, leg: 'snow', t: 0.5 };
  const asker = s.members.find((m) => m.id === 'oskar');
  if (!asker) throw new Error('Missing Oskar');
  asker.pos.t = 0.1;
  asker.asks = { at: s.minute };
  queueInput(s, { t: 'field-rules', bladder: false });
  queueInput(s, { t: 'say', act: 'escort-reach', to: 'tamar', with: 'oskar', force: 'ask' });
  step(s);
  expect(s.lines.find((l) => l.input === 1)?.reason).not.toBe('unavailable');
  expect(asker.asks).not.toBeNull();
  expect(s.members.find((m) => m.id === 'tamar')?.move?.dir).toBe('down');
  expect(s.journal.some((j) => j.text.includes('went down with Oskar'))).toBe(false);
});
