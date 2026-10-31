// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { type ClimbState, snapshot, step } from '../src/sim/climb.ts';
import { newSeason, type SeasonState } from '../src/sim/season.ts';
import { Game } from '../src/ui/game.ts';
import { displayText } from '../src/ui/plain-english.ts';
import { playbackRate, skipEventStamp } from '../src/ui/playback.ts';

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
  slowUntil: number;
  noteUntil: number;
  storyUntil: number;
  stampUntil: number;
  endAt: number;
  skipping: boolean;
  acc: number;
  last: number;
  bubbles: Map<string, { el: HTMLElement; until: number; minute: number }>;
  renderSheet(): void;
  begin(c: ClimbState, start: string): void;
  closePage(): void;
  flushSave(): Promise<void>;
  frame(): void;
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
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
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function setup() {
  const game = new Game(document.querySelector<HTMLElement>('#app') as HTMLElement);
  await game.boot();
  const d = game as unknown as Driver;
  const { season, climb } = newSeason(41);
  d.season = season;
  d.begin(climb, season.start as string);
  await vi.runAllTimersAsync();
  await d.flushSave();
  d.closePage();
  return d;
}
it('waits for choices, slows for reading and leaves response time for calls', () => {
  expect(playbackRate(true, false, false, true)).toBe(0);
  expect(playbackRate(true, true, false, true)).toBe(0);
  // Reading is min(attention rate, selected base): never Skip's 1200 and never the fast 2.4.
  expect(playbackRate(false, true, false, true)).toBe(0.25);
  expect(playbackRate(false, true, true, false)).toBe(0.25);
  for (const speed of ['auto', 'normal', 'fast'] as const)
    expect(playbackRate(false, true, false, false, speed)).toBe(0.25);
  for (const attention of [false, true])
    for (const skip of [false, true]) expect(playbackRate(false, true, attention, skip, 'slow')).toBe(0.15);
  expect(playbackRate(false, false, false, true, 'slow')).toBe(1200);
  expect(playbackRate(false, false, true, true)).toBeLessThan(1);
  expect(playbackRate(false, false, false, false)).toBe(0.8);
  expect(playbackRate(false, false, false, false, 'slow')).toBe(0.15);
  expect(playbackRate(false, false, false, false, 'fast')).toBe(2.4);
});
it('stops a fast walk at its first delivered event, discards overshoot and preserves every stepped minute', async () => {
  const d = await setup();
  d.climb.leader.turnedAt = d.climb.minute;
  for (const m of d.climb.members) {
    m.turnedAt = d.climb.minute;
    m.asks = null;
  }
  d.slowUntil = performance.now() + 7500;
  d.renderSheet();
  expect(
    [...document.querySelectorAll('button')].some(
      (b) => b.getAttribute('aria-label') === 'Skip to the next event' && !b.hidden,
    ),
  ).toBe(false);
  vi.advanceTimersByTime(7500);
  d.renderSheet();
  expect(
    [...document.querySelectorAll('button')].some(
      (b) => b.getAttribute('aria-label') === 'Skip to the next event' && !b.hidden,
    ),
  ).toBe(true);
  const expected: ClimbState = JSON.parse(snapshot(d.climb));
  const before = skipEventStamp(expected);
  let count = 0;
  do {
    step(expected);
    count++;
  } while (!expected.over && count < 40 && skipEventStamp(expected) === before);
  document.querySelector<HTMLButtonElement>('[aria-label="Skip to the next event"]')?.click();
  d.slowUntil = 0;
  d.acc = 0;
  vi.advanceTimersByTime(100);
  d.last = performance.now() - 100;
  for (let i = 0; i < 200 && d.skipping; i++) {
    d.last = performance.now() - 100;
    d.frame();
  }
  expect(snapshot(d.climb)).toBe(snapshot(expected));
  expect(d.acc).toBe(0);
  expect(d.skipping).toBe(false);
  expect(skipEventStamp(d.climb)).not.toBe(before);
});
it('holds the clock and retains reading and bubble time through a long menu visit', async () => {
  const d = await setup();
  d.slowUntil = performance.now() + 7500;
  const bubble = {
    el: document.createElement('div'),
    until: performance.now() + 7500,
    minute: d.climb.minute,
  };
  d.bubbles.set('leader', bubble);
  [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find((b) => b.getAttribute('aria-label') === 'Game menu')
    ?.click();
  const before = snapshot(d.climb);
  vi.advanceTimersByTime(10000);
  d.frame();
  expect(snapshot(d.climb)).toBe(before);
  expect(d.slowUntil - performance.now()).toBe(7500);
  expect(bubble.until - performance.now()).toBe(7500);
  document.querySelector<HTMLButtonElement>('[data-menu-close]')?.click();
  vi.advanceTimersByTime(1000);
  d.frame();
  expect(snapshot(d.climb)).toBe(before);
});

it('keeps the ending transition behind an open menu and resets transient deadlines on the next climb', async () => {
  const d = await setup();
  d.climb.over = true;
  d.frame();
  await vi.runAllTimersAsync();
  await d.flushSave();
  [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find((b) => b.getAttribute('aria-label') === 'Game menu')
    ?.click();
  vi.advanceTimersByTime(10000);
  d.frame();
  expect(document.querySelector('[data-a="next"]')).toBeNull();
  document.querySelector<HTMLButtonElement>('[data-menu-close]')?.click();
  vi.advanceTimersByTime(2600);
  d.frame();
  expect(document.querySelector('[data-a="next"]')).not.toBeNull();
  d.slowUntil = performance.now() + 50000;
  const next = newSeason(42);
  d.season = next.season;
  d.begin(next.climb, next.season.start as string);
  expect(d.slowUntil - performance.now()).toBe(7500);
  expect([d.noteUntil, d.storyUntil, d.stampUntil, d.endAt]).toEqual([0, 0, 0, 0]);
});

// Mocked offsets: source-unit evidence only. Fonts, clipping, pointer and scroll are not measured here.
it('places real reply bubbles in every clear gap below the note, hides the excess, and keeps each recorded answer in the sheet', async () => {
  const d = await setup();
  const g = d as unknown as {
    send(input: unknown): void;
    scene: { at: Map<string, { x: number; y: number }> };
    noteEl: HTMLElement;
    sceneEl: HTMLElement;
    placeBubbles(now: number): void;
  };
  // One ordinary Ask through the engine: the lines below are its own recorded answers.
  g.send({ t: 'say', to: 'all', act: 'rest', force: 'ask' });
  const lines = d.climb.lines.filter((line) => line.input === 0);
  expect(lines.length).toBeGreaterThan(2);
  const dim = (el: HTMLElement, v: Record<string, number>) => {
    for (const [k, n] of Object.entries(v)) Object.defineProperty(el, k, { value: n, configurable: true });
  };
  dim(g.noteEl, { offsetWidth: 360, offsetHeight: 100, offsetLeft: 0, offsetTop: 0 });
  // Everyone stands in one cluster, so their bubbles compete for the same strip.
  for (const [i, who] of [...d.bubbles.keys()].entries())
    g.scene.at.set(who, { x: 120 + 5 * i, y: 120 + 5 * i });
  for (const b of d.bubbles.values()) dim(b.el, { offsetWidth: 180, offsetHeight: 40 });
  const place = (h: number) => {
    dim(g.sceneEl, { clientWidth: 360, clientHeight: h });
    g.placeBubbles(performance.now());
    const boxes = [...d.bubbles.entries()]
      .filter(([, b]) => b.el.classList.contains('on'))
      .map(([who, b]) => {
        const bottom = Number.parseFloat(b.el.style.top);
        const cx = Number.parseFloat(b.el.style.left);
        return { who, t: bottom - 40, b: bottom, l: cx - 90, r: cx + 90 };
      });
    for (const q of boxes) {
      expect(q.t).toBeGreaterThanOrEqual(100);
      expect(q.b).toBeLessThanOrEqual(h);
      expect(q.l).toBeGreaterThanOrEqual(0);
      expect(q.r).toBeLessThanOrEqual(360);
    }
    for (const [i, p] of boxes.entries())
      for (const q of boxes.slice(i + 1))
        expect(p.l < q.r && p.r > q.l && p.t < q.b && p.b > q.t, `${p.who} overlaps ${q.who}`).toBe(false);
    return boxes.map((q) => q.who);
  };
  // 200 high leaves 100..196 for 40-high bubbles: two fit with their gaps, so a second reply must not be hidden.
  const shown = place(200);
  expect(shown).toHaveLength(2);
  expect(shown).not.toContain('leader');
  expect(shown.every((who) => lines.some((line) => line.who === who))).toBe(true);
  // 130 high leaves less than one bubble below the note: nothing is shown.
  expect(place(130)).toEqual([]);
  // Hidden or not, every recorded answer is in the normal result and answers sheet, in order, for input 0.
  d.renderSheet();
  const result = document.querySelector<HTMLElement>('.request-result');
  expect(result?.dataset.input).toBe('0');
  const more = result?.querySelector<HTMLButtonElement>('.all-answers');
  expect(more?.textContent).toContain(String(lines.length));
  more?.click();
  const rows = [...document.querySelectorAll('.answers-sheet p')].map((p) => p.textContent ?? '');
  expect(rows).toHaveLength(lines.length);
  for (const [i, line] of lines.entries()) {
    expect(rows[i]?.toLowerCase()).toContain(line.who);
    expect(rows[i]).toContain(displayText(line.says));
  }
});
