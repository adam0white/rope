import { expect, it } from 'vitest';
import { queueInput, replay, snapshot, startClimb, step } from '../src/sim/climb.ts';

it('replays complete state and journal at both saved checkpoints', () => {
  const played = startClimb(4, 3);
  const start = snapshot(played);
  queueInput(played, { t: 'promise', hour: 12 });
  queueInput(played, { t: 'say', to: 'all', act: 'climb', force: 'ask' });
  queueInput(played, { t: 'lead', dir: 'up' });
  let mid = '';
  for (let i = 1; i <= 110; i++) {
    step(played);
    if (i === 45) mid = snapshot(played);
  }
  expect(snapshot(replay(start, played.inputs, played.minute))).toBe(snapshot(played));
  expect(snapshot(replay(start, played.inputs, played.startMinute + 45))).toBe(mid);
});
