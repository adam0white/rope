import { createHash } from 'node:crypto';
import type { ClimbState } from '../src/sim/climb.ts';

/** Only authored dialogue and journal text may differ in a prose rewrite.
 * IDs, verdicts, reason codes, histories, input logs and every HF field remain.
 */
export function proseBlanked(s: ClimbState): ClimbState {
  const copy = structuredClone(s);
  for (const line of copy.lines) line.says = '';
  for (const entry of copy.journal) entry.text = '';
  return copy;
}

export function proofHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
