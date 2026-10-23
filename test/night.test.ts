// @vitest-environment happy-dom
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { type ClimbState, replay, snapshot } from '../src/sim/climb.ts';
import { newSeason } from '../src/sim/season.ts';
import { Game } from '../src/ui/game.ts';
import { ownerNight } from './fixtures/owner-night.ts';

// Keep the real clock, inputs and pages; replace only WebGL and the external camp/worker boundaries.
vi.mock('../src/ui/scene.ts', () => ({
  Scene: class {
    at = new Map();
    mount = async () => {};
    draw = () => {};
  },
}));
vi.mock('../src/ui/lab.ts', () => ({
  lab: {
    screen() {},
    milestone() {},
    trackRun() {
      return () => {};
    },
    captureSave() {},
    telemetryOn: false,
    setTelemetryOff() {},
  },
}));

interface Driver {
  climb: ClimbState;
  last: number;
  resume(save: unknown): void;
  frame(): void;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('fetch', async () => ({ ok: false }));
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

async function atNight(skip: boolean) {
  const { season } = newSeason(ownerNight.seed);
  const game = new Game(document.querySelector<HTMLElement>('#app') as HTMLElement);
  await game.boot();
  const driver = game as unknown as Driver;
  driver.resume({
    v: 1,
    season,
    start: season.start,
    inputs: ownerNight.inputs,
    minute: 5699,
    disclosure: { unlocked: ['insist', 'tell', 'promise', 'rope', 'fix', 'pack', 'share'], seen: [] },
    over: false,
  });
  expect(document.querySelectorAll('[data-speed]')).toHaveLength(0);
  vi.advanceTimersByTime(7500);
  driver.frame();
  if (skip && !driver.climb.over) {
    const walk = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.getAttribute('aria-label') === 'Skip to the next event' && !b.hidden,
    );
    // A pending call can make the old nightfall shortcut unavailable.
    walk?.click();
  }
  for (let i = 0; i < 200 && !driver.climb.over; i++) {
    vi.advanceTimersByTime(100);
    driver.last = performance.now() - 100;
    driver.frame();
  }
  return driver;
}

it('the owner replay still reproduces the full legacy state exactly', () => {
  const { season } = newSeason(ownerNight.seed);
  const played = replay(season.start as string, ownerNight.inputs);
  expect(played.minute).toBe(5700);
  expect(played.over).toBe(true);
  expect(createHash('sha256').update(snapshot(played)).digest('hex')).toBe(ownerNight.stateHash);
});

it.each([false, true])(
  'automatic playback (until event=%s) ends the owner night and permits the next climb',
  async (skip) => {
    const driver = await atNight(skip);
    expect(driver.climb.over).toBe(true);
    vi.advanceTimersByTime(2600);
    driver.frame();
    const next = document.querySelector<HTMLButtonElement>('[data-a="next"]');
    expect(next?.textContent).toBe('On to The Tooth');
    next?.click();
    expect(driver.climb.climbNo).toBe(2);
  },
);

// The drawer remains keyboard-focusable under a page. Returning from its journal must
// never reveal an ended map, whose stopped clock cannot run endClimb a second time.
it('Back from the drawer journal after auto-ending returns to the next phase', async () => {
  const driver = await atNight(true);
  vi.advanceTimersByTime(2600);
  driver.frame();
  document.querySelector<HTMLButtonElement>('.menu-trigger')?.click();
  document.querySelector<HTMLButtonElement>('[data-menu-journal]')?.click();
  expect(document.querySelector('.page h2')?.textContent).toBe('The journal');
  document.querySelector<HTMLButtonElement>('[data-a="close"]')?.click();
  expect(document.querySelector<HTMLButtonElement>('[data-a="next"]')?.textContent).toBe('On to The Tooth');
  document.querySelector<HTMLButtonElement>('[data-a="next"]')?.click();
  expect(driver.climb.climbNo).toBe(2);
});

it('leaving the journal during the ending stamp cannot later reopen an obsolete debrief', async () => {
  const driver = await atNight(true);
  document.querySelector<HTMLButtonElement>('.menu-trigger')?.click();
  document.querySelector<HTMLButtonElement>('[data-menu-journal]')?.click();
  document.querySelector<HTMLButtonElement>('[data-a="close"]')?.click();
  expect(document.querySelector<HTMLButtonElement>('[data-a="next"]')?.textContent).toBe('On to The Tooth');
  document.querySelector<HTMLButtonElement>('[data-a="next"]')?.click();
  expect(driver.climb.climbNo).toBe(2);
  vi.advanceTimersByTime(2600);
  driver.frame();
  expect(document.querySelector('.page')?.textContent).toContain('When do you turn back?');
  expect(document.querySelector('[data-a="next"]')).toBeNull();
});

it('Back from the journal after closing the season keeps the season closed', async () => {
  const driver = await atNight(true);
  // Exercise the same page lifecycle at the last climb's end.
  driver.climb.climbNo = 3;
  vi.advanceTimersByTime(2600);
  driver.frame();
  const close = document.querySelector<HTMLButtonElement>('[data-a="next"]');
  expect(close?.textContent).toBe('Close the season');
  close?.click();
  expect(document.querySelector('.page h1')?.textContent).toBe('The season');
  document.querySelector<HTMLButtonElement>('.menu-trigger')?.click();
  document.querySelector<HTMLButtonElement>('[data-menu-journal]')?.click();
  document.querySelector<HTMLButtonElement>('[data-a="close"]')?.click();
  expect(document.querySelector('.page h1')?.textContent).toBe('The season');
  expect(document.querySelector('[data-a="next"]')).toBeNull();
});
