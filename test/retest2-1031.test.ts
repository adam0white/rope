// @vitest-environment happy-dom
// Retest 2 (2026-10-31): P1 edition refusal at every rebuild boundary, driven by genuine packets produced by the
// 99a4227 source before the edition changed, and the deferred rope offer. Later-climb packets (season.past) are an
// explicit gap: the genuine one is 31 MB and is kept outside the repo.
import { File as NodeFile } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createLab, type Lab } from '@adam0white/lab-client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  CAST_EDITION,
  distance,
  memberState,
  personOf,
  queueInput,
  restore,
  snapshot,
  step,
} from '../src/sim/climb.ts';
import { ENGINE_VERSION } from '../src/sim/hf4.ts';
import { exportClimb, newSeason, replayExport } from '../src/sim/season.ts';
import { Game } from '../src/ui/game.ts';

const control = vi.hoisted(() => ({ lab: null as unknown as Lab }));
vi.mock('../src/ui/lab.ts', () => ({
  get lab() {
    return control.lab;
  },
}));
vi.mock('../src/ui/scene.ts', () => ({
  Scene: class {
    mount = async () => {};
    destroy() {}
    resize() {}
    render() {}
    update() {}
    draw() {}
    at = new Map();
  },
}));

const fixture = (name: string): string =>
  gunzipSync(readFileSync(`test/fixtures/${name}.json.gz`)).toString('utf8');
const nativeText = () => fixture('rope-hf4-1-first-native');
const exportText = () => fixture('rope-hf4-1-first-export');
const OLD_FILE = 'This file is from a different version of Rope. Keep the file and start a fresh season.';
const GENERIC = 'This file could not be opened. Keep the file and start a fresh season.';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

const games: Game[] = [];
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 200 })),
  );
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  localStorage.clear();
  localStorage.setItem('hf-lab-recording-off', '1');
  localStorage.setItem('hf-lab-player', 'a'.repeat(32));
  control.lab = createLab({
    game: 'rope',
    preservation: 'preserve',
    build: { c: 'synthetic-host-control' },
    captureErrors: false,
  });
});
afterEach(() => {
  for (const game of games.splice(0)) game.destroy();
  control.lab.setTelemetryOff(true);
  control.lab.dispose();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
interface Driver {
  climb: unknown;
  originalFile: unknown;
  continuity: { restoreOwnership(...args: unknown[]): Promise<void> };
  resume(save: unknown): Promise<void>;
}
async function open(path: string) {
  history.replaceState(null, '', path);
  const root = document.createElement('main');
  document.body.append(root);
  const game = new Game(root);
  games.push(game);
  await game.boot();
  return { root, driver: game as unknown as Driver };
}
async function choose(root: HTMLElement, data: string) {
  const input = root.querySelector<HTMLInputElement>('[data-file-input]')!;
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [new NodeFile([data], 'source.json', { type: 'application/json' })],
  });
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(root.querySelector('[data-file-status]')?.textContent).not.toBe('Loading…'), {
    timeout: 15000,
  });
}

it('the retained packets really are rope-hf4-1 starts from the earlier source', () => {
  const save = JSON.parse(nativeText());
  expect(JSON.parse(save.start).castEdition).toBe('rope-hf4-1');
  expect(JSON.parse(exportText()).v).toBe(2);
  expect(JSON.parse(JSON.parse(exportText()).start).castEdition).toBe('rope-hf4-1');
  expect(CAST_EDITION).toBe('rope-hf4-2');
  // The restore backstop still refuses the old state.
  expect(() => restore(save.state)).toThrow();
});

it('native Resume of a genuine rope-hf4-1 packet shows start-new copy and changes nothing', async () => {
  const text = nativeText();
  localStorage.setItem('rope.save.cast.v1', text);
  const { root, driver } = await open('/');
  const restoreOwnership = vi.spyOn(driver.continuity, 'restoreOwnership');
  await driver.resume(JSON.parse(text));
  expect(root.textContent).toContain('cannot continue in this version');
  expect(root.textContent).toContain('Start a new game');
  expect(localStorage.getItem('rope.save.cast.v1')).toBe(text);
  expect(restoreOwnership).not.toHaveBeenCalled();
  expect(driver.climb ?? null).toBeNull();
});

