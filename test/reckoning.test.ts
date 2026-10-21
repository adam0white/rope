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
vi.mock('../src/ui/lab.ts', () => ({ lab: { screen() {}, milestone() {} } }));
interface Driver {
  climb: ClimbState;
  season: SeasonState;
  begin(c: ClimbState, start: string): void;
  debriefPage(): void;
  seasonPage(): void;
  journalPage(): void;
  advance(): void;
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
function toggle() {
  button('Game menu')?.click();
  document.querySelector<HTMLInputElement>('[data-reckoning]')?.click();
  button('Back')?.click();
}
async function setup() {
  const game = new Game(document.querySelector<HTMLElement>('#app') as HTMLElement);
  await game.boot();
  const driver = game as unknown as Driver;
  const { season, climb } = newSeason(41);
  driver.season = season;
  driver.begin(climb, season.start as string);
  return driver;
}
it('leaves real turn-time choices unchanged; preference starts off and never enters save or inputs', async () => {
  const d = await setup();
  expect([...document.querySelectorAll('[data-hour]')].map((b) => b.textContent)).toEqual([
    'We turn at 12:00',
    'We turn at 13:00',
    'We turn at 14:00',
  ]);
  expect(button("We'll see")).toBeDefined();
  const before = snapshot(d.climb);
  const saved = localStorage.getItem('rope.save.v1');
  button('Game menu')?.click();
  expect(document.querySelector<HTMLInputElement>('[data-reckoning]')?.checked).toBe(false);
  expect(document.querySelector('label')?.textContent).toContain('Count the day in the notebook');
  document.querySelector<HTMLInputElement>('[data-reckoning]')?.click();
  button('Back')?.click();
  button("We'll see")?.click();
  expect(document.body.textContent).not.toContain('Notebook total:');
  d.journalPage();
  expect(document.body.textContent).not.toContain('Notebook total:');
  expect(snapshot(d.climb)).toBe(before);
  expect(localStorage.getItem('rope.save.v1')).toBe(saved);
});
it('shows the explicit total immediately at the ending, retains it on reopen, and clears it on next climb', async () => {
  const d = await setup();
  d.climb.over = true;
  const member = d.climb.members[0];
  if (!member) throw new Error('missing member');
  member.homeAt = d.climb.minute;
  member.summitAt = d.climb.minute;
  d.debriefPage();
  expect(document.body.textContent).not.toContain('Notebook total:');
  const before = snapshot(d.climb);
  toggle();
  expect(document.querySelector('[data-reckoning-result]')?.textContent).toContain(
    'Notebook total: 3 = 2 × 1 home by dark + summit visits: 1.',
  );
  expect(document.body.textContent).toContain('not a measure of people');
  expect(snapshot(d.climb)).toBe(before);
  d.journalPage();
  expect(document.body.textContent).not.toContain('Notebook total:');
  document.querySelector<HTMLButtonElement>('[data-a="close"]')?.click();
  expect(document.body.textContent).toContain('Notebook total: 3');
  toggle();
  expect(document.body.textContent).not.toContain('Notebook total:');
  toggle();
  d.advance();
  expect(document.body.textContent).not.toContain('Notebook total:');
});
it('terminal season counts only recorded history, never its current or unplayed climbs; new instance defaults off', async () => {
  const d = await setup();
  d.climb.over = true;
  d.climb.climbNo = 3;
  d.debriefPage();
  toggle();
  d.advance();
  expect(d.season.history).toHaveLength(1);
  expect(document.querySelector('[data-reckoning-result]')?.textContent).toContain(
    'Notebook total: 0 = 2 × 0 home by dark + summit visits: 0.',
  );
  expect(document.body.textContent).toContain('the completed climbs this season');
  await new Game(document.querySelector<HTMLElement>('#app') as HTMLElement).boot();
  const games = [...document.querySelectorAll<HTMLButtonElement>('button')].filter(
    (b) => b.textContent === 'Game menu',
  );
  games.at(-1)?.click();
  expect(document.querySelector<HTMLInputElement>('[data-reckoning]')?.checked).toBe(false);
});
