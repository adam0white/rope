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
  await driver.resume({
    engine: '2.17.0',
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
const openAnswers = () => {
  const button = result()?.querySelector<HTMLButtonElement>('.all-answers');
  if (!button) throw new Error('Missing All answers button');
  button.click();
  return document.querySelector('.answers-sheet');
};
const backToRequests = () => document.querySelector<HTMLButtonElement>('.sheet-back')?.click();

it('labels accepted rest as rest and retains each authentic HF answer', async () => {
  const driver = await boot();
  driver.send({ t: 'say', to: 'all', act: 'rest', force: 'ask' });
  const answers = driver.climb.lines.filter((line) => line.input === 0);
  expect(answers.some((line) => line.verdict === 'assented')).toBe(true);
  expect(result()?.textContent).toContain('Rest accepted:');
  const details = openAnswers();
  for (const line of answers) expect(details?.textContent).toContain(line.says);
  expect(details?.textContent).toContain('agreed to rest');
  backToRequests();
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
  expect(document.querySelector('.company-banner')?.textContent).toContain('wants to go down');
  expect(document.querySelector('.ask-bar')).toBeNull();
  vi.advanceTimersByTime(500);
  document.querySelector<HTMLButtonElement>('.company-banner')?.click();
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
  const accepted = c.lines.filter((line) => line.input === latest && line.verdict === 'assented');
  const answers = openAnswers();
  for (const line of accepted) expect(answers?.textContent).toContain(line.says);
  expect(answers?.textContent).toContain('agreed to turn back');
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

it('keeps every opening promise answer readable after speech expires', async () => {
  const driver = await boot();
  driver.send({ t: 'promise', hour: 12 });
  const answers = driver.climb.lines.filter((line) => line.input === 0);
  expect(answers).toHaveLength(5);
  expect(result()?.textContent).toContain('Turnback promised at 12:00.');
  const details = openAnswers();
  expect(document.querySelectorAll('.answers-sheet p')).toHaveLength(5);
  for (const line of answers) expect(details?.textContent).toContain(line.says);
  vi.advanceTimersByTime(8500);
  driver.renderSheet(true);
  for (const line of answers)
    expect(document.querySelector('.answers-sheet')?.textContent).toContain(line.says);
  backToRequests();
  vi.advanceTimersByTime(500);
  driver.send({ t: 'say', to: 'tamar', act: 'rest', force: 'ask' });
  expect(result()?.textContent).not.toContain('Turnback promised at 12:00.');
});

const tap = (text: string) => {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) =>
      b.textContent === text ||
      b.querySelector('span')?.textContent === text ||
      b.getAttribute('aria-label') === text,
  );
  if (!button) throw new Error(`Missing button: ${text}`);
  button.click();
};

it('distinguishes an old earshot follow from an active close approach and arrival', async () => {
  const driver = await boot();
  const c = driver.climb;
  const tamar = c.members.find((m) => m.id === 'tamar');
  if (!tamar) throw new Error('Missing Tamar');
  for (const m of c.members) {
    m.pos = { place: null, leg: 'meadow', t: 0.5 };
    m.idleUntil = c.minute + 200;
  }
  c.leader.pos = { place: null, leg: 'meadow', t: 0.43 };
  c.leader.follow = 'tamar';
  tap('Tamar Vale');
  expect(document.querySelector('.movement-status')?.textContent).toContain('earshot');
  expect(document.querySelector('.movement-status')?.textContent).toContain('too far to help');
  tap('walk to Tamar Vale');
  expect(document.querySelector('.movement-status')?.textContent).toContain('Walking to Tamar');
  expect(document.querySelector('.movement-status')?.textContent).toContain('metres');
  expect(document.querySelector('.movement-status')?.textContent).toContain('if she stays');
  c.leader.pos = { ...tamar.pos };
  c.leader.move = null;
  driver.renderSheet(true);
  expect(document.querySelector('.movement-status')?.textContent).toContain('Close enough to help Tamar');
  tap('stop');
  expect(document.querySelector('.movement-status')?.textContent).not.toContain('Walking to Tamar');
});

it('offers a real pair gathering request after distance blocks roping', async () => {
  const driver = await boot();
  const c = driver.climb;
  for (const m of c.members) {
    m.pos = { place: null, leg: 'meadow', t: 0.5 };
    m.idleUntil = c.minute + 200;
  }
  const oskar = c.members.find((m) => m.id === 'oskar');
  if (!oskar) throw new Error('Missing Oskar');
  oskar.pos.t = 0.6;
  c.leader.pos = { place: null, leg: 'meadow', t: 0.55 };
  driver.send({ t: 'say', to: 'tamar', act: 'rope', with: 'oskar', force: 'ask' });
  expect(result()?.textContent).toContain('too far');
  expect(document.querySelector('.gather-pair')?.textContent).toBe('Close up: Tamar Vale + Oskar');
  vi.advanceTimersByTime(500);
  tap('Close up: Tamar Vale + Oskar');
  expect(c.inputs.at(-1)).toMatchObject({
    t: 'say',
    to: 'tamar',
    act: 'gather',
    with: 'oskar',
    force: 'ask',
  });
  const answers = c.lines.filter((l) => l.input === c.inputs.length - 1);
  expect(answers).toHaveLength(2);
  expect(result()?.textContent).toContain('Close up');
  const recorded = openAnswers();
  for (const line of answers) expect(recorded?.textContent).toContain(line.says);
});

it('keeps recorded answers open when walking progress rebuilds the sheet', async () => {
  const driver = await boot();
  driver.send({ t: 'promise', hour: 12 });
  const details = openAnswers();
  if (!details) throw new Error('Missing answers');
  driver.climb.leader.near = 'tamar';
  driver.renderSheet(true);
  expect(document.querySelector('.sheet-answers')).not.toBeNull();
  for (const line of driver.climb.lines)
    expect(document.querySelector('.answers-sheet')?.textContent).toContain(line.says);
});

it('removes a distance gathering response as soon as the pair reaches one another', async () => {
  const driver = await boot();
  const c = driver.climb;
  for (const m of c.members) {
    m.pos = { place: null, leg: 'meadow', t: 0.5 };
    m.idleUntil = c.minute + 200;
  }
  const nell = c.members.find((m) => m.id === 'nell');
  if (!nell) throw new Error('Missing Nell');
  nell.pos.t = 0.6;
  c.leader.pos = { place: null, leg: 'meadow', t: 0.55 };
  driver.send({ t: 'say', to: 'tamar', act: 'rope', with: 'nell', force: 'ask' });
  expect(document.querySelector('.gather-pair')).not.toBeNull();
  nell.pos.t = 0.51;
  driver.renderSheet(true);
  expect(document.querySelector('.gather-pair')).toBeNull();
});
