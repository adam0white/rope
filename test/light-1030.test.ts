// @vitest-environment happy-dom
// LIGHT 2026-10-30 panel: each case drives the public controls and reads the DOM, with the sim stepped by the
// same public `step`. Positions of the person who fell are fixtures; every answer is the engine's own.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  type ClimbState,
  canHear,
  clock,
  distance,
  earshot,
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

const led = (c: ClimbState, minutes = 400) => {
  queueInput(c, { t: 'lead', dir: 'up' });
  queueInput(c, { t: 'say', to: 'all', act: 'climb', force: 'urge' });
  for (let k = 0; k < minutes; k++) step(c);
};

it('F2226: a hurt call names a walk button that exists and brings the leader to the person', async () => {
  let fallen = '';
  let spot: ClimbState['members'][number]['pos'] | undefined;
  const d = await boot();
  const c = d.climb;
  led(c);
  const far = c.members
    .filter((m) => m.homeAt === null)
    .sort((a, b) => distance(c, b.pos, c.leader.pos) - distance(c, a.pos, c.leader.pos))[0];
  if (!far) throw new Error('fixture');
  fallen = far.id;
  spot = structuredClone(far.pos);
  far.injuries.push({ at: c.minute, severity: 0.3, leg: far.pos.leg ?? 'snow', caught: false });
  d.renderSheet();
  const name = memberOf(fallen).name;
  expect(hurtCall(c)?.who).toBe(fallen);
  expect(document.querySelector('.call-takeover')?.textContent ?? '').toContain('is hurt');
  await tap('.call-takeover', `walk to ${name}`);
  // The person who fell stays where they fell while the leader walks.
  const person = c.members.find((m) => m.id === fallen)!;
  for (let k = 0; k < 240 && hurtCall(c); k++) {
    step(c);
    person.pos = structuredClone(spot!);
    person.move = null;
  }
  expect(hurtCall(c)).toBeNull();
  expect(distance(c, person.pos, c.leader.pos)).toBeLessThan(40);
  // Only the leader walked: nobody else was told or made to follow.
  expect(c.leader.follow).toBeNull();
  expect(c.inputs.filter((i) => i.t === 'lead' && i.dir === 'near')).toHaveLength(1);
});

const answerText = () => document.querySelector('.request-result')?.textContent ?? '';

const chip = async (name: string) => {
  const found = buttons('.targets').find((b) => b.textContent?.startsWith(name));
  if (!found) throw new Error(`no chip ${name}`);
  await vi.advanceTimersByTimeAsync(500);
  found.click();
};

it('F2227: a topic question shows its own answer and the talk, not the last climb request', async () => {
  const d = await boot();
  const c = d.climb;
  led(c, 30);
  // An earlier request is on the panel first.
  queueInput(c, { t: 'say', to: 'all', act: 'climb', force: 'ask' });
  step(c);
  const nell = c.members.find((m) => m.id === 'nell')!;
  nell.pos = structuredClone(c.leader.pos);
  d.renderSheet();
  expect(answerText()).toContain('climb');
  await chip('Nell');
  await tap('.sheet', 'More requests to people');
  const talk = buttons('.sheet').find((b) => b.textContent?.startsWith('Ask Nell'));
  expect(talk?.textContent).toContain('local mountain names');
  await vi.advanceTimersByTimeAsync(500);
  talk!.click();
  const index = c.inputs.findLastIndex((i) => i.t === 'ask-life');
  expect(index).toBeGreaterThan(-1);
  const reply = c.lines.find((l) => l.input === index && l.who === 'nell');
  expect(reply).toBeDefined();
  d.renderSheet();
  const shown = answerText();
  expect(shown).toContain('You asked Nell');
  expect(shown).toContain('local mountain names');
  // The words shown for this question are the ones the engine recorded for it.
  expect(shown).toContain(reply!.says);
  expect(shown).not.toContain('agreed to climb');
  // Until the talk finishes the panel says so; once it is recorded, the recorded words replace that sentence.
  const clue = (e: { story?: boolean; text: string }) => e.story && e.text.includes('said, “I draw maps');
  expect(c.journal.some(clue)).toBe(false);
  expect(answerText()).toContain('The talk with Nell is not finished yet');
  for (let k = 0; k < 90 && !c.journal.some(clue); k++) step(c);
  expect(c.journal.some(clue)).toBe(true);
  d.renderSheet();
  expect(answerText()).toContain('then said: “I draw maps of bad mountain names');
  expect(answerText()).not.toContain('not finished yet');
});

