// @vitest-environment happy-dom
import { File as NodeFile } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { canonicalCast, createLab, createPersona, type Lab } from '@adam0white/lab-client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { type NewInput, queueInput, snapshot, step } from '../src/sim/climb.ts';
import { ENGINE_VERSION } from '../src/sim/hf4.ts';
import { castIdOf } from '../src/sim/party.ts';
import { climberTransfer } from '../src/sim/passport.ts';
import { exportClimb, newSeason } from '../src/sim/season.ts';
import type { Ownership } from '../src/ui/continuity.ts';
import { newDisclosure } from '../src/ui/disclosure.ts';
import { Game } from '../src/ui/game.ts';

const control = vi.hoisted(() => ({ lab: null as unknown as Lab, channels: 0 }));
vi.mock('../src/ui/lab.ts', () => ({
  get lab() {
    return control.lab;
  },
}));
vi.mock('@adam0white/lab-client', async (original) => {
  const actual = await original<typeof import('@adam0white/lab-client')>();
  return {
    ...actual,
    personaChannel: () => {
      control.channels++;
      return actual.personaChannel();
    },
  };
});
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
  control.channels = 0;
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
async function open() {
  history.replaceState(null, '', '/file/?lab=1');
  const root = document.createElement('main');
  document.body.append(root);
  const game = new Game(root);
  games.push(game);
  await game.boot();
  return { root, game, active: game as unknown as Driver };
}
interface Driver {
  climb: ReturnType<typeof newSeason>['climb'];
  originalFile: unknown;
  sentAt: number;
  send(input: NewInput): void;
  runExport(): {
    format: string;
    original: { text: string; sha256: string };
    current: { state: string };
    native: { ownership: { heads: unknown[]; sources: unknown[]; archives: unknown[]; fileOrigin: boolean } };
  };
}
async function choose(root: HTMLElement, data: string | Uint8Array) {
  const input = root.querySelector<HTMLInputElement>('[data-file-input]')!;
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [
      new NodeFile([typeof data === 'string' ? data : Uint8Array.from(data)], 'source.json', {
        type: 'application/json',
      }),
    ],
  });
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(root.querySelector('[data-file-status]')?.textContent).not.toBe('Loading…'), {
    timeout: 15000,
  });
}
function opening() {
  const { season, climb } = newSeason(7);
  const start = season.start!;
  queueInput(climb, { t: 'lead', dir: 'up' });
  for (let i = 0; i < 6; i++) step(climb);
  return { season, climb, start };
}
function native() {
  const { season, climb, start } = opening();
  return {
    v: 2,
    engine: ENGINE_VERSION,
    season,
    start,
    inputs: climb.inputs,
    minute: climb.minute,
    disclosure: newDisclosure(),
    over: climb.over,
    state: snapshot(climb),
    ownership: { runId: 'fixture-run', heads: [], fileOrigin: false, sources: [], archives: [] } as Ownership,
  };
}
function publicExport() {
  const { season, climb, start } = opening();
  return {
    ...exportClimb(start, climb, ENGINE_VERSION, season.chapter, season.past),
    castSources: [],
    castArchives: [],
  };
}
function hash(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

it('uses plain refusal text and keeps raw file errors behind lab=1', async () => {
  for (const query of ['', '?lab=0', '?lab=1']) {
    const { root, game } = await open();
    history.replaceState(null, '', `/file/${query}`);
    const driver = game as unknown as {
      entry: string;
      savedText: string;
      load(): unknown;
      titlePage(): void;
      filePage(): void;
      startupError: string;
    };
    driver.entry = 'native';
    driver.savedText = JSON.stringify({ v: 1 });
    expect(driver.load()).toBeNull();
    const notice =
      'This saved season cannot be opened in this version of Rope. It has not been deleted. Start a new game to play.';
    expect(driver.startupError).toBe(notice);
    driver.titlePage();
    expect(root.querySelector('.page-body [role="status"]')?.textContent).toBe(notice);
    expect(root.querySelector('[data-a="new"]')).not.toBeNull();
    for (const engine of [ENGINE_VERSION, '999.0.0']) {
      driver.savedText = JSON.stringify({ v: 2, engine, state: null });
      expect(driver.load()).toBeNull();
      driver.titlePage();
      expect(root.querySelector('.page-body [role="status"]')?.textContent).toBe(notice);
      expect(driver.startupError).toBe(notice);
      expect(root.textContent).not.toContain('earlier version');
    }
    driver.entry = 'file';
    driver.filePage();
    await choose(root, readFileSync('test/fixtures/rope-hf3-native.json'));
    expect(root.querySelector('[data-file-status]')?.textContent).toBe(
      'This file is from a different version of Rope. Keep the file and start a fresh season.',
    );
    await choose(root, '{');
    expect(root.querySelector('[data-file-status]')?.textContent).toBe(
      'This file could not be opened. Keep the file and start a fresh season.',
    );
    expect(root.querySelector('[data-file-error]')?.textContent?.includes('SyntaxError:') ?? false).toBe(
      query === '?lab=1',
    );
  }
});

it('refuses the preserved HF3 file without replacing the native season', async () => {
  const owner = 'original native season';
  localStorage.setItem('rope.save.cast.v1', owner);
  const { root, active } = await open();
  await choose(root, readFileSync('test/fixtures/rope-hf3-native.json'));
  expect(root.querySelector('[data-file-status]')?.textContent).toMatch(/older|unsupported|start|version/i);
  expect(active.originalFile).toBeNull();
  expect(localStorage.getItem('rope.save.cast.v1')).toBe(owner);
  expect(control.channels).toBe(0);
});

it.each([native, publicExport])(
  'refuses a 4.13 file with a start-fresh explanation and keeps native bytes',
  async (fixture) => {
    const owner = 'native season untouched by older file';
    localStorage.setItem('rope.save.cast.v1', owner);
    const packet = fixture();
    packet.engine = '4.13.0';
    const original = JSON.stringify(packet);
    const { root } = await open();
    await choose(root, original);
    expect(root.querySelector('[data-file-status]')?.textContent).toMatch(
      /keep.*file.*start a fresh season/i,
    );
    expect(localStorage.getItem('rope.save.cast.v1')).toBe(owner);
    expect(control.channels).toBe(0);
  },
);

it.each([native, publicExport])(
  'retains selected BOM bytes, exact current state and file ownership through download and reimport',
  async (fixture) => {
    const owner = 'owner season untouched';
    localStorage.setItem('rope.save.cast.v1', owner);
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify(fixture()))]);
    const { root, active } = await open();
    await choose(root, bytes);
    const first = active.runExport();
    expect(first.format).toBe('rope-file-session/2');
    expect(Buffer.from(first.original.text)).toEqual(bytes);
    expect(first.original.sha256).toBe(hash(bytes));
    expect(first.current.state).toBe(snapshot(active.climb));
    expect(first.native.ownership).toMatchObject({ fileOrigin: true, heads: [], sources: [], archives: [] });
    expect(localStorage.getItem('rope.save.cast.v1')).toBe(owner);
    expect(control.channels).toBe(0);
    active.sentAt = -Infinity;
    active.send({ t: 'lead', dir: 'up' });
    const continued = active.runExport();
    expect(continued.current.state).toBe(snapshot(active.climb));
    root.querySelector<HTMLButtonElement>('.menu-trigger')!.click();
    let download: Blob | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      download = blob as Blob;
      return 'blob:test';
    });
    root.querySelector<HTMLButtonElement>('[data-file-export]')!.click();
    const exported = await download!.text();
    expect(JSON.parse(exported)).toEqual(continued);
    await choose(root, exported);
    expect(active.runExport()).toEqual(continued);
    expect(localStorage.getItem('rope.save.cast.v1')).toBe(owner);
  },
);

