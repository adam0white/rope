import { CAST } from '../sim/party.ts';

export type SkippedHistory = { castId: string; reason: string };

/** Denial metadata only: never a person envelope or permission to record/publish. */
export function skippedMetadata(
  owner: object | undefined,
  field: 'skipped' | 'castSkipped',
  retained: readonly ({ castId: string } | undefined)[] = [],
): SkippedHistory[] | undefined {
  if (!owner || !Object.hasOwn(owner, field)) return undefined;
  const value = (owner as Record<string, unknown>)[field];
  const fail = () => {
    throw new Error('The saved skipped histories do not match this cast.');
  };
  if (!Array.isArray(value) || value.length > CAST.length) return fail();
  const seen = new Set<string>();
  for (const row of value) {
    if (
      !row ||
      typeof row !== 'object' ||
      Array.isArray(row) ||
      Object.getPrototypeOf(row) !== Object.prototype ||
      Object.keys(row).sort().join(',') !== 'castId,reason' ||
      !CAST.some((c) => c.castId === row.castId) ||
      typeof row.reason !== 'string' ||
      !row.reason.trim() ||
      row.reason.length > 1024 ||
      seen.has(row.castId) ||
      retained.some((p) => p?.castId === row.castId)
    )
      return fail();
    seen.add(row.castId);
  }
  return structuredClone(value);
}
