import { replay as replayHF } from '@adam0white/human-framework';
import { expect } from 'vitest';
import { type ClimbState, snapshot } from '../src/sim/climb.ts';
import { archiveOf } from '../src/sim/hf4.ts';

/** Verify the complete public HF archive and ensure reading it leaves the game unchanged. */
export function expectArchiveReplay(s: ClimbState): void {
  const before = snapshot(s);
  const archive = archiveOf(s);
  const replayed = replayHF(archive);
  expect(replayed.ok).toBe(true);
  if (replayed.ok) expect(replayed.value.fullHash).toBe(archive.hashes.full);
  expect(snapshot(s)).toBe(before);
}