it('retains a complete source archive pool once across original and current exports', async () => {
  // A real idle source Run and its actual projections; this is not a lived journey claim.
  const source = newSeason(19).climb;
  source.over = true; // Authored closed-at-hut opening; no journey is credited.
  for (const person of ['oskar', 'tamar']) queueInput(source, { t: 'release-person', to: person });
  for (let i = 0; i < 24 && (!source.hfReleased.oskar || !source.hfReleased.tamar); i++) step(source);
  expect(source.hfReleased.oskar && source.hfReleased.tamar).toBe(true);
  step(source); // Admit the agenda receipts before projecting the archive.
  const captured = await Promise.all(['oskar', 'tamar'].map((person) => climberTransfer(source, person)));
  expect(captured[0]!.raw).toBe(captured[1]!.raw);
  const sourceMeta = { game: 'rope', build: 'source-fixture', engine: ENGINE_VERSION, rules: 'rope-hf4-1' };
  const envelopes = await Promise.all(
    captured.map(async (item, index) => {
      const castId = castIdOf(['oskar', 'tamar'][index]!);
      return createPersona({
        format: 'hf-persona/1',
        castId,
        castRevision: canonicalCast(castId).revision,
        branchId: `source-${index}`,
        parentRevision: null,
        source: sourceMeta,
        transfer: item.transfer,
        limitations: item.limitations,
      });
    }),
  );
  const sha256 = hash(Buffer.from(captured[0]!.raw));
  const sources = envelopes.map((envelope) => ({
    revision: envelope.revision,
    source: envelope.source,
    envelope,
    archiveSha256: sha256,
  }));
  const archives = [{ sha256, raw: captured[0]!.raw }];
  const packet = native();
  packet.ownership.sources = sources;
  packet.ownership.archives = archives;
  const original = JSON.stringify(packet);
  const { root, active } = await open();
  await choose(root, original);
  const result = active.runExport();
  expect(JSON.parse(result.original.text).ownership).toMatchObject({ sources, archives });
  expect(result.native.ownership).toMatchObject({ fileOrigin: true, heads: [], sources, archives });
  expect(result.native.ownership.archives).toHaveLength(1);
  root.querySelector<HTMLButtonElement>('.menu-trigger')!.click();
  const baseline = JSON.stringify(active.runExport());
  for (const tamper of [
    (p: typeof packet) => {
      const archive = p.ownership.archives?.[0];
      if (!archive) throw new Error('Missing fixture archive');
      archive.raw += ' ';
    },
    (p: typeof packet) => {
      p.ownership.sources[0]!.source.build = 'forged';
    },
    (p: typeof packet) => {
      p.ownership.sources[0]!.envelope.transfer.portable = p.ownership.sources[1]!.envelope.transfer.portable;
    },
  ]) {
    const forged = structuredClone(packet);
    tamper(forged);
    await choose(root, JSON.stringify(forged));
    expect(root.querySelector('[data-file-error]')?.textContent).toMatch(
      /archive|provenance|person|invalid|match|receipt|revision/i,
    );
    expect(JSON.stringify(active.runExport())).toBe(baseline);
  }
});

