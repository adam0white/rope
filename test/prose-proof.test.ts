import { expect, it } from 'vitest';
import { snapshot, startClimb } from '../src/sim/climb.ts';
import { exportClimb, replayExport } from '../src/sim/season.ts';
import { proseBaseline } from './fixtures/prose-baseline.ts';
import { proofHash, proseBlanked } from './prose-proof.ts';
import { playScripted } from './script.ts';

it.each(proseBaseline)(
  '$id preserves baseline decisions, complete HF people and exact current replay',
  (baseline) => {
    const [mountain] = baseline.id.split('/');
    const start = startClimb(4, 3, undefined, mountain);
    const initial = snapshot(start);
    const played = playScripted(start, { turnAt: 12 * 60 });
    expect(proofHash(proseBlanked(played))).toBe(baseline.state);
    expect(proofHash(played.people)).toBe(baseline.people);
    const exported = exportClimb(initial, played, '2.18.0');
    expect(snapshot(replayExport(exported))).toBe(exported.state);
  },
);
