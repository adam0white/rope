// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { snapshot, step } from '../src/sim/climb.ts';
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
  expect(saved.engine).toBe('4.8.1');
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