it('F2228: a deferral names the job it is waiting on, from the engine record', async () => {
  const d = await boot();
  const c = d.climb;
  led(c, 20);
  for (const act of ['eat', 'rest'] as const) {
    queueInput(c, { t: 'say', to: 'wren', act, force: 'ask' });
    for (let k = 0; k < 3; k++) step(c);
  }
  const deferred = c.lines.filter((l) => l.who === 'wren' && l.verdict === 'deferred');
  expect(deferred.length).toBeGreaterThanOrEqual(2);
  d.renderSheet();
  const shown = answerText();
  expect(shown).toContain(deferred.at(-1)!.says);
  expect(shown).toMatch(/Wren is busy with “climb the hut path” until about \d\d:\d\d\./);
  // The job and its end time are the engine's recorded activity, not a host guess.
  expect(shown).toContain(clock(personOf(c, 'wren').activity!.endsAt));
});

it('F2226/F2233: a fall keeps the people row, and each person is described by what can be seen', async () => {
  const d = await boot();
  const c = d.climb;
  led(c);
  const far = c.members
    .filter((m) => m.homeAt === null)
    .sort((a, b) => distance(c, b.pos, c.leader.pos) - distance(c, a.pos, c.leader.pos))[0]!;
  far.injuries.push({ at: c.minute, severity: 0.3, leg: far.pos.leg ?? 'snow', caught: false });
  d.renderSheet();
  expect(document.querySelector('.call-takeover')).not.toBeNull();
  // Every climber is still a button, and each says which way they walk and where they are.
  for (const m of c.members.filter((x) => x.homeAt === null)) {
    const el = buttons('.targets').find((b) =>
      b.textContent?.startsWith(memberOf(m.id).name.split(' ')[0]!),
    )!;
    // Short on the chip, whole sentence as the accessible name.
    expect(el.textContent, memberOf(m.id).name).toMatch(/(↑|↓|·) (above|below|level)/);
    expect(el.getAttribute('aria-label'), memberOf(m.id).name).toMatch(
      /(Walking up|Walking down|Not walking), (above|below|level with) you\./,
    );
    const lo = memberState(c, m.id).move?.dir;
    expect(el.textContent).toContain(lo === 'up' ? '↑' : lo === 'down' ? '↓' : '·');
  }
  // Picking the person who fell shows their requests under the call; the call stays.
  await chip(memberOf(far.id).name.split(' ')[0]!);
  expect(document.querySelector('.ask-bar.hurt')).not.toBeNull();
  expect(document.querySelector('.sheet .people-verbs')).not.toBeNull();
  expect(buttons('.ask-bar').some((b) => b.textContent === `walk to ${memberOf(far.id).name}`)).toBe(true);
});

it('F2232/F2237: the pace line names what is holding time, not a generic call', async () => {
  const d = await boot();
  const c = d.climb;
  led(c, 5);
  const asker = c.members[0]!;
  asker.pos = structuredClone(c.leader.pos);
  asker.asks = { at: c.minute };
  (d as unknown as { slowUntil: number }).slowUntil = 0;
  d.renderSheet();
  const pace = document.querySelector('.clock-rate')?.textContent ?? '';
  expect(pace).toBe(`${memberOf(asker.id).name} wants to go down.`);
  const skip = document.querySelector<HTMLButtonElement>('.skip-button')!;
  expect(skip.title).toContain('someone out of earshot');
  expect(skip.title).toContain('food running out');
  expect(skip.title).toContain('At most two hours');
});

