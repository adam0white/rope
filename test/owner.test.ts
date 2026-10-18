import { expect, it } from 'vitest';
import { queueInput, startClimb, step } from '../src/sim/climb.ts';

it('control: hours of waiting send no word for the player', () => {
  const s = startClimb(1, 3);
  for (let i = 0; i < 600 && !s.over; i++) step(s);
  expect(s.inputs).toHaveLength(0);
  expect(s.lines.filter((l) => l.input >= 0)).toHaveLength(0);
  expect(s.journal.filter((j) => /^You (told|asked|urged|insisted|said)/.test(j.text))).toHaveLength(0);
});

it('a promise is not credited by a turn made before it', () => {
  const s = startClimb(1, 3);
  for (let i = 0; i < 30; i++) step(s);
  queueInput(s, { t: 'lead', dir: 'up' });
  for (let i = 0; i < 60; i++) step(s);
  queueInput(s, { t: 'lead', dir: 'down' });
  for (let i = 0; i < 5; i++) step(s);
  queueInput(s, { t: 'promise', hour: 16 });
  step(s);
  step(s);
  expect(s.journal.some((j) => j.text === 'You turned when you said you would.')).toBe(false);
});

it('a turn made after the promise, before its hour, is credited', () => {
  const s = startClimb(1, 3);
  queueInput(s, { t: 'lead', dir: 'up' });
  for (let i = 0; i < 60; i++) step(s);
  queueInput(s, { t: 'promise', hour: 16 });
  for (let i = 0; i < 30; i++) step(s);
  queueInput(s, { t: 'lead', dir: 'down' });
  for (let i = 0; i < 5; i++) step(s);
  expect(s.journal.some((j) => j.text === 'You turned when you said you would.')).toBe(true);
});