it('rejects invalid UTF8 and a forged original digest without replacing the accepted file', async () => {
  const { root, active } = await open();
  await choose(root, JSON.stringify(native()));
  const before = JSON.stringify(active.runExport());
  root.querySelector<HTMLButtonElement>('.menu-trigger')!.click();
  await choose(root, Uint8Array.from([0x7b, 0xff, 0x7d]));
  expect(root.querySelector('[data-file-error]')?.textContent).toMatch(/UTF-?8|encoded data/i);
  expect(JSON.stringify(active.runExport())).toBe(before);
  const packet = JSON.parse(before);
  packet.original.sha256 = '0'.repeat(64);
  await choose(root, JSON.stringify(packet));
  expect(root.querySelector('[data-file-error]')?.textContent).toMatch(/digest|hash|match/i);
  expect(JSON.stringify(active.runExport())).toBe(before);
});

it('keeps recording off under DNT and leaves the native shelf untouched', async () => {
  vi.spyOn(navigator, 'doNotTrack', 'get').mockReturnValue('1');
  control.lab.dispose();
  control.lab = createLab({
    game: 'rope',
    preservation: 'preserve',
    build: { c: 'dnt-control' },
    captureErrors: false,
    sendFromLocalhost: true,
  });
  const { root } = await open();
  expect(control.lab.telemetryOn).toBe(false);
  expect(root.querySelector<HTMLInputElement>('[data-recording] input[type="checkbox"]')?.checked).toBe(
    false,
  );
  await choose(root, JSON.stringify(native()));
  expect(control.lab.telemetryOn).toBe(false);
  expect(control.channels).toBe(0);
  const owner = localStorage.getItem('rope.save.cast.v1');
  root.querySelector<HTMLButtonElement>('.menu-trigger')!.click();
  const toggle = root.querySelector<HTMLInputElement>('[data-recording] input[type=checkbox]')!;
  toggle.click();
  expect(control.lab.telemetryOn).toBe(true);
  toggle.click();
  expect(control.lab.telemetryOn).toBe(false);
  expect(localStorage.getItem('rope.save.cast.v1')).toBe(owner);
  expect(control.channels).toBe(0);
});

