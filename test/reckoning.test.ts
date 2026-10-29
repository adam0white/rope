// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { type ClimbState, snapshot } from '../src/sim/climb.ts';
import { newSeason, type SeasonState } from '../src/sim/season.ts';
import { Game } from '../src/ui/game.ts';

vi.mock('../src/ui/scene.ts', () => ({
  Scene: class {
    mount = async () => {};
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
  season: SeasonState;
  begin(c: ClimbState, start: string): void;
  debriefPage(): void;
  seasonPage(): void;
  journalPage(): void;
  advance(): void;
  flushSave(): Promise<void>;
}
beforeEach(() => {
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
afterEach(() => vi.unstubAllGlobals());
const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].findLast((b) => b.textContent === text);
function reveal() {
  document.querySelector<HTMLButtonElement>('[data-see-tally]')?.click();
}
async function setup() {
  const game = new Game(document.querySelector<HTMLElement>('#app') as HTMLElement);
  await game.boot();
  const driver = game as unknown as Driver;
  const { season, climb } = newSeason(41);
  driver.season = season;
  driver.begin(climb, season.start as string);
  await driver.flushSave();
  return driver;
}
it('keeps real turn-time choices and offers no tally preference or live total', async () => {
  const d = await setup();
  expect([...document.querySelectorAll('[data-hour]')].map((b) => b.textContent)).toEqual([
    'We turn at 12:00',
    'We turn at 13:00',
    'We turn at 14:00',
  ]);
  button("We'll see")?.click();
  const before = snapshot(d.climb);
  const saved = localStorage.getItem('rope.save.v1');
  document.querySelector<HTMLButtonElement>('[aria-label="Game menu"]')?.click();
  expect(document.querySelector('[data-reckoning]')).toBeNull();
  document.querySelector<HTMLButtonElement>('[data-menu-close]')?.click();
  expect(document.querySelector('[data-see-tally]')).toBeNull();
  d.journalPage();
  expect(document.querySelector('[data-see-tally]')).toBeNull();
  expect(snapshot(d.climb)).toBe(before);
  expect(localStorage.getItem('rope.save.v1')).toBe(saved);
});
it('computes the completed climb total and reveals it only on request without changing saves', async () => {
  const d = await setup();
  d.climb.over = true;
  const member = d.climb.members[0];
  if (!member) throw new Error('missing member');
  member.homeAt = d.climb.minute;
  member.summitAt = d.climb.minute;
  d.debriefPage();
  expect(document.querySelector('#reckoning-tally')?.hasAttribute('hidden')).toBe(true);
  const before = snapshot(d.climb);
  reveal();
  expect(document.querySelector('#reckoning-tally')?.hasAttribute('hidden')).toBe(false);
  expect(document.querySelector('[data-reckoning-result]')?.textContent).toContain(
    'Notebook total: 3 = 2 × 1 home by dark + summit visits: 1.',
  );
  expect(snapshot(d.climb)).toBe(before);
  d.journalPage();
  expect(document.querySelector('[data-see-tally]')).toBeNull();
  document.querySelector<HTMLButtonElement>('[data-a="close"]')?.click();
  expect(document.querySelector('#reckoning-tally')?.hasAttribute('hidden')).toBe(true);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    queueMicrotask(() => callback(0));
    return 0;
  });
  d.advance();
  await vi.waitFor(() => expect(document.querySelector('[data-see-tally]')).toBeNull(), { timeout: 30000 });
});
it('counts only recorded history at the closed season', async () => {
  const d = await setup();
  d.climb.over = true;
  d.climb.climbNo = 3;
  d.debriefPage();
  d.advance();
  expect(d.season.history).toHaveLength(1);
  expect(document.querySelector('#reckoning-tally')?.hasAttribute('hidden')).toBe(true);
  reveal();
  expect(document.querySelector('[data-reckoning-result]')?.textContent).toContain(
    'Notebook total: 0 = 2 × 0 home by dark + summit visits: 0.',
  );
  expect(document.body.textContent).toContain('the completed climbs this season');
});
