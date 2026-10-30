// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { snapshot, step } from '../src/sim/climb.ts';
import { FRAMEWORK_VERSION } from '../src/sim/hf4.ts';
import * as seasons from '../src/sim/season.ts';
import { newSeason } from '../src/sim/season.ts';
import { Game } from '../src/ui/game.ts';

vi.mock('../src/ui/scene.ts', () => ({
  Scene: class {
    mount = async () => {};
    draw() {}
    destroy() {}
    at = new Map();
  },
}));
vi.mock('@adam0white/lab-client', async (original) => ({
  ...(await original<typeof import('@adam0white/lab-client')>()),
  personaChannel: () => ({ ready: Promise.resolve(), enabled: false, setEnabled() {}, request: vi.fn() }),
  watchPersonaCheckpoint: () => () => {},
}));
vi.mock('../src/ui/lab.ts', () => ({
  lab: {
    setPersonaRecording() {},
    allowPersonaRecording() {},
    build: () => ({ c: 'test' }),
    screen() {},
    milestone() {},
    trackRun: () => () => {},
    captureSave() {},
    telemetryOn: false,
    setTelemetryOff() {},
  },
}));
let game: Game;
let d: any;
beforeEach(async () => {
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('fetch', async () => ({ ok: false }));
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  game = new Game(document.querySelector('#app')!);
  await game.boot();
  d = game;
});
afterEach(async () => {
  vi.restoreAllMocks();
  await d.flushSave();
  game.destroy();
  await d.flushSave();
  vi.unstubAllGlobals();
});
function begin(seed: number) {
  const state = newSeason(seed);
  d.season = state.season;
  d.begin(state.climb, state.season.start);
  return state;
}
it('pauses native play until the full current archive is durably saved', async () => {
  const { climb } = begin(7);
  expect(d.saving).toBe(true);
  expect(d.sheet.inert).toBe(true);
  expect(d.pageEl.inert).toBe(true);
  expect(document.body.textContent).toContain('Saving. Time is paused.');
  d.send({ t: 'lead', dir: 'up' });
  expect(climb.inputs).toHaveLength(0);
  await d.flushSave();
  const saved = JSON.parse(localStorage.getItem('rope.save.cast.v1')!);
  expect(saved.v).toBe(2);
  expect(saved.engine).toBe(FRAMEWORK_VERSION);
  expect(saved.state).toBe(snapshot(climb));
  expect(d.saving).toBe(false);
  expect(d.sheet.inert).toBe(false);
  expect(d.pageEl.inert).toBe(false);
});
it('coalesces another save request and persists the latest complete state', async () => {
  const { climb } = begin(7);
  await d.flushSave();
  step(climb);
  d.save();
  step(climb);
  d.save();
  await d.flushSave();
  const saved = JSON.parse(localStorage.getItem('rope.save.cast.v1')!);
  expect(saved.state).toBe(snapshot(climb));
  expect(saved.minute).toBe(climb.minute);
});
it('preserves a competing native writer and visibly reports unsaved progress', async () => {
  begin(7);
  localStorage.setItem('rope.save.cast.v1', 'another tab');
  await d.flushSave();
  expect(localStorage.getItem('rope.save.cast.v1')).toBe('another tab');
  expect(document.body.textContent).toContain('This progress was not saved.');
});
it('a stale pending save cannot overwrite a replacement run', async () => {
  begin(7);
  d.continuity.invalidate();
  const { climb } = begin(8);
  await d.flushSave();
  const saved = JSON.parse(localStorage.getItem('rope.save.cast.v1')!);
  expect(saved.state).toBe(snapshot(climb));
  expect(saved.season.seed).toBe(8);
});

it('keeps failure details in lab Debug while recovery and season notices stay plain', async () => {
  vi.stubGlobal(
    'Worker',
    class {
      postMessage() {}
      terminate() {}
    },
  );
  const raw = 'synthetic internal <failure>';
  await d.continuity.fresh(7, true);
  expect(d.continuity.status).toBe(
    'This season is played on its own. Saved histories from other games have not changed.',
  );
  await d.continuity.fresh(7);
  expect(d.continuity.status).toBe('This season starts with the original climbers.');
  begin(7);
  await d.flushSave();
  expect(d.continuity.status).not.toContain('chapter');
  for (const query of ['', '?lab=0', '?lab=1']) {
    history.replaceState(null, '', `/${query}`);
    const lab = query === '?lab=1';
    const save = vi.spyOn(d, 'nativeSaveText').mockImplementation(() => {
      throw new Error(raw);
    });
    d.save();
    await d.flushSave();
    expect(d.saveNotice.textContent).toContain('This progress was not saved. Download before closing.');
    expect(d.saveNotice.textContent.includes(raw)).toBe(lab);
    if (lab) expect(d.saveNotice.querySelector('details')?.open).toBe(false);
    save.mockRestore();

    const fresh = vi.spyOn(d.continuity, 'fresh').mockRejectedValue(new Error(raw));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await d.newGame();
    expect(d.pageEl.textContent).toContain('Your saved season has not been replaced.');
    expect(d.pageEl.textContent.includes(raw)).toBe(lab);
    d.gameMenu();
    expect(document.body.textContent.includes(raw)).toBe(lab);
    d.menuEl.querySelector('[data-menu-close]').click();
    fresh.mockRestore();
    consoleError.mockRestore();

    d.climb.over = true;
    d.debriefPage();
    const next = vi.spyOn(seasons, 'nextClimbFrames').mockImplementation(() => {
      throw new Error(raw);
    });
    await d.advanceNow();
    expect(d.pageEl.textContent).toContain('The next climb could not start.');
    expect(d.pageEl.textContent.includes(raw)).toBe(lab);
    expect(d.pageEl.querySelector('[data-a="next"]').disabled).toBe(false);
    next.mockRestore();
  }
  history.replaceState(null, '', '/');
});
