// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { type ClimbState, replay } from '../src/sim/climb.ts';
import { newSeason } from '../src/sim/season.ts';
import { Game } from '../src/ui/game.ts';
import { ownerNight } from './fixtures/owner-night.ts';
import { narrationBlanked, narrationPeople } from './hf-narration-proof.ts';
import { proofHash } from './prose-proof.ts';

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
  await driver.resume({
    engine: '2.23.0',
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

it('the historical owner input log has a deterministic current-cast replay', () => {
  const { season } = newSeason(ownerNight.seed);
  const played = replay(season.start as string, ownerNight.inputs);
  expect(played.minute).toBe(5700);
  expect(played.over).toBe(true);
  // Baseline d642cea: explicit HF narration paths and pin metadata are excluded.
  expect(proofHash(narrationBlanked(played))).toBe(
    '0fb388face27ed7822c2405740722e7f9f4c29dbdeef1fc6ba667e0665e41eaa',
  );
  expect(proofHash(narrationPeople(played.people))).toBe(
    'adedce985332bec0f2e862fd7d0aef331d27b9ee9bccdae4d8dbb4d3838037db',
  );
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
  document.querySelector<HTMLButtonElement>('.journal-trigger')?.click();
  expect(document.querySelector('.page h2')?.textContent).toBe('The journal');
  document.querySelector<HTMLButtonElement>('[data-a="close"]')?.click();
  expect(document.querySelector<HTMLButtonElement>('[data-a="next"]')?.textContent).toBe('On to The Tooth');
  document.querySelector<HTMLButtonElement>('[data-a="next"]')?.click();
  expect(driver.climb.climbNo).toBe(2);
});

it('leaving the journal during the ending stamp cannot later reopen an obsolete debrief', async () => {
  const driver = await atNight(true);
  document.querySelector<HTMLButtonElement>('.journal-trigger')?.click();
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
  document.querySelector<HTMLButtonElement>('.journal-trigger')?.click();
  document.querySelector<HTMLButtonElement>('[data-a="close"]')?.click();
  expect(document.querySelector('.page h1')?.textContent).toBe('The season');
  expect(document.querySelector('[data-a="next"]')).toBeNull();
});

it('late debrief replies cannot enter another climb or a superseding readback', async () => {
  const workers: { onmessage?: (e: unknown) => void; terminate: () => void }[] = [];
  vi.stubGlobal(
    'Worker',
    class {
      onmessage?: (e: unknown) => void;
      terminate = vi.fn();
      postMessage() {
        workers.push(this);
      }
    },
  );
  const driver = await atNight(true);
  vi.advanceTimersByTime(2600);
  driver.frame();
  const old = workers.at(-1);
  if (!old) throw new Error('Missing old Worker');
  document.querySelector<HTMLButtonElement>('[data-a="journal"]')?.click();
  document.querySelector<HTMLButtonElement>('[data-a="close"]')?.click();
  old.onmessage?.({ data: { branch: { sentence: 'OBSOLETE READBACK' } } });
  expect(document.querySelector('[data-branch]')?.textContent).not.toContain('OBSOLETE READBACK');
  const current = workers.at(-1);
  if (!current) throw new Error('Missing current Worker');
  document.querySelector<HTMLButtonElement>('[data-a="next"]')?.click();
  current.onmessage?.({ data: { branch: { sentence: 'WRONG CLIMB' } } });
  expect((driver as unknown as { branch: unknown }).branch).toBeUndefined();
});

it('camp uses its deterministic fallback without automatic inference', async () => {
  const fetcher = vi.fn(async () => ({ ok: false }));
  vi.stubGlobal('fetch', fetcher);
  const driver = await atNight(true);
  vi.advanceTimersByTime(2600);
  driver.frame();
  expect(document.querySelector('[data-camp]')?.textContent).toContain('No language model was used');
  expect(fetcher.mock.calls).toHaveLength(0);
});

it('a new season never reuses the prior climb cached branch', async () => {
  const driver = await atNight(true);
  const internal = driver as unknown as { branch: unknown; begin(c: ClimbState, start: string): void };
  internal.branch = { sentence: 'PRIOR SEASON' };
  const next = newSeason(9);
  internal.begin(next.climb, next.season.start ?? '');
  expect(internal.branch).toBeUndefined();
});
