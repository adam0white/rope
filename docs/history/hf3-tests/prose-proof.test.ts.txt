import { expect, it } from 'vitest';
import { snapshot, startClimb } from '../src/sim/climb.ts';
import { exportClimb, replayExport } from '../src/sim/season.ts';
import { hfNarrationBaseline } from './fixtures/hf-narration-baseline.ts';
import { narrationBlanked, narrationPeople } from './hf-narration-proof.ts';
import { proofHash } from './prose-proof.ts';
import { playScripted } from './script.ts';

it.each(hfNarrationBaseline)(
  '$id preserves baseline decisions and non-prose HF state and exact current replay',
  (baseline) => {
    const [mountain] = baseline.id.split('/');
    const start = startClimb(4, 3, undefined, mountain);
    const initial = snapshot(start);
    const played = playScripted(start, { turnAt: 12 * 60 });
    expect(proofHash(narrationBlanked(played))).toBe(baseline.state);
    expect(proofHash(narrationPeople(played.people))).toBe(baseline.people);
    const exported = exportClimb(initial, played, '2.21.0');
    expect(snapshot(replayExport(exported))).toBe(exported.state);
  },
);