it.each(['resume', 'journal', 'pagehide'])(
  '%s cancels a stale chooser without replacing the current run',
  async (action) => {
    const { root, active } = await open();
    await choose(root, JSON.stringify(native()));
    root.querySelector<HTMLButtonElement>('.menu-trigger')!.click();
    const bytes = Buffer.from(JSON.stringify(publicExport()));
    let finish!: (value: ArrayBuffer) => void;
    const delayed = new NodeFile([bytes], 'delayed.json');
    vi.spyOn(delayed, 'arrayBuffer').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const input = root.querySelector<HTMLInputElement>('[data-file-input]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [delayed] });
    input.dispatchEvent(new Event('change'));
    if (action === 'resume') root.querySelector<HTMLButtonElement>('[data-file-resume]')!.click();
    else if (action === 'journal') root.querySelector<HTMLButtonElement>('.journal-trigger')!.click();
    else window.dispatchEvent(new Event('pagehide'));
    const before = JSON.stringify(active.runExport());
    finish(Uint8Array.from(bytes).buffer);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(JSON.stringify(active.runExport())).toBe(before);
  },
);

it('refuses excessive depth and oversized selected files without replacing the accepted file', async () => {
  const { root, active } = await open();
  await choose(root, JSON.stringify(native()));
  const before = JSON.stringify(active.runExport());
  root.querySelector<HTMLButtonElement>('.menu-trigger')!.click();
  await choose(root, '['.repeat(140) + '0' + ']'.repeat(140));
  expect(root.querySelector('[data-file-error]')?.textContent).toMatch(/limit|large|depth/i);
  expect(JSON.stringify(active.runExport())).toBe(before);
  const input = root.querySelector<HTMLInputElement>('[data-file-input]')!;
  const file = new NodeFile(['{}'], 'oversize.json');
  Object.defineProperty(file, 'size', { value: 513 * 1024 * 1024 });
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(root.querySelector('[data-file-error]')?.textContent).toMatch(/large/i));
  expect(JSON.stringify(active.runExport())).toBe(before);
});

it.each([false, true])(
  'native Resume validates the complete current state (mismatch: %s)',
  async (mismatch) => {
    vi.stubGlobal('indexedDB', undefined);
    history.replaceState(null, '', '/');
    const packet = native();
    // This synthetic checkpoint has no owned histories; it is explicitly local-only.
    packet.ownership.localOnly = true;
    if (mismatch) packet.minute++;
    const saved = JSON.stringify(packet);
    localStorage.setItem('rope.save.cast.v1', saved);
    const root = document.createElement('main');
    document.body.append(root);
    const game = new Game(root);
    games.push(game);
    await game.boot();
    root.querySelector<HTMLButtonElement>('[data-a="continue"]')!.click();
    if (mismatch) {
      await vi.waitFor(() => expect(root.textContent).toMatch(/could not resume/i));
      expect(localStorage.getItem('rope.save.cast.v1')).toBe(saved);
    } else {
      await vi.waitFor(() => expect((game as unknown as Driver).climb).toBeTruthy());
      expect(snapshot((game as unknown as Driver).climb)).toBe(packet.state);
    }
  },
);

