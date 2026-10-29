// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { load, remove, save } from '../src/ui/store.ts';

const key = 'rope.save.cast.v1';
beforeEach(() => {
  vi.stubGlobal('indexedDB', undefined);
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());
it('reads the original native slot and saves complete strings with exact prior-value CAS', async () => {
  localStorage.setItem(key, 'old native save');
  expect(await load()).toBe('old native save');
  expect(await save('complete current save', 'old native save')).toBe(true);
  expect(await load()).toBe('complete current save');
  expect(await save('stale replacement', 'old native save')).toBe(false);
  expect(await load()).toBe('complete current save');
});
it('guards an absent slot and refuses stale ownership before any mutation', async () => {
  expect(await save('first', null, () => false)).toBe(false);
  expect(await load()).toBeNull();
  expect(await save('first', null)).toBe(true);
  expect(await save('second', null)).toBe(false);
  expect(await remove('first', () => false)).toBe(false);
  expect(await load()).toBe('first');
  expect(await remove('wrong')).toBe(false);
  expect(await remove('first')).toBe(true);
  expect(await load()).toBeNull();
});
it('serializes same-document saves and deletion without accepting two writers on one expected head', async () => {
  expect(await Promise.all([save('one', null), save('two', null)])).toEqual([true, false]);
  expect(await Promise.all([save('new', 'one'), remove('one')])).toEqual([true, false]);
  expect(await load()).toBe('new');
});
