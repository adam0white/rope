import { describe, expect, it } from 'vitest';
import { queueInput, replay, snapshot, startClimb, step } from '../src/sim/climb.ts';
import { archiveOf } from '../src/sim/hf4.ts';
import { expectArchiveReplay } from './hf-narration-proof.ts';

describe('a current climb', () => {
  it('records actual costed climbing and replays a turn input exactly', () => {
    const s = startClimb(7, 3);
    const start = snapshot(s);
    queueInput(s, { t: 'say', to: 'oskar', act: 'climb', force: 'ask' });
    queueInput(s, { t: 'lead', dir: 'up' });
    for (let i = 0; i < 110; i++) step(s);
    expect(s.members.find((m) => m.id === 'oskar')?.path).toContain('meadow');
    const receipt = archiveOf(s)
      .history.flatMap((tx) => tx.inputs)
      .find(
        (input) =>
          input.kind === 'action.resolved' &&
          input.payload.person === 'oskar' &&
          input.payload.outcome?.actionId === 'climb' &&
          input.payload.outcome.status === 'completed',
      );
    expect(receipt).toBeDefined();
    if (receipt?.kind === 'action.resolved')
      expect(receipt.payload.outcome!.end - receipt.payload.outcome!.start).toBeGreaterThanOrEqual(
        90 * 60000,
      );
    queueInput(s, { t: 'lead', dir: 'down' });
    queueInput(s, { t: 'say', to: 'all', act: 'descend', force: 'urge' });
    for (let i = 0; i < 10; i++) step(s);
    expectArchiveReplay(s);
    expect(snapshot(replay(start, s.inputs, s.minute))).toBe(snapshot(s));
  });

  it('is unchanged up to the minute of an input removed from the log', () => {
    const s = startClimb(7, 3);
    const start = snapshot(s);
    queueInput(s, { t: 'lead', dir: 'up' });
    for (let i = 0; i < 5; i++) step(s);
    queueInput(s, { t: 'say', to: 'oskar', act: 'climb', force: 'ask' });
    const cut = s.inputs.at(-1)!;
    const withIt = replay(start, s.inputs, cut.at - 1);
    const without = replay(start, s.inputs.slice(0, -1), cut.at - 1);
    expect(snapshot({ ...without, inputs: [] })).toBe(snapshot({ ...withIt, inputs: [] }));
  });
});