it('keeps chooser targets at least 44px in the authored stylesheet', () => {
  const css = readFileSync('src/ui/style.css', 'utf8');
  for (const selector of [
    '[data-file-label]',
    '[data-file-input]',
    '[data-file-input]::file-selector-button',
  ]) {
    const block = css.slice(css.indexOf(`.file-controls ${selector} {`)).split('}')[0];
    expect(block).toMatch(/min-height:\s*44px/);
  }
});

it.each([{ length: 0, unexpected: true }, 0, true, null])(
  'rejects malformed public skip metadata %j before replacing a file',
  async (castSkipped) => {
    const owner = 'native bytes before malformed skip metadata';
    localStorage.setItem('rope.save.cast.v1', owner);
    const { root, active } = await open();
    await choose(root, JSON.stringify(publicExport()));
    const before = JSON.stringify(active.runExport());
    root.querySelector<HTMLButtonElement>('.menu-trigger')!.click();
    await choose(root, JSON.stringify({ ...publicExport(), castSkipped }));
    expect(root.querySelector('[data-file-error]')?.textContent).toMatch(/skip|history|histories/i);
    expect(JSON.stringify(active.runExport())).toBe(before);
    expect(localStorage.getItem('rope.save.cast.v1')).toBe(owner);
  },
);

it('rejects a public skipped ID overlapping a retained chapter claim before replacing the active file', async () => {
  const { openingParty } = await import('../src/sim/season.ts');
  const { DIALECT } = await import('../src/sim/passport.ts');
  const castId = 'hf.cast.tamar.rope';
  const claim = await createPersona({
    format: 'hf-persona/1',
    castId,
    castRevision: '1',
    branchId: 'overlap-control',
    parentRevision: null,
    source: { game: 'rope', engine: ENGINE_VERSION, build: 'synthetic', rules: 'rope-hf4-1' },
    transfer: {
      castPassport: 'rope-hf4-active/1',
      hostRun: 'overlap-control',
      portableClaim: { game: 'rope' },
    },
    limitations: [],
  });
  const { season, climb } = newSeason(7, {
    version: DIALECT,
    initial: Object.fromEntries(openingParty(7).map((p) => [p.id, p])),
    inputs: [],
    claims: [claim],
  });
  const packet = {
    ...exportClimb(season.start!, climb, ENGINE_VERSION, season.chapter, season.past),
    castSources: [],
    castArchives: [],
    castSkipped: [{ castId, reason: 'Tamar: a separate local story.' }],
  };
  const owner = 'native bytes before overlap';
  localStorage.setItem('rope.save.cast.v1', owner);
  const { root, active } = await open();
  await choose(root, JSON.stringify(publicExport()));
  const before = JSON.stringify(active.runExport());
  root.querySelector<HTMLButtonElement>('.menu-trigger')!.click();
  await choose(root, JSON.stringify(packet));
  expect(root.querySelector('[data-file-error]')?.textContent).toMatch(/skip|histories/i);
  expect(JSON.stringify(active.runExport())).toBe(before);
  expect(localStorage.getItem('rope.save.cast.v1')).toBe(owner);
});