it.each([
  ['native file', nativeText],
  ['public export', exportText],
])(
  'the file chooser refuses a genuine rope-hf4-1 %s with the exact message and no side effects',
  async (_n, make) => {
    const owner = 'native season untouched by an older-edition file';
    localStorage.setItem('rope.save.cast.v1', owner);
    const { root, driver } = await open('/file/?lab=1');
    const text = make();
    await choose(root, text);
    expect(root.querySelector('[data-file-status]')?.textContent).toBe(OLD_FILE);
    expect(driver.originalFile ?? null).toBeNull();
    expect(localStorage.getItem('rope.save.cast.v1')).toBe(owner);
  },
);

it('the file-session wrapper refuses an older-edition original with the exact message', async () => {
  const original = exportText();
  const session = JSON.stringify({
    format: 'rope-file-session/2',
    original: { text: original, sha256: sha(original) },
    native: JSON.parse(nativeText()),
    current: JSON.parse(original),
  });
  const { root, driver } = await open('/file/?lab=1');
  await choose(root, session);
  expect(root.querySelector('[data-file-status]')?.textContent).toBe(OLD_FILE);
  expect(driver.originalFile ?? null).toBeNull();
});

it('a start with no castEdition keeps its old error instead of the edition message', async () => {
  const raw = JSON.parse(exportText());
  const start = JSON.parse(raw.start);
  delete start.castEdition;
  raw.start = JSON.stringify(start);
  const { root } = await open('/file/?lab=1');
  await choose(root, JSON.stringify(raw));
  expect(root.querySelector('[data-file-status]')?.textContent).toBe(GENERIC);
});

it('the current edition still replays its own export exactly', () => {
  const { season, climb } = newSeason(7);
  expect(JSON.parse(season.start!).castEdition).toBe(CAST_EDITION);
  queueInput(climb, { t: 'lead', dir: 'up' });
  for (let k = 0; k < 5; k++) step(climb);
  const exported = exportClimb(season.start!, climb, ENGINE_VERSION, season.chapter, season.past);
  expect(snapshot(replayExport(exported))).toBe(snapshot(climb));
});

/**
 * R2. Seed 7, lead up, ask everyone to climb, 60 steps, then ask Nell to rope up with Wren. The baseline run on
 * 99a4227 resolved "deferred" at 06:01 and "unavailable" at 06:02, so the cap is six steps after the request (a
 * test cap backed by that two-step baseline, not a rule of the game).
 */
it('R2: a deferred rope request is reweighed against the same advice and not answered unavailable', () => {
  const { climb: c } = newSeason(7);
  queueInput(c, { t: 'lead', dir: 'up' });
  queueInput(c, { t: 'say', to: 'all', act: 'climb', force: 'ask' });
  for (let k = 0; k < 60; k++) step(c);
  const index = queueInput(c, { t: 'say', to: 'nell', act: 'rope', with: 'wren', force: 'ask' });
  step(c);
  const mem = memberState(c, 'nell');
  const request = mem.pending ?? mem.deferred;
  expect(request?.input).toBe(index);
  const adviceId = `${request!.s.voiceId}:${request!.s.since}`;
  const seen = new Map<string, { verdict: string; reason: string | undefined; eligible: boolean }>();
  const collect = () => {
    for (const e of personOf(c, 'nell').events) {
      if (e.data.kind !== 'suggestion-resolved' || e.data.adviceId !== adviceId) continue;
      if (seen.has(e.data.decisionId)) continue;
      const near = distance(c, memberState(c, 'nell').pos, memberState(c, 'wren').pos) < 40;
      const tied = !!memberState(c, 'nell').ropedTo || !!memberState(c, 'wren').ropedTo;
      seen.set(e.data.decisionId, {
        verdict: e.data.resolution.verdict,
        reason: e.data.resolution.reason,
        eligible: near && !tied,
      });
    }
  };
  collect();
  for (let k = 0; k < 5 && seen.size < 2; k++) {
    step(c);
    collect();
  }
  const events = [...seen.values()];
  // No vacuous pass: two distinct public resolutions of this very advice must exist within the cap.
  expect(events.length).toBeGreaterThanOrEqual(2);
  expect(events[0]?.verdict).toBe('deferred');
  expect(events[1]?.eligible).toBe(true);
  expect(events[1]?.reason).not.toBe('unavailable');
});
