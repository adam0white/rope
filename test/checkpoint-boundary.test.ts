// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { newSeason } from '../src/sim/season.ts';
import { Game } from '../src/ui/game.ts';

vi.mock('../src/sim/season.ts', async (original) => {
  const actual = await original<typeof import('../src/sim/season.ts')>();
  return {
    ...actual,
    nextClimbFrames: function* () {
      yield;
      const next = actual.newSeason(42).climb;
      next.climbNo = 2;
      return next;
    },
  };
});
vi.mock('../src/ui/scene.ts', () => ({
  Scene: class {
    mount = async () => {};
    draw() {}
    destroy() {}
    at = new Map();
  },
}));
vi.mock('@adam0white/lab-client', async (original) => ({
  ...(await original<typeof import('@adam0white/lab-client')>()),
  personaChannel: () => ({ ready: Promise.resolve(), enabled: true, setEnabled() {}, request: vi.fn() }),
  watchPersonaCheckpoint: (fn: () => void) => {
    (globalThis as any).checkpointWatch = fn;
    return () => {};
  },
}));
vi.mock('../src/ui/lab.ts', () => ({
  lab: {
    setPersonaRecording() {},
    allowPersonaRecording() {},
    build: () => ({ c: 'test' }),
    screen() {},
    milestone() {},
    trackRun: () => () => {},
    captureSave() {},
    telemetryOn: false,
    setTelemetryOff() {},
  },
}));

interface Driver {
  climb: ReturnType<typeof newSeason>['climb'];
  season: ReturnType<typeof newSeason>['season'];
  continuity: { checkpointAll: () => Promise<void>; status: string };
  endClimb(): void;
  debriefPage(): void;
  destroy(): void;
}
let driver: Driver;
beforeEach(async () => {
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) =>
    setTimeout(() => fn(performance.now()), 0),
  );
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('fetch', async () => ({ ok: false }));
  vi.stubGlobal(
    'Worker',
    class {
      postMessage() {}
      terminate() {}
    },
  );
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  const game = new Game(document.querySelector('#app')!);
  await game.boot();
  driver = game as unknown as Driver;
  const state = newSeason(7);
  driver.season = state.season;
  driver.climb = state.climb;
  driver.climb.over = true;
});
afterEach(() => {
  driver.destroy();
  vi.unstubAllGlobals();
});

it('attempts once at completion and waits before navigating, coalescing the checkpoint watcher', async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const checkpoint = vi.spyOn(driver.continuity, 'checkpointAll').mockReturnValue(pending);
  driver.endClimb();
  driver.debriefPage();
  expect(checkpoint).toHaveBeenCalledTimes(1);
  (globalThis as any).checkpointWatch();
  expect(checkpoint).toHaveBeenCalledTimes(1);
  document.querySelector<HTMLButtonElement>('[data-a="next"]')!.click();
  expect(driver.climb.climbNo).toBe(1);
  expect(document.body.textContent).toMatch(/sav|wait/i);
  release();
  await pending;
  await vi.waitFor(() => expect(driver.climb.climbNo).toBe(2), { timeout: 10000 });
});

it('attempts again after a real departure request changes the completed climb', async () => {
  const checkpoint = vi.spyOn(driver.continuity, 'checkpointAll').mockResolvedValue();
  driver.endClimb();
  driver.debriefPage();
  await Promise.resolve();
  document.querySelector<HTMLButtonElement>('[data-depart="oskar"]')!.click();
  await vi.waitFor(() => expect(driver.climb.hfReleased.oskar).toBe(true), { timeout: 20000 });
  expect(driver.climb.inputs.some((input) => input.t === 'release-person' && input.to === 'oskar')).toBe(
    true,
  );
  await vi.waitFor(() => expect(checkpoint).toHaveBeenCalledTimes(2), { timeout: 10000 });
});

it('does not publish file-origin play', async () => {
  Object.defineProperty(driver, 'entry', { value: 'file' });
  const checkpoint = vi.spyOn(driver.continuity, 'checkpointAll').mockResolvedValue();
  driver.endClimb();
  driver.debriefPage();
  await Promise.resolve();
  expect(checkpoint).not.toHaveBeenCalled();
});

it('does not navigate a replacement climb when an older attempt settles', async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(driver.continuity, 'checkpointAll').mockReturnValue(pending);
  driver.endClimb();
  driver.debriefPage();
  document.querySelector<HTMLButtonElement>('[data-a="next"]')!.click();
  const successor = newSeason(42).climb;
  driver.climb = successor;
  release();
  await pending;
  await Promise.resolve();
  await Promise.resolve();
  expect(driver.climb).toBe(successor);
  expect(driver.climb.climbNo).toBe(1);
});

it('waits for an in-flight attempt even if the shelf is disabled meanwhile', async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(driver.continuity, 'checkpointAll').mockReturnValue(pending);
  driver.endClimb();
  driver.debriefPage();
  (driver.continuity as unknown as { shelf: { enabled: boolean } }).shelf.enabled = false;
  document.querySelector<HTMLButtonElement>('[data-a="next"]')!.click();
  expect(driver.climb.climbNo).toBe(1);
  release();
  await pending;
  await vi.waitFor(() => expect(driver.climb.climbNo).toBe(2), { timeout: 10000 });
});
