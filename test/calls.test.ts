import { expect, it } from 'vitest';
import { startClimb } from '../src/sim/climb.ts';
import { haltReason, hurtCall, onlyWalkingLeft } from '../src/ui/calls.ts';

// These fixtures author host-owned positions and injury records to test the read-only call display.
// They do not assert an HF decision or a replay of the archived HF3 owner climb.
const at = (hour: number, minute = 0) => 3 * 1440 + hour * 60 + minute;
const place = (id: string) => ({ place: id, leg: null, t: 0 });

it('calls a distant fresh injury by its route name and expires it after 45 minutes', () => {
  const c = startClimb(2, 3);
  c.minute = at(14, 35);
  c.leader.pos = place('col');
  const wren = c.members.find((m) => m.id === 'wren')!;
  wren.pos = place('summit');
  wren.injuries.push({ at: at(14, 31), severity: 0.2, leg: 'scramble', caught: false });
  const before = JSON.stringify(c);
  expect(hurtCall(c)).toMatchObject({ who: 'wren', where: 'the final rocky climb', near: false });
  expect(JSON.stringify(c)).toBe(before);
  c.minute = at(14, 31) + 45;
  expect(hurtCall(c)?.who).toBe('wren');
  c.minute++;
  expect(hurtCall(c)).toBeNull();
});

it('does not call absent injuries, a person already home, or a hurt beside the leader', () => {
  const c = startClimb(2, 3);
  expect(hurtCall(c)).toBeNull();
  const wren = c.members.find((m) => m.id === 'wren')!;
  wren.pos = place('summit');
  wren.injuries.push({ at: c.minute, severity: 0.2, leg: 'scramble', caught: false });
  wren.homeAt = c.minute;
  expect(hurtCall(c)).toBeNull();
  wren.homeAt = null;
  c.leader.pos = place('summit');
  expect(hurtCall(c)).toBeNull();
});

it('explains waiting for named people and a fixable step, but not the hut or a chosen stop', () => {
  const c = startClimb(2, 3);
  for (const m of c.members) m.homeAt = ['tamar', 'bilal'].includes(m.id) ? null : c.minute;
  for (const m of c.members) m.pos = place('hut');
  c.leader.pos = place('meadow');
  c.leader.move = { leg: 'moraine', dir: 'up', fromT: 0, toT: 1, start: c.minute, end: c.minute + 75 };
  expect(haltReason(c)).toBe('You are waiting for Tamar Vale and Bilal to catch up.');
  c.leader.move = null;
  c.leader.pos = place('tower');
  for (const m of c.members) m.pos = place('tower');
  expect(haltReason(c)).toMatch(/summit step\. You can secure a rope here/);
  c.inputs.push({ at: c.minute, t: 'lead', dir: 'stop' });
  expect(haltReason(c)).toBeNull();
  c.leader.pos = place('hut');
  expect(haltReason(c)).toBeNull();
});

it('offers quiet walking only after every person has turned and no fresh call needs an answer', () => {
  const c = startClimb(2, 3);
  expect(onlyWalkingLeft(c)).toBe(false);
  c.leader.turnedAt = c.minute;
  for (const m of c.members) {
    m.turnedAt = c.minute;
    m.asks = null;
  }
  expect(onlyWalkingLeft(c)).toBe(true);
  c.members[0]!.asks = { at: c.minute };
  expect(onlyWalkingLeft(c)).toBe(false);
  c.members[0]!.asks = null;
  c.members[0]!.turnedAt = null;
  expect(onlyWalkingLeft(c)).toBe(false);
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
