// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { type ClimbState, snapshot, step } from '../src/sim/climb.ts';
import { newSeason, type SeasonState } from '../src/sim/season.ts';
import { Game } from '../src/ui/game.ts';
import { eventStamp, playbackRate } from '../src/ui/playback.ts';

vi.mock('../src/ui/scene.ts', () => ({
  Scene: class {
    at = new Map();
    mount = async () => {};
    draw = () => {};
  },
}));
vi.mock('../src/ui/lab.ts', () => ({ lab: { screen() {}, milestone() {} } }));
interface Driver {
  climb: ClimbState;
  season: SeasonState;
  slowUntil: number;
  noteUntil: number;
  storyUntil: number;
  stampUntil: number;
  endAt: number;
  skipping: boolean;
  acc: number;
  last: number;
  bubbles: Map<string, { el: HTMLElement; until: number; minute: number }>;
  renderSheet(): void;
  begin(c: ClimbState, start: string): void;
  closePage(): void;
  frame(): void;
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false })),
  );
  vi.stubGlobal(
    'Worker',
    class {
      postMessage() {}
    },
  );
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function setup() {
  const game = new Game(document.querySelector<HTMLElement>('#app') as HTMLElement);
  await game.boot();
  const d = game as unknown as Driver;
  const { season, climb } = newSeason(41);
  d.season = season;
  d.begin(climb, season.start as string);
  d.closePage();
  return d;
}
it('waits for reading and choices and leaves response time for calls', () => {
  expect(playbackRate(true, false, false, true)).toBe(0);
  expect(playbackRate(false, true, false, true)).toBe(0);
  expect(playbackRate(false, false, true, true)).toBeLessThan(1);
  expect(playbackRate(false, false, false, false)).toBe(8);
});
it('stops a fast walk at its first delivered event, discards overshoot and preserves every stepped minute', async () => {
  const d = await setup();
  d.climb.leader.turnedAt = d.climb.minute;
  for (const m of d.climb.members) {
    m.turnedAt = d.climb.minute;
    m.asks = null;
  }
  d.slowUntil = performance.now() + 7500;
  d.renderSheet();
  expect(
    [...document.querySelectorAll('button')].some((b) => b.textContent === 'Until something happens'),
  ).toBe(false);
  vi.advanceTimersByTime(7500);
  d.renderSheet();
  expect(
    [...document.querySelectorAll('button')].some((b) => b.textContent === 'Until something happens'),
  ).toBe(true);
  const expected: ClimbState = JSON.parse(snapshot(d.climb));
  const before = eventStamp(expected);
  let count = 0;
  do {
    step(expected);
    count++;
  } while (!expected.over && count < 40 && eventStamp(expected) === before);
  d.skipping = true;
  d.slowUntil = 0;
  d.acc = 0;
  vi.advanceTimersByTime(100);
  d.last = performance.now() - 100;
  d.frame();
  expect(snapshot(d.climb)).toBe(snapshot(expected));
  expect(d.acc).toBe(0);
  expect(d.skipping).toBe(false);
  expect(eventStamp(d.climb)).not.toBe(before);
});
it('holds the clock and retains reading and bubble time through a long menu visit', async () => {
  const d = await setup();
  d.slowUntil = performance.now() + 7500;
  const bubble = {
    el: document.createElement('div'),
    until: performance.now() + 7500,
    minute: d.climb.minute,
  };
  d.bubbles.set('leader', bubble);
  [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find((b) => b.textContent === 'Game menu')
    ?.click();
  const before = snapshot(d.climb);
  vi.advanceTimersByTime(10000);
  d.frame();
  expect(snapshot(d.climb)).toBe(before);
  expect(d.slowUntil - performance.now()).toBe(7500);
  expect(bubble.until - performance.now()).toBe(7500);
  document.querySelector<HTMLButtonElement>('[data-menu-close]')?.click();
  vi.advanceTimersByTime(1000);
  d.frame();
  expect(snapshot(d.climb)).toBe(before);
});

it('keeps the ending transition behind an open menu and resets transient deadlines on the next climb', async () => {
  const d = await setup();
  d.climb.over = true;
  d.frame();
  [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find((b) => b.textContent === 'Game menu')
    ?.click();
  vi.advanceTimersByTime(10000);
  d.frame();
  expect(document.querySelector('[data-a="next"]')).toBeNull();
  document.querySelector<HTMLButtonElement>('[data-menu-close]')?.click();
  vi.advanceTimersByTime(2600);
  d.frame();
  expect(document.querySelector('[data-a="next"]')).not.toBeNull();
  d.slowUntil = performance.now() + 50000;
  const next = newSeason(42);
  d.season = next.season;
  d.begin(next.climb, next.season.start as string);
  expect(d.slowUntil - performance.now()).toBe(7500);
  expect([d.noteUntil, d.storyUntil, d.stampUntil, d.endAt]).toEqual([0, 0, 0, 0]);
});
