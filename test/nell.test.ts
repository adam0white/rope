import { expect, it } from 'vitest';
import { queueInput, startClimb, step } from '../src/sim/climb.ts';

it('control: pressed to climb on in the afternoon, Nell answers from her own HF promise, in its words', () => {
  const s = startClimb(1, 3);
  queueInput(s, { t: 'lead', dir: 'up' });
  queueInput(s, { t: 'say', to: 'all', act: 'climb', force: 'ask' });
  while (s.minute % 1440 < 14 * 60 + 40) step(s);
  // Stand beside her so she hears.
  const nell = s.members.find((m) => m.id === 'nell');
  if (!nell) throw new Error('no nell');
  s.leader.pos = { ...nell.pos };
  s.leader.move = null;
  queueInput(s, { t: 'say', to: 'nell', act: 'climb', force: 'ask' });
  const asked = s.inputs.length - 1;
  for (let k = 0; k < 10; k++) step(s);
  const l = s.lines.find((x) => x.input === asked);
  expect(l?.verdict).not.toBe('assented');
  expect(l?.reason).toMatch(/^commitment:/);
  expect(l?.says).toContain('as I told Mum');
  expect(l?.says.match(/as I told Mum/g)).toHaveLength(1);
  expect(l?.says).not.toMatch(/do something else|[{}]/);
}, 120000);
