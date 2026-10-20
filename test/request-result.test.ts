// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { type ClimbState, MOUNTAINS, type NewInput, queueInput } from '../src/sim/climb.ts';
import { newSeason } from '../src/sim/season.ts';
import { Game } from '../src/ui/game.ts';

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
  resume(save: unknown): void;
  renderSheet(ifChanged?: boolean): void;
  send(input: NewInput, also?: NewInput): void;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.spyOn(Date, 'now').mockReturnValue(20261018);
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function boot() {
  const game = new Game(document.querySelector('#app') as HTMLElement);
  await game.boot();
  const driver = game as unknown as Driver;
  const { season, climb } = newSeason(20261018);
  driver.resume({
    season,
    start: season.start,
    inputs: [],
    minute: climb.minute,
    over: false,
    disclosure: { unlocked: ['insist', 'tell', 'promise', 'rope', 'fix', 'pack', 'share'], seen: [] },
  });
  vi.advanceTimersByTime(500);
  return driver;
}

const result = () => document.querySelector('.request-result');

it('labels accepted rest as rest and retains each authentic HF answer', async () => {
  const driver = await boot();
  driver.send({ t: 'say', to: 'all', act: 'rest', force: 'ask' });
  const answers = driver.climb.lines.filter((line) => line.input === 0);
  expect(answers.some((line) => line.verdict === 'assented')).toBe(true);
  expect(result()?.textContent).toContain('Rest accepted:');
  const details = result()?.querySelector('details');
  for (const line of answers) expect(details?.textContent).toContain(line.says);
  expect(details?.textContent).toContain('agreed to rest');
  vi.advanceTimersByTime(8500);
  driver.renderSheet(true);
  expect(result()?.textContent).toContain('Rest accepted:');
});

it('explains we all turn as your descent plus a new urge with renewed HF objections', async () => {
  const driver = await boot();
  const c = driver.climb;
  const leg = MOUNTAINS[c.mountain]?.legs[0];
  if (!leg) throw new Error('Missing trail');
  c.leader.pos = { place: null, leg: leg.id, t: 0.6 };
  for (const member of c.members) member.pos = { place: null, leg: leg.id, t: 0.6 };
  driver.send({ t: 'say', to: 'all', act: 'descend', force: 'insist' });
  expect(c.members.some((member) => member.asks)).toBe(true);
  expect(document.querySelector('.calls-button')?.textContent).toContain('company calls');
  expect(document.querySelector('.ask-bar')).toBeNull();
  vi.advanceTimersByTime(500);
  document.querySelector<HTMLButtonElement>('.calls-button')?.click();
  const turn = [...document.querySelectorAll<HTMLButtonElement>('.ask-bar button')].find(
    (button) => button.textContent === 'we all turn',
  );
  expect(turn).toBeTruthy();
  turn?.click();
  expect(document.querySelector('.sheet-main')).not.toBeNull();
  expect(document.querySelector('.ask-bar')).toBeNull();
  expect(c.leader.move?.dir).toBe('down');
  const latest = c.inputs.length - 1;
  const objection = c.lines.find((line) => line.input === latest && line.who === 'oskar');
  expect(objection?.verdict).toBe('deferred');
  expect(result()?.textContent).toContain('You turned downhill and urged everyone to turn back.');
  expect(result()?.textContent).toContain('Oskar put off turning back');
  expect(result()?.textContent).toContain(objection?.says);
  expect(result()?.textContent).toContain('Descending:');
  expect(result()?.querySelector('details')?.textContent).toContain('agreed to turn back');
});

it('does not attribute an earlier answer to a new request for the same action', async () => {
  const driver = await boot();
  driver.send({ t: 'say', to: 'all', act: 'rest', force: 'ask' });
  const previous = driver.climb.lines.find((line) => line.input === 0 && line.who === 'oskar');
  expect(previous).toBeTruthy();
  queueInput(driver.climb, { t: 'say', to: 'oskar', act: 'rest', force: 'urge' });
  driver.renderSheet();
  expect(result()?.textContent).toContain('Awaiting');
  expect(result()?.textContent).not.toContain(previous?.says);
});

it('reserves a feedback slot before the first request', async () => {
  await boot();
  expect(document.querySelector('.request-feedback')).not.toBeNull();
  expect(result()).toBeNull();
});
