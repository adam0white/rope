// @vitest-environment happy-dom

import { preparePersonaLife } from '@adam0white/lab-client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { type ClimbState, MOUNTAINS, queueInput, snapshot, step } from '../src/sim/climb.ts';
import { exportClimb, newSeason, replayExport, type SeasonState } from '../src/sim/season.ts';
import type { Continuity } from '../src/ui/continuity.ts';
import { Game } from '../src/ui/game.ts';
import { RopeStage } from '../src/ui/stage.ts';

const shelf = vi.hoisted(() => ({
  ready: Promise.resolve(true),
  enabled: false,
  setEnabled() {},
  request: vi.fn(),
}));

const lab = vi.hoisted(() => ({
  setPersonaRecording() {},
  allowPersonaRecording() {},
  build() {
    return { c: 'test' };
  },
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
vi.mock('@adam0white/lab-client', async (original) => ({
  ...(await original<typeof import('@adam0white/lab-client')>()),
  personaChannel: () => shelf,
  watchPersonaCheckpoint: () => () => {},
}));
vi.mock('../src/ui/lab.ts', () => ({ lab }));
vi.mock('../src/ui/scene.ts', () => ({
  Scene: class {
    at = new Map();
    mount = async () => {};
    draw = () => {};
    resize = () => {};
    destroy = () => {};
  },
}));
interface Driver {
  continuity: Continuity;
  season: SeasonState;
  begin(c: ClimbState, start: string): void;
  save(): void;
  resume(save: unknown): Promise<void>;
  debriefPage(): void;
  seasonPage(): void;
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
  history.replaceState(null, '', '/');
  localStorage.clear();
  shelf.ready = Promise.resolve(true);
  shelf.enabled = false;
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
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await vi.waitFor(() => expect(document.querySelector('[data-hour="12"]')).not.toBeNull());
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
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  tap('[data-hour="12"]');
  expect(query('.where').textContent).toContain('turn back at 12');
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

it('keeps the ordinary menu bounded and confirms a new game inline', async () => {
  await boot();
  tap('.menu-trigger');
  expect(query('[data-menu-send]').textContent).toBe('Feedback');
  expect(document.querySelectorAll('[data-menu-people], [data-menu-journal]')).toHaveLength(0);
  expect(query('[data-menu-fullscreen]')).toBeTruthy();
  expect(document.querySelectorAll('[data-recording] input')).toHaveLength(1);
  tap('[data-menu-new]');
  expect(query('[data-menu-confirm]').hidden).toBe(false);
  tap('[data-new-no]');
  expect(query('[data-menu-confirm]').hidden).toBe(true);
});

it('offers public pacing and collapsed run diagnostics beside privacy without cast controls', async () => {
  const d = await boot();
  expect(d.climb.fieldRules?.bladder).toBe(true);
  expect(d.climb.inputs[0]?.t).toBe('field-rules');
  expect(document.querySelector('[data-field]')).toBeNull();
  tap('.menu-trigger');
  expect(document.querySelectorAll('[data-pace]')).toHaveLength(4);
  const debug = query('[data-debug]') as HTMLDetailsElement;
  expect(debug.open).toBe(false);
  expect(debug.parentElement?.querySelector('a')?.textContent).toBe('Lab privacy');
  expect(debug.querySelector('[data-debug-export]')).not.toBeNull();
  expect(document.querySelector('[data-menu-people], [data-continuity], [data-fork]')).toBeNull();
  expect(query('[data-cast-shelf]').getAttribute('href')).toBe('https://human.adamwhite.work/lab/people/');
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
  expect(query('.call-takeover').textContent).toContain('the time you promised');
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
  expect(query('[data-feedback-status]').textContent).toContain('Sent. Your note is stored.');
  tap('[data-feedback-send]');
  feedback();
  expect(query<HTMLInputElement>('[data-feedback-name]').value).toBe('Ridge tester');
});

it.each([false, true])('shares play only at submit when checked=%s', async (checked) => {
  await boot();
  lab.telemetryOn = false;
  lab.privacySignalOn = true;
  feedback();
  const checkbox = query<HTMLInputElement>('[data-feedback-consent] input[type=checkbox]');
  expect(checkbox.checked).toBe(false);
  if (checked) checkbox.click();
  expect(lab.setTelemetryOff).not.toHaveBeenCalled();
  tap('[data-feedback-send]');
  await vi.waitFor(() =>
    expect(lab.sendFeedback).toHaveBeenCalledWith('', expect.objectContaining({ sharePlay: checked })),
  );
  expect(lab.sendRun).not.toHaveBeenCalled();
  expect(lab.openSendDialog).not.toHaveBeenCalled();
});

it('returns from the journal to the unresolved hut or title page', async () => {
  history.replaceState(null, '', '/?lab=1');
  await boot(false);
  tap('[data-a="new"]');
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  tap('.journal-trigger');
  tap('[data-a="close"]');
  expect(document.querySelector('.page-hut')).not.toBeNull();
  expect(document.querySelectorAll('[data-hour]')).toHaveLength(3);
  tap('.menu-trigger');
  tap('[data-menu-title]');
  tap('.journal-trigger');
  tap('[data-a="close"]');
  expect(document.querySelector('.page-title')).not.toBeNull();
});

it('does not cancel a pending season when recording identity acknowledges', async () => {
  const game = await boot(false);
  let release!: (value: boolean) => void;
  shelf.ready = new Promise<boolean>((resolve) => {
    release = resolve;
  });
  const pending = game.continuity.fresh(42, true);
  window.dispatchEvent(new Event('hf-lab-preference'));
  window.dispatchEvent(new StorageEvent('storage', { key: 'hf-lab-player' }));
  release(true);
  await expect(pending).resolves.toHaveProperty('season');
});

it('keeps one-page note-only Feedback and preserves the stable notice node', async () => {
  await boot();
  const notice = document.querySelector('.recording-footer')?.firstChild;
  lab.telemetryOn = false;
  feedback();
  expect(document.querySelector('.page-feedback h1')?.textContent).toBe('Feedback');
  expect(document.querySelectorAll('.page-feedback details')).toHaveLength(0);
  expect(document.querySelectorAll('.page-feedback input[type=checkbox]')).toHaveLength(1);
  expect(document.querySelector('[data-feedback-copy]')).toBeNull();
  expect(document.querySelector('[data-feedback-preview]')).toBeNull();
  expect(document.querySelector('.recording-footer')?.firstChild).toBe(notice);
});

it('a failed real admission keeps the saved season and ownership, without silently substituting a cast', async () => {
  const game = await boot();
  const saved = localStorage.getItem('rope.save.cast.v1');
  const ownership = game.continuity.ownership();
  shelf.enabled = true;
  shelf.request.mockRejectedValue(new Error('Shelf unavailable. Use a local file.'));
  tap('.menu-trigger');
  tap('[data-menu-new]');
  tap('[data-new-yes]');
  await vi.waitFor(() =>
    expect(document.querySelector('.page-title h1')?.textContent).toBe('The season has not begun'),
  );
  expect(localStorage.getItem('rope.save.cast.v1')).toBe(saved);
  expect(game.continuity.ownership()).toEqual(ownership);
  expect(document.querySelector('.page-title details')?.textContent).toContain('Shelf unavailable');
  expect(document.querySelector('[data-local]')).toBeNull();
  expect(document.querySelector('[data-retry]')).not.toBeNull();
  shelf.enabled = false;
});

it.each(['after-prepare', 'accepted-reply-lost'])(
  'preserves nonempty ownership through %s, saves and reloads',
  async (failure) => {
    const game = await boot(false);
    const { season, climb } = newSeason(13);
    queueInput(climb, { t: 'lead', dir: 'up' });
    while (!climb.over) step(climb);
    queueInput(climb, { t: 'release-person', to: 'oskar' });
    step(climb);
    game.season = season;
    game.begin(climb, season.start ?? '');
    shelf.enabled = true;
    shelf.request.mockResolvedValue({});
    await game.continuity.checkpoint('hf.cast.oskar.rope');
    game.save();
    const ownership = game.continuity.ownership();
    expect(ownership.heads).toHaveLength(1);
    const head = ownership.heads[0];
    if (!head) throw new Error('Missing owned head');
    const prepared = preparePersonaLife(head, 20 * 3600000);
    const saved = localStorage.getItem('rope.save.cast.v1');
    let accepted = false;
    shelf.request.mockImplementation(async (request) => {
      if (request.action === 'prepareBatch')
        return {
          expectedHeads: Object.fromEntries(
            ['tamar', 'oskar', 'nell', 'bilal', 'wren'].map((id) => [
              `hf.cast.${id}.rope`,
              id === 'oskar' ? head.revision : null,
            ]),
          ),
          inputs: [prepared],
          blocked: [],
        };
      if (request.action === 'putBatch') {
        expect(request.envelopes).toHaveLength(1);
        if (failure === 'accepted-reply-lost') accepted = true; // The fake service accepted; the transport reply was lost.
        throw new Error(
          failure === 'accepted-reply-lost'
            ? 'Reply lost after acceptance'
            : 'Write refused after preparation',
        );
      }
      throw new Error('Unexpected request');
    });
    tap('.menu-trigger');
    tap('[data-menu-new]');
    tap('[data-new-yes]');
    await vi.waitFor(() =>
      expect(document.querySelector('.page-title h1')?.textContent).toBe('The season has not begun'),
    );
    expect(accepted).toBe(failure === 'accepted-reply-lost');
    expect(localStorage.getItem('rope.save.cast.v1')).toBe(saved);
    expect(game.continuity.ownership()).toEqual(ownership);
    game.save();
    expect(JSON.parse(localStorage.getItem('rope.save.cast.v1') ?? '{}').ownership).toEqual(ownership);
    const stored = JSON.parse(localStorage.getItem('rope.save.cast.v1') ?? '{}');
    await game.resume(stored);
    expect(game.continuity.ownership()).toEqual(ownership);
    expect(game.climb.seed).toBe(climb.seed);
    expect(document.querySelector('[data-local]')).toBeNull();
  },
);

it.each([false, true])(
  'offers a finished-climb departure and displays the actual HF answer (refusal=%s)',
  async (refusal) => {
    const game = await boot(false);
    const { season, climb } = newSeason(13);
    queueInput(climb, { t: 'lead', dir: 'up' });
    while (!climb.over) step(climb);
    if (refusal) {
      const person = climb.people.find((p) => p.id === 'oskar');
      if (!person) throw new Error('Missing Oskar');
      person.activity = null;
      // Isolated HF refusal fixture. No host verdict is mocked or written.
      person.agenda.commitments.push({
        id: 'test-self-rule',
        status: 'pending',
        kind: 'abstain',
        actions: [],
        violatedBy: ['rest'],
        firm: true,
        from: climb.minute,
        until: climb.minute + 240,
        importance: 1,
        label: 'test-only refusal',
      });
    }
    game.season = season;
    game.begin(climb, season.start ?? '');
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
    game.debriefPage();
    tap('[data-depart="oskar"]');
    const line = game.climb.lines.at(-1);
    expect(game.climb.inputs.at(-1)).toMatchObject({ t: 'release-person', to: 'oskar' });
    expect(line?.verdict).toBe(refusal ? 'refused' : 'assented');
    expect(document.querySelector('[data-depart-status]')?.textContent).toContain(line?.says);
    if (refusal) expect(game.climb.journal.at(-1)?.text).not.toContain('agreed to end');
  },
);

it('confirms New game from the completed season without changing the save on preview', async () => {
  const game = await boot();
  game.season.over = true;
  game.seasonPage();
  const before = snapshot(game.climb);
  tap('[data-a="new"]');
  expect(query('[data-season-confirm]').hidden).toBe(false);
  expect(snapshot(game.climb)).toBe(before);
  tap('[data-season-no]');
  expect(query('[data-season-confirm]').hidden).toBe(true);
});

it('retains the manual playback control test behind lab=1', async () => {
  history.replaceState(null, '', '/?lab=1');
  await boot();
  tap('.menu-trigger');
  expect(document.querySelectorAll('[data-pace]')).toHaveLength(4);
  tap('[data-pace="fast"]');
  expect(query('[data-pace="fast"]').getAttribute('aria-pressed')).toBe('true');
  tap('[data-menu-close]');
  expect(document.querySelector('.menu-backdrop')).toBeNull();
});

it('public field plans cannot swallow the opening turn-back promise', async () => {
  const d = await boot(false);
  tap('[data-a="new"]');
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await vi.waitFor(() => expect(document.querySelector('[data-hour="12"]')).not.toBeNull());
  tap('[data-hour="12"]');
  expect(d.climb.fieldRules).toEqual({ bladder: true });
  expect(d.climb.promise?.hour).toBe(12);
  expect(d.climb.inputs.map((i) => i.t)).toEqual(['field-rules', 'promise']);
  const exported = exportClimb(d.season.start ?? '', d.climb, '3.0.0');
  expect(snapshot(replayExport(exported))).toBe(exported.state);
  expect(query('.where').textContent).toContain('turn back at 12');
});

it('publishes the actual request panel and tears the stage down on title and disposal', async () => {
  const game = await boot();
  const root = query('#app');
  expect(root.dataset.sheetId).toBe('main');
  tap('.more-actions');
  expect(root.dataset.sheetId).toBe('more');
  tap('.sheet-back');
  expect(root.dataset.sheetId).toBe('main');
  const lifecycle = game as unknown as { titlePage(): void; closePage(): void; destroy(): void };
  lifecycle.titlePage();
  expect(root.dataset.sheetId).toBeUndefined();
  lifecycle.closePage();
  expect(root.dataset.sheetId).toBe('main');
  lifecycle.destroy();
  expect(root.dataset.sheetId).toBeUndefined();
});

it('replacement boot removes stale shell', async () => {
  const old = (await boot(false)) as unknown as Game;
  old.destroy();
  const replacement = new Game(query('#app'));
  await replacement.boot();
  const scene = query('.scene');
  vi.spyOn(scene, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 60,
    width: 390,
    height: 401,
  } as DOMRect);
  (replacement as unknown as { closePage(): void }).closePage();
  expect(query('#app').style.getPropertyValue('--lk-scene-height')).toBe('401px');
  expect(document.querySelectorAll('.top')).toHaveLength(1);
  expect(document.querySelectorAll('.scene')).toHaveLength(1);
  replacement.destroy();
});
it('REVIEW disposed pending resume protects replacement save', async () => {
  const old = await boot();
  old.save();
  const saved = JSON.parse(localStorage.getItem('rope.save.cast.v1')!);
  let finish!: () => void;
  old.continuity.restoreOwnership = () =>
    new Promise<void>((resolve) => {
      finish = resolve;
    });
  const pending = old.resume(saved);
  (old as unknown as Game).destroy();
  localStorage.setItem('rope.save.cast.v1', 'replacement-save');
  finish();
  await pending;
  expect(localStorage.getItem('rope.save.cast.v1')).toBe('replacement-save');
});

it('flushes current progress on destroy but preserves a foreign replacement', async () => {
  const game = await boot();
  step(game.climb);
  const minute = game.climb.minute;
  (game as unknown as Game).destroy();
  expect(JSON.parse(localStorage.getItem('rope.save.cast.v1')!).minute).toBe(minute);
  const next = await boot(false);
  const state = newSeason(7);
  next.season = state.season;
  next.begin(state.climb, state.season.start ?? snapshot(state.climb));
  localStorage.setItem('rope.save.cast.v1', 'foreign');
  (next as unknown as Game).destroy();
  expect(localStorage.getItem('rope.save.cast.v1')).toBe('foreign');
});

it('does not install a pending new season after destroy', async () => {
  const game = await boot(false);
  let finish!: (state: ReturnType<typeof newSeason>) => void;
  game.continuity.fresh = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  tap('[data-a="new"]');
  (game as unknown as Game).destroy();
  localStorage.setItem('rope.save.cast.v1', 'replacement');
  finish(newSeason(4));
  await Promise.resolve();
  await Promise.resolve();
  expect(localStorage.getItem('rope.save.cast.v1')).toBe('replacement');
  expect(document.querySelector('.scene')).toBeNull();
});

it('persists successor progress after boot flushes the live predecessor', async () => {
  const old = await boot();
  old.save();
  step(old.climb);
  const flushedMinute = old.climb.minute;
  const replacement = new Game(query('#app'));
  await replacement.boot();
  expect(JSON.parse(localStorage.getItem('rope.save.cast.v1')!).minute).toBe(flushedMinute);
  tap('[data-a="continue"]');
  const next = replacement as unknown as Driver;
  await vi.waitFor(() => expect(next.climb?.minute).toBe(flushedMinute));
  step(next.climb);
  next.save();
  expect(JSON.parse(localStorage.getItem('rope.save.cast.v1')!).minute).toBe(next.climb.minute);
  replacement.destroy();
});

it('never adopts foreign bytes during predecessor teardown', async () => {
  const old = await boot();
  old.save();
  step(old.climb);
  const replacement = new Game(query('#app'));
  localStorage.setItem('rope.save.cast.v1', 'foreign');
  await replacement.boot();
  const next = replacement as unknown as Driver;
  const state = newSeason(9);
  next.season = state.season;
  next.begin(state.climb, state.season.start ?? snapshot(state.climb));
  next.save();
  replacement.destroy();
  expect(localStorage.getItem('rope.save.cast.v1')).toBe('foreign');
});

it('moves overlay boundary with measured header typography and releases it on teardown', () => {
  const root = query('#app');
  root.innerHTML =
    '<div class="top">A complete header</div><div class="scene"></div><div class="sheet"></div><div class="leader-bar"></div>';
  const top = root.querySelector<HTMLElement>('.top')!;
  let height = 80;
  vi.spyOn(top, 'getBoundingClientRect').mockImplementation(() => ({ height }) as DOMRect);
  const stage = new RopeStage(root, () => {});
  stage.show('answers');
  expect(root.style.getPropertyValue('--rope-top-height')).toBe('80px');
  height = 140;
  window.dispatchEvent(new Event('resize'));
  expect(root.style.getPropertyValue('--rope-top-height')).toBe('140px');
  stage.destroy();
  expect(root.style.getPropertyValue('--rope-top-height')).toBe('');
  height = 180;
  window.dispatchEvent(new Event('resize'));
  expect(root.style.getPropertyValue('--rope-top-height')).toBe('');
});