it('F2231: the two more controls have different words', async () => {
  const d = await boot();
  d.renderSheet();
  const more = [...buttons('.sheet'), ...buttons('.leader-bar')].filter((b) =>
    b.classList.contains('more-actions'),
  );
  expect(more.map((b) => b.textContent).sort()).toEqual(['more moves ▾', 'more requests ▾']);
  expect(new Set(more.map((b) => b.getAttribute('aria-label'))).size).toBe(2);
});

it('F2231: opening the weather warning leaves the request buttons ahead of it', async () => {
  const d = await boot();
  const c = d.climb;
  led(c, 60);
  expect(c.fieldRules).toBeTruthy();
  c.known.push('storm');
  d.renderSheet();
  const notice = document.querySelector('.field-notice');
  expect(notice?.textContent).toContain('Forecast');
  const verbs = document.querySelector('.sheet .people-verbs')!;
  expect(verbs.compareDocumentPosition(notice!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it('F2234: Skip stops when someone leaves earshot, food runs out or a rope-up window opens', () => {
  // A real led climb, then one change at a time to the state the stamp observes.
  const c = startClimb(41, 3);
  led(c, 120);
  const base = skipEventStamp(c);
  const copy = (): ClimbState => structuredClone(c);

  const out = copy();
  const hearer = out.members.find((m) => m.homeAt === null && canHear(out, m.id));
  if (!hearer) throw new Error('fixture: nobody in earshot');
  hearer.pos = structuredClone(
    MOUNTAINS[out.mountain] ? { place: MOUNTAINS[out.mountain]!.summit, leg: null, t: 0 } : hearer.pos,
  );
  expect(canHear(out, hearer.id)).toBe(false);
  expect(skipEventStamp(out)).not.toBe(base);
  // Each stop is named from the facts before and after: who, and what changed.
  expect(skipStopWords(skipFacts(c), out)).toBe(`${memberOf(hearer.id).name} is out of earshot.`);
  expect(skipStopWords(skipFacts(out), c)).toBe(`${memberOf(hearer.id).name} is back in earshot.`);

  const hungry = copy();
  const fed = hungry.members.find((m) => m.homeAt === null && m.rations > 0)!;
  fed.rations = 0;
  expect(skipEventStamp(hungry)).not.toBe(base);
  expect(skipStopWords(skipFacts(c), hungry)).toBe(`${memberOf(fed.id).name} has run out of food.`);

  // A rope-up request names two people; the stamp changes when they come within forty metres, not before.
  const pair = copy();
  const [a, b] = pair.members.filter((m) => m.homeAt === null && m.ropedTo === null);
  if (!a || !b) throw new Error('fixture: no pair');
  queueInput(pair, { t: 'say', to: a.id, act: 'gather', with: b.id, force: 'ask' });
  b.pos = { place: MOUNTAINS[pair.mountain]!.summit, leg: null, t: 0 };
  a.pos = { place: MOUNTAINS[pair.mountain]!.hut, leg: null, t: 0 };
  const apart = skipEventStamp(pair);
  expect(ropeWindow(pair)).toBeNull();
  b.pos = structuredClone(a.pos);
  expect(ropeWindow(pair)).toEqual([a.id, b.id]);
  expect(skipEventStamp(pair)).not.toBe(apart);
  expect(skipStopWords(skipFacts(pair), pair)).toBe('');
  const wasApart = structuredClone(pair);
  wasApart.members.find((m) => m.id === b.id)!.pos = {
    place: MOUNTAINS[pair.mountain]!.summit,
    leg: null,
    t: 0,
  };
  expect(skipStopWords(skipFacts(wasApart), pair)).toBe(
    `${memberOf(a.id).name} and ${memberOf(b.id).name} are close enough to rope up.`,
  );
  // And the other way: the window closes. Why is read from where the two are now.
  const names = `${memberOf(a.id).name} and ${memberOf(b.id).name}`;
  expect(skipStopWords(skipFacts(pair), wasApart)).toBe(`${names} are no longer close enough to rope up.`);
  expect(skipEventStamp(wasApart)).not.toBe(skipEventStamp(pair));
  const gone = structuredClone(wasApart);
  gone.members.find((m) => m.id === a.id)!.homeAt = gone.minute;
  expect(skipStopWords(skipFacts(pair), gone)).toBe(`${memberOf(a.id).name} is at the hut.`);
  const tied = structuredClone(wasApart);
  tied.members.find((m) => m.id === b.id)!.ropedTo = a.id;
  expect(skipStopWords(skipFacts(pair), tied)).toBe(
    `${memberOf(b.id).name} is now tied to ${memberOf(a.id).name}.`,
  );
});

it('F2229/F2230: the first Lead on note and the rope help say what they do in plain words', async () => {
  const d = await boot();
  const lead = nextNote(newDisclosure(), startClimb(41, 3));
  expect(lead?.text).toContain('walk up the path yourself');
  expect(lead?.text).toContain('does not move anyone else');
  const c = d.climb;
  led(c, 30);
  const [a, b] = c.members.filter((m) => m.homeAt === null).map((m) => m.id);
  queueInput(c, { t: 'say', to: a!, act: 'rope', with: b!, force: 'ask' });
  step(c);
  // The engine moved its member records while stepping: place the pair on the current records.
  c.members.find((m) => m.id === a)!.pos = { place: MOUNTAINS[c.mountain]!.hut, leg: null, t: 0 };
  c.members.find((m) => m.id === b)!.pos = { place: MOUNTAINS[c.mountain]!.summit, leg: null, t: 0 };
  d.renderSheet();
  expect(document.querySelector('.rope-help')?.textContent).toContain('neither can already be tied');
  expect(buttons('.request-result').some((x) => x.textContent?.startsWith('Close up'))).toBe(true);
});

it('the tapped route exports and replays exactly on the current engine, and takes the next input the same', async () => {
  const d = await boot();
  const c = d.climb;
  const tapStart = async (scope: string, prefix: string) => {
    const found = buttons(scope).find((b) => b.textContent?.startsWith(prefix));
    if (!found) throw new Error(`Missing "${prefix}": ${buttons(scope).map((b) => b.textContent)}`);
    await vi.advanceTimersByTimeAsync(500);
    found.click();
  };
  await tapStart('.leader-bar', 'lead on');
  await tapStart('.sheet', 'climb on');
  await tapStart('.sheet', 'askgently');
  for (let k = 0; k < 70; k++) step(d.climb);
  const far = d.climb.members
    .filter((m) => m.homeAt === null)
    .sort(
      (a, b) => distance(d.climb, b.pos, d.climb.leader.pos) - distance(d.climb, a.pos, d.climb.leader.pos),
    )[0]!;
  await chip(memberOf(far.id).name.split(' ')[0]!);
  await tapStart('.leader-bar', 'walk to');
  for (let k = 0; k < 20; k++) step(d.climb);
  const kinds = d.climb.inputs.map((i) => (i.t === 'lead' ? `lead:${i.dir}` : i.t));
  expect(kinds).toEqual(['lead:up', 'say', 'lead:near']);
  const exported = exportClimb(
    d.season.start ?? '',
    d.climb,
    ENGINE_VERSION,
    d.season.chapter,
    d.season.past,
  );
  const replayed = replayExport(exported);
  expect(snapshot(replayed)).toBe(exported.state);
  // The next input lands on the replayed run exactly as on the live one.
  for (const run of [d.climb, replayed]) {
    queueInput(run, { t: 'say', to: far.id, act: 'rest', force: 'ask' });
    for (let k = 0; k < 10; k++) step(run);
  }
  expect(snapshot(replayed)).toBe(snapshot(d.climb));
});

const inEarshot = (c: ClimbState) =>
  c.members.filter((m) => m.homeAt === null && canHear(c, m.id)).map((m) => m.id);

/**
 * Synthetic fixture: `id` is given an authored Move (and a start spot) so that the next minute puts them just across a
 * boundary measured to `other`: out of earshot or at least 40 m apart (`apart`), or closer than 40 m (`together`).
 * The engine then advances that Move and makes the real HF calls, but nothing here shows HF began that walk, so such a
 * state is not exported or replayed.
 */
function walkAcross(
  c: ClimbState,
  id: string,
  other: (next: ClimbState) => Pos,
  threshold: (next: ClimbState) => number,
  mode: 'apart' | 'together',
): void {
  const mem = memberState(c, id);
  const leg = mem.pos.leg ?? 'meadow';
  const next = { ...c, minute: c.minute + 1 } as ClimbState;
  const lerp = (mv: Move, minute: number): Pos => ({
    place: null,
    leg: mv.leg,
    t: mv.fromT + (mv.toT - mv.fromT) * Math.min(1, Math.max(0, (minute - mv.start) / (mv.end - mv.start))),
  });
  const walk = (from: number): Move => ({
    leg,
    dir: mode === 'apart' ? 'down' : 'up',
    fromT: from,
    toT: mode === 'apart' ? 0 : 1,
    start: c.minute,
    end: c.minute + 400,
  });
  const gap = (from: number) => distance(next, lerp(walk(from), c.minute + 1), other(next)) - threshold(next);
  let [low, high] = [0, mem.pos.t];
  for (let k = 0; k < 40; k++) {
    const mid = (low + high) / 2;
    if (gap(mid) > 0) low = mid;
    else high = mid;
  }
  const from = mode === 'apart' ? low - 0.0001 : high + 0.0001;
  mem.move = walk(from);
  mem.pos = { place: null, leg, t: from };
}

function walkOutOfEarshot(c: ClimbState, id: string): void {
  const moving = (m: Move, minute: number): Pos => ({
    place: null,
    leg: m.leg,
    t: m.fromT + (m.toT - m.fromT) * Math.min(1, Math.max(0, (minute - m.start) / (m.end - m.start))),
  });
  walkAcross(
    c,
    id,
    () => (c.leader.move ? moving(c.leader.move, c.minute + 1) : c.leader.pos),
    earshot,
    'apart',
  );
}

/** Start a Skip and drive native `Game.frame` calls through the one minute, asserting HF yields inside it. */
async function skipOneMinute(d: Driver, before: string[], lost: string[]): Promise<string> {
  const start = d.climb.minute;
  // The first-climb teaching notes have been read, so a note does not slow time and stop the Skip by itself.
  d.disc.seen.push('lead', 'ask', 'with', 'watch');
  // Words the sim made while the test stepped it directly have not been shown yet; show them before the Skip starts.
  d.afterStep();
  d.slowUntil = 0;
  d.skipping = true;
  d.skipStarted = start;
  vi.advanceTimersByTime(60_000);
  const frame = () => {
    d.acc = 1;
    d.frame();
  };
  // First native frame: movement is applied and HF yields before the minute is complete.
  frame();
  expect(d.minuteBefore).not.toBeNull();
  expect(inEarshot(d.climb)).not.toEqual(before);
  expect(d.skipping).toBe(true);
  // Later frames finish the same minute. Skip must stop on it, comparing with what was seen before it began.
  let frames = 1;
  while (d.minuteBefore !== null && frames < 20) {
    frame();
    frames++;
  }
  expect(frames).toBeGreaterThan(1);
  expect(d.climb.minute).toBe(start + 1);
  expect(d.skipping).toBe(false);
  const names = lost.map((id) => memberOf(id).name);
  const said =
    names.length > 1
      ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)} are out of earshot.`
      : `${names[0]} is out of earshot.`;
  expect(d.stopWords?.text).toContain(said);
  await vi.advanceTimersByTimeAsync(400);
  await d.flushSave();
  d.frame();
  expect(document.querySelector('.clock-rate')?.textContent).toContain(said);
  return said;
}

it('R1: native Skip stops on the minute a member left earshot when nothing else would stop it', async () => {
  const d = await boot();
  led(d.climb, 40);
  walkOutOfEarshot(d.climb, 'wren');
  const before = inEarshot(d.climb);
  expect(before).toContain('wren');
  // Independent reference: the same minute stepped whole on a copy leaves only Wren out of earshot, and opens no call.
  const reference = JSON.parse(snapshot(d.climb)) as ClimbState;
  step(reference);
  expect(before.filter((id) => !inEarshot(reference).includes(id))).toEqual(['wren']);
  expect(attentionNeeded(reference)).toBe(false);
  const said = await skipOneMinute(d, before, ['wren']);
  // Once the reading pause ends nothing needs the player, so the reason stays on the pace line.
  d.slowUntil = 0;
  await vi.advanceTimersByTimeAsync(400);
  await d.flushSave();
  d.frame();
  expect(attentionNeeded(d.climb)).toBe(false);
  expect(document.querySelector('.clock-rate')?.textContent).toContain(said);
});

/** The reason a pair window opening or closing stops a native Skip, through the visible pace line. */
async function pairWindowStop(mode: 'apart' | 'together'): Promise<string> {
  const d = await boot();
  led(d.climb, 40);
  queueInput(d.climb, { t: 'say', to: 'nell', act: 'gather', with: 'wren', force: 'ask' });
  for (let k = 0; k < 6; k++) step(d.climb);
  const c = d.climb;
  // Synthetic: Nell stands still and nobody is mid-gather, so only the authored walk changes the distance.
  const nell = memberState(c, 'nell');
  nell.move = null;
  nell.gather = undefined;
  memberState(c, 'wren').gather = undefined;
  walkAcross(
    c,
    'wren',
    () => memberState(c, 'nell').pos,
    () => 40,
    mode,
  );
  const before = inEarshot(c);
  const wasOpen = ropeWindow(c);
  expect(wasOpen !== null).toBe(mode === 'apart');
  // Reference: the same minute stepped whole on a copy flips only the window, with everyone audible and no call open.
  const reference = JSON.parse(snapshot(c)) as ClimbState;
  step(reference);
  expect(ropeWindow(reference) !== null).toBe(mode === 'together');
  expect(inEarshot(reference)).toEqual(before);
  expect(attentionNeeded(reference)).toBe(false);

  const start = c.minute;
  d.disc.seen.push('lead', 'ask', 'with', 'watch');
  d.afterStep();
  d.slowUntil = 0;
  d.skipping = true;
  d.skipStarted = start;
  vi.advanceTimersByTime(60_000);
  let frames = 0;
  do {
    d.acc = 1;
    d.frame();
    frames++;
  } while (d.minuteBefore !== null && frames < 20);
  expect(frames).toBeGreaterThan(1);
  expect(d.climb.minute).toBe(start + 1);
  expect(d.skipping).toBe(false);
  await vi.advanceTimersByTimeAsync(400);
  await d.flushSave();
  d.frame();
  return document.querySelector('.clock-rate')?.textContent ?? '';
}

const pairNames = `${memberOf('nell').name} and ${memberOf('wren').name}`;

it('R3: a rope-up window opening stops a native Skip and the pace line says which pair', async () => {
  expect(await pairWindowStop('together')).toBe(`${pairNames} are close enough to rope up.`);
});

it('R3: a rope-up window closing stops a native Skip and the pace line says the pair moved apart', async () => {
  expect(await pairWindowStop('apart')).toBe(`${pairNames} are no longer close enough to rope up.`);
});

it('R1: choosing a pace from the menu cancels a Skip like any other cancel and drops the minute in progress', async () => {
  const d = await boot();
  led(d.climb, 40);
  walkOutOfEarshot(d.climb, 'wren');
  d.disc.seen.push('lead', 'ask', 'with', 'watch');
  d.afterStep();
  d.slowUntil = 0;
  d.skipping = true;
  d.skipStarted = d.climb.minute;
  vi.advanceTimersByTime(60_000);
  d.acc = 1;
  d.frame();
  expect(d.minuteBefore).not.toBeNull();
  d.gameMenu();
  const slow = document.querySelector<HTMLElement>('[data-pace="slow"]');
  expect(slow).not.toBeNull();
  slow!.click();
  expect(d.skipping).toBe(false);
  expect(d.minuteBefore).toBeNull();
  // Close the menu and let the minute finish: with the Skip over, it records no Skip stop explanation.
  document.querySelector<HTMLElement>('[data-menu-close]')?.click();
  expect(document.querySelector('.game-menu')).toBeNull();
  for (let k = 0; k < 20 && d.climb.hfPhase !== undefined && d.climb.hfPhase !== null; k++) {
    d.acc = 1;
    d.frame();
  }
  expect(d.stopWords).toBeNull();
});

// The minute two members first leave earshot on the seed-20261030 climb led from the start (found by stepping that
// public route; the test asserts the premise rather than trusting the number). No fixture, so it exports and replays.
const LOSS_MINUTE = 4803;

it('R1/R3: on a played climb the stop is at the same minute, names who left, and exports, replays and takes the next input', async () => {
  const d = await boot();
  queueInput(d.climb, { t: 'lead', dir: 'up' });
  queueInput(d.climb, { t: 'say', to: 'all', act: 'climb', force: 'urge' });
  while (d.climb.minute < LOSS_MINUTE) step(d.climb);
  expect(d.climb.minute).toBe(LOSS_MINUTE);
  const before = inEarshot(d.climb);
  const reference = JSON.parse(snapshot(d.climb)) as ClimbState;
  step(reference);
  const lost = before.filter((id) => !inEarshot(reference).includes(id));
  expect(lost.length).toBeGreaterThan(1);
  await skipOneMinute(d, before, lost);
  // Here the leader also has to wait for the others, and that call keeps naming itself once the reading pause ends.
  d.slowUntil = 0;
  await vi.advanceTimersByTimeAsync(400);
  await d.flushSave();
  d.frame();
  expect(attentionNeeded(d.climb)).toBe(true);
  expect(document.querySelector('.clock-rate')?.textContent).toBe(attentionWords(d.climb));

  // The stop exports and replays exactly, and a real next input lands the same on both.
  const exported = exportClimb(
    d.season.start ?? '',
    d.climb,
    ENGINE_VERSION,
    d.season.chapter,
    d.season.past,
  );
  const replayed = replayExport(exported);
  expect(snapshot(replayed)).toBe(exported.state);
  const heard = inEarshot(d.climb)[0] ?? d.climb.members[0]!.id;
  const next = { t: 'say', to: heard, act: 'rest', force: 'ask' } as const;
  d.send(next);
  queueInput(replayed, next);
  step(replayed);
  expect(snapshot(replayed)).toBe(snapshot(d.climb));
  expect(d.stopWords).toBeNull();
});

it('R3: the Skip reason stays on the pace line while nothing needs the player, and goes stale; an open call names itself', async () => {
  const d = await boot();
  const c = d.climb;
  led(c, 5);
  d.slowUntil = 0;
  d.stopWords = { text: 'Nell is out of earshot.', at: c.minute };
  d.renderSheet();
  expect(document.querySelector('.clock-rate')?.textContent).toBe('Nell is out of earshot.');
  c.minute += 30;
  d.renderSheet();
  expect(document.querySelector('.clock-rate')?.textContent).toBe('');
  c.minute -= 30;
  const asker = c.members[0]!;
  asker.pos = structuredClone(c.leader.pos);
  asker.asks = { at: c.minute };
  d.renderSheet();
  expect(document.querySelector('.clock-rate')?.textContent).toBe(
    `${memberOf(asker.id).name} wants to go down.`,
  );
});

it('R2: the ordinary refresh updates a chip when someone passes the leader inside the same hour', async () => {
  const d = await boot();
  const c = d.climb;
  for (const m of c.members) m.pos = { place: null, leg: 'meadow', t: 0.4 };
  c.leader.pos = { place: null, leg: 'meadow', t: 0.5 };
  d.renderSheet();
  const nell = () => buttons('.targets').find((b) => b.textContent?.startsWith('Nell'))!;
  expect(nell().getAttribute('aria-label')).toContain('below you');
  const member = c.members.find((m) => m.id === 'nell')!;
  expect(canHear(c, 'nell')).toBe(true);
  member.pos = { place: null, leg: 'meadow', t: 0.6 };
  d.renderSheet(true);
  expect(nell().getAttribute('aria-label')).toContain('above you');
  expect(nell().textContent).toContain('above');
});
