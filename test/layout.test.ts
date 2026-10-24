// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { type ClimbState, MOUNTAINS, snapshot } from '../src/sim/climb.ts';
import { Game } from '../src/ui/game.ts';

const lab = vi.hoisted(() => ({
  screen: vi.fn(),
  milestone: vi.fn(),
  captureSave: vi.fn(),
  trackRun: () => () => {},
  telemetryOn: true,
  privacySignalOn: false,
  privacyOverride: false,
  setTelemetryOff: vi.fn(),
  sendFeedback: vi.fn(async () => ({})),
  sendRun: vi.fn(async () => ({})),
  openSendDialog: vi.fn(),
}));
vi.mock('../src/ui/lab.ts', () => ({ lab }));
vi.mock('../src/ui/scene.ts', () => ({
  Scene: class {
    at = new Map();
    mount = async () => {};
    draw = () => {};
  },
}));
interface Driver {
  climb: ClimbState;
  frame(): void;
  renderSheet(): void;
  last: number;
}
const query = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing ${selector}`);
  return el;
};
const tap = (selector: string) => query<HTMLButtonElement>(selector).click();
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout'] });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  localStorage.clear();
  lab.telemetryOn = true;
  lab.privacySignalOn = false;
  lab.privacyOverride = false;
  vi.clearAllMocks();
  lab.setTelemetryOff.mockImplementation((off: boolean) => {
    lab.telemetryOn = !off;
    if (off) localStorage.setItem('hf-lab-recording-off', '1');
    else localStorage.removeItem('hf-lab-recording-off');
  });
  document.body.innerHTML = '<div id="app"></div>';
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function boot(play = true) {
  const game = new Game(query('#app'));
  await game.boot();
  if (play) {
    tap('[data-a="new"]');
    tap('[data-hour="12"]');
  }
  return game as unknown as Driver;
}
const feedback = () => {
  tap('.menu-trigger');
  tap('[data-menu-send]');
};

it('uses one top menu and information trigger, with the promise and all six recipients in play', async () => {
  await boot(false);
  expect(document.querySelectorAll('.menu-trigger')).toHaveLength(1);
  expect(document.querySelectorAll('.top-info')).toHaveLength(1);
  expect(document.querySelectorAll('[data-speed]')).toHaveLength(0);
  expect(document.querySelector('.drawer-btn')).toBeNull();
  tap('[data-a="new"]');
  tap('[data-hour="12"]');
  expect(query('.where').textContent).toContain('turn at 12');
  expect(query('.day-promise').getAttribute('aria-label')).toContain('12:00');
  expect(query('.day-bar').style.getPropertyValue('--dusk')).toBe(`${((1170 - 240) / 1140) * 100}%`);
  expect(document.querySelectorAll('.targets .chip')).toHaveLength(6);
});

it('information holds time, closes with Escape or an outside tap, and returns to the climb', async () => {
  const d = await boot();
  vi.advanceTimersByTime(8000);
  const before = snapshot(d.climb);
  tap('.top-info');
  vi.advanceTimersByTime(3000);
  d.frame();
  expect(snapshot(d.climb)).toBe(before);
  query('.info-backdrop').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(document.querySelector('.info-backdrop')).toBeNull();
  tap('.top-info');
  tap('.info-backdrop');
  expect(document.querySelector('.info-backdrop')).toBeNull();
});

it('keeps manual pacing in the menu and exposes its journal and feedback rows', async () => {
  await boot();
  tap('.menu-trigger');
  expect(query('[data-menu-journal]').textContent).toContain('The journal');
  expect(query('[data-menu-send]').textContent).toContain('Send word');
  expect(document.querySelectorAll('[data-pace]')).toHaveLength(4);
  tap('[data-pace="fast"]');
  expect(query('[data-pace="fast"]').getAttribute('aria-pressed')).toBe('true');
  tap('[data-menu-journal]');
  expect(query('.page h2').textContent).toBe('The journal');
  expect(document.querySelector('.menu-backdrop')).toBeNull();
});

it('a company call opens from its banner and a promised hour takes over the sheet', async () => {
  const d = await boot();
  d.climb.promise = null;
  const asker = d.climb.members[0];
  if (!asker) throw new Error('Missing person');
  asker.asks = { at: d.climb.minute };
  d.renderSheet();
  expect(query('.company-banner').textContent).toContain('wants to go down');
  expect(document.querySelector('.ask-bar')).toBeNull();
  tap('.company-banner');
  expect([...document.querySelectorAll('.ask-bar button')].some((b) => b.textContent === 'send Oskar')).toBe(
    true,
  );
  tap('.sheet-back');
  asker.asks = null;
  d.climb.promise = {
    at: d.climb.minute,
    hour: 12,
    hearers: d.climb.members.map((m) => m.id),
    status: 'open',
  };
  d.climb.minute = d.climb.day * 1440 + 720;
  const far = d.climb.members[1];
  const mountain = MOUNTAINS[d.climb.mountain];
  if (!far || !mountain) throw new Error('Missing fixture');
  far.pos = { place: mountain.summit, leg: null, t: 0 };
  d.renderSheet();
  expect(query('.call-takeover').textContent).toContain('the hour you promised');
  expect(query('.call-takeover').textContent).toContain('Too far');
  expect(document.querySelector('.sheet .people-verbs')).toBeNull();
});

it('sends a note and optional name while recording, then remembers the name', async () => {
  await boot();
  feedback();
  query<HTMLTextAreaElement>('[data-feedback-note]').value = 'I could tell who heard me.';
  query<HTMLInputElement>('[data-feedback-name]').value = 'Ridge tester';
  tap('[data-verdict="keep"]');
  tap('[data-feedback-send]');
  await vi.waitFor(() =>
    expect(lab.sendFeedback).toHaveBeenCalledWith(
      'Verdict: keep\n\nI could tell who heard me.',
      expect.objectContaining({
        name: 'Ridge tester',
      }),
    ),
  );
  expect(lab.sendRun).not.toHaveBeenCalled();
  expect(query('[data-feedback-status]').textContent).toContain('queued');
  tap('[data-feedback-send]');
  feedback();
  expect(query<HTMLInputElement>('[data-feedback-name]').value).toBe('Ridge tester');
});

it.each(['off', 'privacy'])('sends feedback in the same sheet when %s', async (choice) => {
  await boot();
  if (choice === 'off') {
    localStorage.setItem('hf-lab-recording-off', '1');
    lab.telemetryOn = false;
  } else lab.privacySignalOn = true;
  feedback();
  expect(query<HTMLButtonElement>('[data-feedback-send]').disabled).toBe(false);
  tap('[data-feedback-send]');
  await vi.waitFor(() => expect(lab.sendFeedback).toHaveBeenCalledOnce());
  expect(lab.sendRun).not.toHaveBeenCalled();
  expect(lab.openSendDialog).not.toHaveBeenCalled();
  expect(lab.setTelemetryOff).not.toHaveBeenCalled();
});

it('returns from the journal to the unresolved hut or title page', async () => {
  await boot(false);
  tap('[data-a="new"]');
  tap('.menu-trigger');
  tap('[data-menu-journal]');
  tap('[data-a="close"]');
  expect(document.querySelector('.page-hut')).not.toBeNull();
  expect(document.querySelectorAll('[data-hour]')).toHaveLength(3);
  tap('.menu-trigger');
  tap('[data-menu-title]');
  tap('.menu-trigger');
  tap('[data-menu-journal]');
  tap('[data-a="close"]');
  expect(document.querySelector('.page-title')).not.toBeNull();
});