it.each([false, true])(
  'resumes a real fresh empty-shelf/local-only native run and continues exactly (localOnly:%s)',
  async (localOnly) => {
    const { acceptPersonaBatch } = await import('@adam0white/lab-client');
    const { Continuity } = await import('../src/ui/continuity.ts');
    const { replayExport } = await import('../src/sim/season.ts');
    const requests: string[] = [];
    let shelfState: import('@adam0white/lab-client').PersonaShelfState = { heads: {}, revisions: [] };
    const shelf = {
      enabled: true,
      ready: Promise.resolve(true),
      setEnabled() {},
      async request<T>(q: import('@adam0white/lab-client').PersonaRequest): Promise<T> {
        requests.push(q.action);
        if (q.action === 'get') return null as T;
        if (q.action === 'putBatch') {
          shelfState = acceptPersonaBatch(shelfState, q.envelopes ?? [], q.expectedHeads);
          return null as T;
        }
        throw Error(`Unexpected request ${q.action}`);
      },
    };
    const continuity = new Continuity(control.lab, shelf);
    const state = await continuity.fresh(7, localOnly);
    const ownership = continuity.ownership();
    expect(ownership.fileOrigin).toBe(false);
    expect(ownership.localOnly).toBe(localOnly);
    expect(ownership.skipped ?? []).toEqual([]);
    expect(ownership.heads).toHaveLength(localOnly ? 0 : 5);
    expect(shelfState.revisions).toHaveLength(localOnly ? 0 : 5);
    const packet = {
      v: 2,
      engine: ENGINE_VERSION,
      season: state.season,
      start: state.season.start!,
      inputs: state.climb.inputs,
      minute: state.climb.minute,
      disclosure: newDisclosure(),
      over: state.climb.over,
      state: snapshot(state.climb),
      ownership,
    };
    vi.stubGlobal('indexedDB', undefined);
    history.replaceState(null, '', '/');
    localStorage.setItem('rope.save.cast.v1', JSON.stringify(packet));
    const root = document.createElement('main');
    document.body.append(root);
    const game = new Game(root);
    games.push(game);
    await game.boot();
    root.querySelector<HTMLButtonElement>('[data-a="continue"]')!.click();
    await vi.waitFor(() => expect((game as unknown as Driver).climb).toBeTruthy());
    const active = game as unknown as Driver;
    active.sentAt = -Infinity;
    active.send({ t: 'lead', dir: 'up' });
    for (let i = 0; i < 3; i++) step(active.climb);
    const exported = (game as unknown as { runExport(): ReturnType<typeof exportClimb> }).runExport();
    expect(snapshot(replayExport(exported))).toBe(snapshot(active.climb));
    const restored = (game as unknown as { continuity: InstanceType<typeof Continuity> }).continuity;
    const before = JSON.stringify(restored.ownership());
    if (localOnly) {
      for (const fork of [false, true])
        await expect(restored.checkpoint('hf.cast.tamar.rope', fork)).rejects.toThrow(
          /does not change.*saved history/i,
        );
      expect(JSON.stringify(restored.ownership())).toBe(before);
      expect(requests).toEqual([]);
    }
  },
);

