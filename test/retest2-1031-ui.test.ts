// @vitest-environment happy-dom
// Retest 2 (2026-10-31) UI wording: P2 partner picker, P3 activity words, P4 request result and company chips,
// P5 wait deferral, R5 Stay note, R3 reading pace, P8 talk ETA. Positions and activity records are fixtures where
// stated; every verdict is the engine's own. No browser: phone geometry is unverified.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  type ClimbState,
  canHear,
  clock,
  distance,
  MOUNTAINS,
  type Move,
  memberState,
  type NewInput,
  type Pos,
  personOf,
  queueInput,
  snapshot,
  startClimb,
  step,
} from '../src/sim/climb.ts';
import { ENGINE_VERSION } from '../src/sim/hf4.ts';
import { memberOf } from '../src/sim/party.ts';
import { exportClimb, newSeason, replayExport, type SeasonState } from '../src/sim/season.ts';
import { hurtCall } from '../src/ui/calls.ts';
import { newDisclosure, nextNote } from '../src/ui/disclosure.ts';
import { Game } from '../src/ui/game.ts';
import {
  attentionNeeded,
  attentionWords,
  ropeWindow,
  skipEventStamp,
  skipFacts,
  skipStopWords,
} from '../src/ui/playback.ts';

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
  season: SeasonState;
  resume(save: unknown): Promise<void>;
  flushSave(): Promise<void>;
  renderSheet(ifChanged?: boolean): void;
  frame(): void;
  send(input: NewInput): void;
  skipping: boolean;
  skipStarted: number;
  acc: number;
  slowUntil: number;
  minuteBefore: unknown;
  disc: { seen: string[] };
  afterStep(): void;
  gameMenu(): void;
  stopWords: { text: string; at: number } | null;
  answersInput: number;
  panel: string;
  target: string;
  verb: string | null;
  renderTop(): void;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('indexedDB', undefined);
  vi.spyOn(Date, 'now').mockReturnValue(20261030);
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
});
let active: Driver | undefined;
afterEach(async () => {
  await vi.advanceTimersByTimeAsync(1);
  await active?.flushSave();
  active = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const buttons = (scope = 'body') => [...document.querySelectorAll<HTMLButtonElement>(`${scope} button`)];
const tap = async (scope: string, text: string) => {
  const found = buttons(scope).find((b) => b.textContent === text || b.getAttribute('aria-label') === text);
  if (!found) throw new Error(`Missing "${text}" in ${scope}: ${buttons(scope).map((b) => b.textContent)}`);
  await vi.advanceTimersByTimeAsync(500);
  found.click();
  return found;
};

/** A climb that has actually been led for a while, installed into the real Game. */
async function boot(seed = 20261030): Promise<Driver> {
  const game = new Game(document.querySelector('#app') as HTMLElement);
  await game.boot();
  const { season, climb } = newSeason(seed);
  await (game as unknown as Driver).resume({
    v: 2,
    ownership: {
      runId: 'local-test-fixture',
      heads: [],
      sources: [],
      archives: [],
      fileOrigin: false,
      localOnly: true,
    },
    engine: ENGINE_VERSION,
    state: snapshot(climb),
    season,
    start: season.start,
    inputs: [],
    minute: climb.minute,
    over: false,
    disclosure: { unlocked: ['insist', 'tell', 'promise', 'rope', 'fix', 'pack', 'share'], seen: [] },
  });
  const driver = game as unknown as Driver;
  active = driver;
  await vi.advanceTimersByTimeAsync(1);
  await driver.flushSave();
  return driver;
}

const buttonsOf = (scope = 'body') => [...document.querySelectorAll<HTMLButtonElement>(`${scope} button`)];
const chipOf = (name: string) => buttonsOf('.targets').find((b) => b.textContent?.startsWith(name))!;
const led = (c: ClimbState, minutes = 30) => {
  queueInput(c, { t: 'lead', dir: 'up' });
  queueInput(c, { t: 'say', to: 'all', act: 'climb', force: 'urge' });
  for (let k = 0; k < minutes; k++) step(c);
};
const result = () => document.querySelector('.request-result')?.textContent ?? '';
const activityFor = (c: ClimbState, action: string, endsIn = 20) =>
  ({
    id: `fixture-${action}`,
    affordanceId: `fixture-${action}`,
    action,
    affordance: {
      id: `fixture-${action}`,
      action,
      label: action,
      duration: endsIn,
      effort: 0.1,
      placeId: 'x',
    },
    startedAt: c.minute,
    endsAt: c.minute + endsIn,
    reviewAt: c.minute + endsIn,
    effort: 0.1,
    focus: 0,
    mode: 'awake',
  }) as unknown as NonNullable<ReturnType<typeof personOf>['activity']>;
const beside = (c: ClimbState, id: string) => {
  const mem = memberState(c, id);
  mem.pos = structuredClone(c.leader.pos);
  mem.move = null;
  return mem;
};

it('P3: only an accepted, visible, running activity is named, in fixed words with its planned end', async () => {
  const d = await boot();
  const c = d.climb;
  led(c);
  const words: Record<string, string> = {
    rest: 'Resting',
    eat: 'Eating',
    drink: 'Drinking',
    wait: 'Waiting',
    relieve: 'Stepped aside',
  };
  const label = () => chipOf('Nell').getAttribute('aria-label') ?? '';
  for (const [action, word] of Object.entries(words)) {
    beside(c, 'nell');
    personOf(c, 'nell').activity = activityFor(c, action);
    d.renderSheet();
    expect(label(), action).toContain(`${word} until about ${clock(c.minute + 20)}`);
    expect(label()).not.toMatch(/because|tired|hungry|trust|need|bladder/i);
  }
  // Nothing is named when it cannot be seen, is not running, is not an accepted kind, or the person walks.
  beside(c, 'nell');
  personOf(c, 'nell').activity = activityFor(c, 'rest');
  memberState(c, 'nell').move = { dir: 'up' } as unknown as Move;
  d.renderSheet(true);
  expect(label()).not.toContain('Resting');
  memberState(c, 'nell').move = null;
  personOf(c, 'nell').activity = activityFor(c, 'rest', 0);
  d.renderSheet(true);
  expect(label()).not.toContain('Resting');
  personOf(c, 'nell').activity = activityFor(c, 'sing');
  d.renderSheet(true);
  expect(label()).not.toMatch(/until about/);
  personOf(c, 'nell').activity = activityFor(c, 'rest');
  memberState(c, 'nell').pos = { place: MOUNTAINS[c.mountain]!.hut, leg: null, t: 0 };
  expect(canHear(c, 'nell')).toBe(false);
  d.renderSheet(true);
  expect(label()).not.toContain('Resting');
});

it('P3: an actual accepted public activity starts and ends on a refreshed chip', async () => {
  const d = await boot(41);
  const c = d.climb;
  queueInput(c, { t: 'say', to: 'all', act: 'rest', force: 'ask' });
  let actor = '';
  for (let k = 0; k < 20 && !actor; k++) {
    step(c);
    actor =
      c.members.find((m) => personOf(c, m.id).activity?.action === 'rest' && canHear(c, m.id) && !m.move)
        ?.id ?? '';
  }
  expect(actor).not.toBe('');
  const name = memberOf(actor).name;
  const activity = personOf(c, actor).activity!;
  expect(c.hfActive[actor]?.id).toBe(activity.id);
  expect(c.lines.some((line) => line.who === actor && ['assented', 'complied'].includes(line.verdict))).toBe(
    true,
  );
  d.renderSheet(true);
  expect(chipOf(name).getAttribute('aria-label')).toContain('Resting until about');
  for (let k = 0; k < 120 && personOf(c, actor).activity?.id === activity.id; k++) step(c);
  expect(personOf(c, actor).activity?.id).not.toBe(activity.id);
  d.renderSheet(true);
  expect(chipOf(name).getAttribute('aria-label')).not.toContain('Resting until about');
});

it('P4: a company call says what it recorded and the movement separately, never an agreement', async () => {
  const d = await boot();
  const c = d.climb;
  led(c);
  const mem = beside(c, 'tamar');
  mem.asks = { at: c.minute };
  const label = () => chipOf('Tamar').getAttribute('aria-label') ?? '';
  for (const [move, words] of [
    [{ dir: 'up' }, 'Still walking up'],
    [null, 'Standing still'],
    [{ dir: 'down' }, 'Walking down'],
  ] as const) {
    mem.move = move as unknown as Move | null;
    d.renderSheet(true);
    expect(label()).toContain('wants to go down and asked who will come with her.');
    expect(label()).toContain(words);
    expect(chipOf('Tamar').querySelector('small')?.textContent).toContain('asks who will go down');
    expect(chipOf('Tamar').querySelector('small')?.textContent).not.toContain('wants to go down');
    expect(label()).not.toMatch(/agreed|because of|your request/i);
  }
});

it('P4: "agreed" needs an accepted line for the displayed input and person', async () => {
  const d = await boot();
  const c = d.climb;
  led(c);
  beside(c, 'nell');
  // Two requests in the same minute: only A has an accepted line.
  const a = c.inputs.push({ t: 'say', to: 'nell', act: 'rest', force: 'ask', at: c.minute }) - 1;
  const b = c.inputs.push({ t: 'say', to: 'nell', act: 'climb', force: 'ask', at: c.minute }) - 1;
  c.lines.push({
    at: c.minute,
    who: 'nell',
    input: a,
    verdict: 'assented',
    reason: 'ok',
    says: 'Fine, resting.',
  });
  d.renderSheet(true);
  expect(result()).not.toContain('agreed');
  expect(result()).toContain('waiting for Nell');
  expect(b).toBeGreaterThan(a);
  // Autonomous movement with no accepted input on display.
  c.lines.push({ at: c.minute, who: 'wren', input: b, verdict: 'assented', reason: 'ok', says: 'Fine.' });
  d.renderSheet(true);
  expect(result()).not.toContain('Nell agreed');
  // A stale accepted line from an earlier minute belongs to its own input only.
  c.lines.length = 0;
  c.lines.push({
    at: c.minute - 30,
    who: 'nell',
    input: a,
    verdict: 'assented',
    reason: 'ok',
    says: 'Fine.',
  });
  d.renderSheet(true);
  expect(result()).not.toContain('agreed');
  // The exact accepted line for the displayed input and person does read as agreed.
  c.lines.push({ at: c.minute, who: 'nell', input: b, verdict: 'assented', reason: 'ok', says: 'Yes.' });
  d.renderSheet(true);
  expect(result()).toContain('Nell agreed to');
});

it('P4: a real seed-7 acceptance is linked to its exact input and shows as agreed', async () => {
  const d = await boot(7);
  const c = d.climb;
  queueInput(c, { t: 'lead', dir: 'up' });
  d.send({ t: 'say', to: 'all', act: 'climb', force: 'ask' });
  const index = c.inputs.length - 1;
  for (let k = 0; k < 10; k++) step(c);
  const accepted = c.lines.find((l) => l.input === index && ['assented', 'complied'].includes(l.verdict));
  expect(accepted, 'a real accepted line for the displayed input').toBeDefined();
  d.renderSheet(true);
  expect(result()).toContain('agreed to');
});

it('P5: a wait deferral says the person has not agreed yet, in the result and the answers sheet', async () => {
  const d = await boot();
  const c = d.climb;
  led(c);
  beside(c, 'nell');
  const i = c.inputs.push({ t: 'say', to: 'nell', act: 'wait', force: 'ask', at: c.minute }) - 1;
  c.lines.push({
    at: c.minute,
    who: 'nell',
    input: i,
    verdict: 'deferred',
    reason: 'busy',
    says: 'Not yet.',
  });
  d.renderSheet(true);
  expect(result()).toContain('Nell has not agreed to wait yet');
  expect(result()).not.toContain('wants to wait before waiting');
  d.answersInput = i;
  d.panel = 'answers';
  d.renderSheet();
  expect(document.querySelector('.answers-sheet')?.textContent).toContain('has not agreed to wait yet');
});

it('R5: Stay with them describes the real rule and names who cannot hear', async () => {
  const d = await boot();
  const c = d.climb;
  led(c, 60);
  const text = () => document.querySelector('.movement-status')?.textContent ?? '';
  c.leader.follow = 'party';
  c.leader.near = undefined;
  for (const m of c.members) beside(c, m.id);
  d.renderSheet();
  expect(text()).toContain(
    'Stay with them moves you toward the person in the middle by height, and stops you when you are close or level. Each person chooses what to do.',
  );
  expect(text()).not.toContain('Cannot hear you');
  expect(text()).not.toMatch(/near the middle|together|follow you/i);
  const wren = memberState(c, 'wren');
  wren.pos = { place: MOUNTAINS[c.mountain]!.hut, leg: null, t: 0 };
  wren.homeAt = null;
  if (canHear(c, 'wren')) throw new Error('fixture: Wren must be out of earshot');
  d.renderSheet();
  expect(text()).toContain('Cannot hear you: Wren');
  for (const m of c.members.filter((x) => x.id !== 'wren'))
    expect(text()).not.toContain(`: ${memberOf(m.id).name}`);
});

it('R3: reading slows time, Skip returns after the hold, attention still hides Skip', async () => {
  const d = await boot();
  const c = d.climb;
  led(c, 5);
  for (const m of c.members) m.asks = null;
  const pace = () => document.querySelector('.clock-rate')?.textContent ?? '';
  const skip = () => document.querySelector<HTMLButtonElement>('.skip-button')!;
  d.slowUntil = performance.now() + 5000;
  d.renderTop();
  expect(pace()).toBe(
    'Time moves slowly while you read. Skip returns after this reading time if nothing else needs your attention.',
  );
  expect(skip().hidden).toBe(true);
  await vi.advanceTimersByTimeAsync(6000);
  d.renderTop();
  expect(skip().hidden).toBe(false);
  // Deliver a real answer during the active hold through afterStep.
  d.afterStep();
  d.slowUntil = performance.now() + 5000;
  const oldDeadline = d.slowUntil;
  const input = queueInput(c, { t: 'say', to: 'nell', act: 'climb', force: 'ask' });
  step(c);
  expect(c.lines.some((line) => line.who === 'nell' && line.input === input)).toBe(true);
  d.afterStep();
  expect(d.slowUntil).toBeGreaterThan(oldDeadline);
  const extendedDeadline = d.slowUntil;
  d.renderTop();
  expect(skip().hidden).toBe(true);
  // Attention keeps Skip hidden after the hold, and names itself first while reading.
  const mem = memberState(c, 'tamar');
  mem.asks = { at: c.minute };
  mem.homeAt = null;
  d.renderTop();
  expect(pace()).toContain(`${attentionWords(c)} Time moves slowly while you read.`);
  await vi.advanceTimersByTimeAsync(extendedDeadline - performance.now() + 1);
  expect(performance.now()).toBeGreaterThanOrEqual(d.slowUntil);
  expect(performance.now() < d.slowUntil).toBe(false);
  d.renderTop();
  expect(attentionNeeded(c)).toBe(true);
  expect(skip().hidden).toBe(true);
  mem.asks = null;
  expect(attentionNeeded(c)).toBe(false);
  expect(performance.now() < d.slowUntil).toBe(false);
  d.renderTop();
  expect(skip().hidden).toBe(false);
});

it('P8: the talk time is shown only for this request while its talk is running', async () => {
  const d = await boot();
  const c = d.climb;
  led(c, 30);
  const nell = beside(c, 'nell');
  expect(nell.homeAt).toBeNull();
  d.renderSheet();
  await vi.advanceTimersByTimeAsync(500);
  chipOf('Nell').click();
  await vi.advanceTimersByTimeAsync(500);
  buttonsOf('.sheet')
    .find((b) => b.getAttribute('aria-label') === 'More requests to people')!
    .click();
  await vi.advanceTimersByTimeAsync(500);
  buttonsOf('.sheet')
    .find((b) => b.textContent?.startsWith('Ask Nell'))!
    .click();
  const index = c.inputs.findLastIndex((i) => i.t === 'ask-life');
  for (let k = 0; k < 10 && personOf(c, 'nell').activity?.action !== 'talk'; k++) step(c);
  expect(personOf(c, 'nell').activity?.action, 'the talk must be running').toBe('talk');
  expect(c.hfRequests.nell?.input).toBe(index);
  d.renderSheet(true);
  expect(result()).toContain(
    `If the talk is not interrupted, it may be added to the journal at about ${clock(personOf(c, 'nell').activity!.endsAt)}.`,
  );
  expect(result()).not.toMatch(/will be added|promise/i);
});

it('P2: the partner picker says near, far or already tied against the selected target, in words only', async () => {
  const d = await boot();
  const c = d.climb;
  led(c, 30);
  const target = beside(c, 'nell');
  const close = beside(c, 'wren');
  close.pos = structuredClone(target.pos);
  const faraway = memberState(c, 'bilal');
  faraway.pos = { place: MOUNTAINS[c.mountain]!.hut, leg: null, t: 0 };
  const tied = memberState(c, 'oskar');
  tied.pos = structuredClone(target.pos);
  tied.ropedTo = 'tamar';
  d.target = 'nell';
  d.panel = 'partner';
  d.renderSheet();
  const label = (name: string) =>
    buttonsOf('.targets')
      .find((b) => b.textContent?.startsWith(name))
      ?.getAttribute('aria-label') ?? '';
  expect(distance(c, close.pos, target.pos)).toBeLessThan(40);
  expect(distance(c, faraway.pos, target.pos)).toBeGreaterThanOrEqual(40);
  expect(label('Wren')).toContain('Close to Nell.');
  expect(canHear(c, 'bilal')).toBe(false);
  expect(chipOf('Bilal').classList.contains('far')).toBe(true);
  expect(label('Bilal')).toContain('He cannot hear you. Far from Nell.');
  target.pos = structuredClone(faraway.pos);
  d.renderSheet(true);
  expect(label('Bilal')).toContain('He cannot hear you. Close to Nell.');
  target.pos = structuredClone(close.pos);
  d.renderSheet(true);
  expect(label('Oskar')).toContain('Already tied to someone.');
  expect(label('Wren')).not.toMatch(/\d/);
  // The words follow the positions: the sheet refreshes when the distance changes.
  faraway.pos = structuredClone(target.pos);
  d.renderSheet(true);
  expect(label('Bilal')).toContain('Close to Nell.');
});
