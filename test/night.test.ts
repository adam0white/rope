// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { type ClimbState, snapshot } from '../src/sim/climb.ts';
import { newSeason } from '../src/sim/season.ts';
import { Game } from '../src/ui/game.ts';

// Keep the real clock, inputs and pages; replace only WebGL and the external camp/worker boundaries.
vi.mock('../src/ui/scene.ts', () => ({
  Scene: class {
    at = new Map();
    mount = async () => {};
    draw = () => {};
  },
}));
vi.mock('@adam0white/lab-client', async (original) => ({
  ...(await original<typeof import('@adam0white/lab-client')>()),
  personaChannel: () => ({ ready: Promise.resolve(true), enabled: false, setEnabled() {}, request: vi.fn() }),
  watchPersonaCheckpoint: () => () => {},
}));
vi.mock('../src/ui/lab.ts', () => ({
  lab: {
    setPersonaRecording() {},
    allowPersonaRecording() {},
    build() {
      return { c: 'test' };
    },
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

// Replace only the long valley simulation at this UI boundary; this is not a journey receipt.
vi.mock('../src/sim/season.ts', async (original) => {
  const real = await original<typeof import('../src/sim/season.ts')>();
  const { startClimb, snapshot } = await import('../src/sim/climb.ts');
  return {
    ...real,
    nextClimbFrames: function* (season: import('../src/sim/season.ts').SeasonState) {
      yield* []; // This boundary stub performs no valley HF work.
      const next = startClimb(season.seed, 4, undefined, 'tooth', 2);
      season.start = snapshot(next);
      season.climbNo = 2;
      return next;
    },
  };
});

interface Driver {
  climb: ClimbState;
  last: number;
  resume(save: unknown): Promise<void>;
  begin(climb: ClimbState, start: string, resumed?: boolean): void;
  endClimb(): void;
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

async function atEnding() {
  const { season, climb } = newSeason(7);
  const game = new Game(document.querySelector<HTMLElement>('#app') as HTMLElement);
  await game.boot();
  const driver = game as unknown as Driver & { season: typeof season };
  driver.season = season;
  driver.begin(climb, snapshot(climb), true);
  // Explicit UI boundary fixture: no climb, arrival, or night physiology is claimed.
  driver.climb.over = true;
  driver.endClimb();
  await Promise.resolve();
  for (let i = 0; i < 50 && !document.querySelector('[data-a=next]'); i++) {
    await Promise.resolve();
    vi.advanceTimersByTime(100);
    driver.last = performance.now() - 100;
    driver.frame();
  }
  return driver;
}

it('refuses the historical HF3 native save without replacing it', async () => {
  const { season } = newSeason(7);
  const game = new Game(document.querySelector<HTMLElement>('#app') as HTMLElement);
  await game.boot();
  const driver = game as unknown as Driver;
  await driver.resume({ engine: '2.23.0', v: 1, season, start: season.start, inputs: [], minute: 5699 });
  expect(document.body.textContent).toContain('The game could not resume');
  expect(document.body.textContent).toContain('has not been deleted');
  expect(document.body.textContent).toContain('Start a new game');
});

it('the ended current climb presents the next-climb action', async () => {
  const driver = await atEnding();
  const next = document.querySelector<HTMLButtonElement>('[data-a="next"]');
  expect(next?.textContent).toBe('On to The Tooth');
  next?.click();
  for (let i = 0; i < 20 && driver.climb.climbNo !== 2; i++) await Promise.resolve();
  expect(driver.climb.climbNo).toBe(2);
});

it('returning from the ending journal keeps the next-climb action', async () => {
  await atEnding();
  document.querySelector<HTMLButtonElement>('.journal-trigger')?.click();
  expect(document.querySelector('.page h2')?.textContent).toBe('The journal');
  document.querySelector<HTMLButtonElement>('[data-a="close"]')?.click();
  expect(document.querySelector<HTMLButtonElement>('[data-a="next"]')?.textContent).toBe('On to The Tooth');
});