it.each(['deleted', 'null'])(
  'refuses %s ownership from a current skipped native run before recording/save/activation',
  async (missing) => {
    const sdk = await import('@adam0white/lab-client');
    const { Continuity } = await import('../src/ui/continuity.ts');
    const castId = 'hf.cast.tamar.rope';
    const head = await createPersona({
      format: 'hf-persona/1',
      castId,
      castRevision: '1',
      branchId: 'missing-owner-fixture',
      parentRevision: null,
      source: { game: 'rope', engine: ENGINE_VERSION, build: 'synthetic', rules: 'rope-hf4-1' },
      transfer: { castPassport: 'hf-portable-person/99', portable: { version: 99 } },
      limitations: [],
    });
    let shelfState = sdk.acceptPersona({ heads: {}, revisions: [] }, head);
    const shelf = {
      enabled: true,
      ready: Promise.resolve(true),
      setEnabled() {},
      async request<T>(q: import('@adam0white/lab-client').PersonaRequest): Promise<T> {
        if (q.action === 'get')
          return (shelfState.revisions.find((p) => p.revision === shelfState.heads[q.castId ?? '']) ??
            null) as T;
        if (q.action === 'putBatch') {
          shelfState = sdk.acceptPersonaBatch(shelfState, q.envelopes ?? [], q.expectedHeads);
          return null as T;
        }
        throw Error(q.action);
      },
    };
    const source = new Continuity(control.lab, shelf);
    const state = await source.fresh(7);
    expect(source.skipped).toHaveLength(1);
    const packet = {
      v: 2,
      engine: ENGINE_VERSION,
      season: state.season,
      start: state.season.start!,
      state: snapshot(state.climb),
      inputs: state.climb.inputs,
      minute: state.climb.minute,
      disclosure: newDisclosure(),
      over: state.climb.over,
      ...(missing === 'null' ? { ownership: null } : {}),
    };
    const bytes = JSON.stringify(packet);
    vi.stubGlobal('indexedDB', undefined);
    history.replaceState(null, '', '/');
    localStorage.setItem('rope.save.cast.v1', bytes);
    const root = document.createElement('main');
    document.body.append(root);
    const game = new Game(root);
    games.push(game);
    await game.boot();
    const recording = vi.spyOn(control.lab, 'setPersonaRecording');
    const allow = vi.spyOn(control.lab, 'allowPersonaRecording');
    const capture = vi.spyOn(control.lab, 'captureSave');
    root.querySelector<HTMLButtonElement>('[data-a="continue"]')!.click();
    await vi.waitFor(() => expect(root.textContent).toMatch(/could not resume/i));
    const receiver = (game as unknown as { continuity: InstanceType<typeof Continuity> }).continuity;
    expect((game as unknown as Driver).climb).toBeFalsy();
    expect(receiver.heads).toEqual([]);
    expect(receiver.sources).toEqual([]);
    expect(receiver.generation).toBe(0);
    expect(recording).not.toHaveBeenCalled();
    expect(allow).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    expect(localStorage.getItem('rope.save.cast.v1')).toBe(bytes);
  },
);
it('keeps missing-authority save bytes and directs resume to a new game', async () => {
  vi.stubGlobal('indexedDB', undefined);
  history.replaceState(null, '', '/');
  const packet = native();
  const saved = JSON.stringify(packet);
  localStorage.setItem('rope.save.cast.v1', saved);
  const root = document.createElement('main');
  document.body.append(root);
  const game = new Game(root);
  games.push(game);
  await game.boot();
  root.querySelector<HTMLButtonElement>('[data-a="continue"]')!.click();
  await vi.waitFor(() => expect(root.textContent).toContain('Start a new game'));
  expect(root.textContent).not.toContain('try again');
  expect(localStorage.getItem('rope.save.cast.v1')).toBe(saved);
});

it.each(['inner HF archive', 'replay mismatch', 'transient failure'] as const)(
  'preserves native bytes and distinguishes %s during Resume',
  async (failure) => {
    vi.stubGlobal('indexedDB', undefined);
    history.replaceState(null, '', '/');
    const packet = native();
    const state = JSON.parse(packet.state);
    if (failure === 'inner HF archive') state.hf.engine.package = '@adam0white/human-framework@99.0.0';
    if (failure === 'replay mismatch') state.minute++;
    packet.state = JSON.stringify(state);
    const saved = JSON.stringify(packet);
    localStorage.setItem('rope.save.cast.v1', saved);
    const root = document.createElement('main');
    document.body.append(root);
    const game = new Game(root);
    games.push(game);
    await game.boot();
    const receiver = (game as unknown as { continuity: import('../src/ui/continuity.ts').Continuity })
      .continuity;
    // TEST ONLY: a transport failure must not be described as incompatible saved data.
    if (failure === 'transient failure')
      vi.spyOn(receiver, 'restoreOwnership').mockRejectedValue(new Error('Temporary storage failure'));
    const recording = vi.spyOn(control.lab, 'setPersonaRecording');
    const allow = vi.spyOn(control.lab, 'allowPersonaRecording');
    const capture = vi.spyOn(control.lab, 'captureSave');
    root.querySelector<HTMLButtonElement>('[data-a="continue"]')!.click();
    await vi.waitFor(() => expect(root.textContent).toContain('The game could not resume'));
    if (failure === 'transient failure') {
      expect(root.textContent).toContain('try again');
      expect(root.textContent).not.toContain('Start a new game');
    } else {
      expect(root.textContent).toContain('Start a new game');
      expect(root.textContent).not.toContain('try again');
    }
    expect((game as unknown as Driver).climb).toBeFalsy();
    expect(receiver.heads).toEqual([]);
    expect(receiver.sources).toEqual([]);
    expect(recording).not.toHaveBeenCalled();
    expect(allow).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    expect(localStorage.getItem('rope.save.cast.v1')).toBe(saved);
  },
);
