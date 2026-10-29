// @vitest-environment happy-dom

import type { Lab } from '@adam0white/lab-client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ENGINE_VERSION } from '../src/sim/hf4.ts';
import { fileEntry } from '../src/ui/continuity.ts';

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

const control = vi.hoisted(() => ({ clients: [] as Lab[], options: [] as unknown[], status: '' }));
vi.mock('@adam0white/lab-client', async (original) => {
  const actual = await original<typeof import('@adam0white/lab-client')>();
  return {
    ...actual,
    createLab: (options: Parameters<typeof actual.createLab>[0]) => {
      control.options.push(options);
      const client = actual.createLab(options);
      if (control.status) Object.defineProperty(client, 'preservationStatus', { get: () => control.status });
      vi.spyOn(client, 'dispose');
      vi.spyOn(client, 'trackRun');
      control.clients.push(client);
      return client;
    },
  };
});
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ app: '0.1.0', framework: ENGINE_VERSION, commit: 'synthetic', dirty: true }),
          {
            status: 200,
          },
        ),
    ),
  );
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubEnv('PROD', true);
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('hf-lab-recording-off', '1');
  control.options = [];
  control.status = '';
  history.replaceState(null, '', '/file/');
});
afterEach(() => {
  (window as unknown as { game?: { destroy(): void } }).game?.destroy();
  delete (window as unknown as { game?: unknown }).game;
  document.body.innerHTML = '';
  for (const client of control.clients.splice(0)) client.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('selects preservation only from the protected path', () => {
  expect(fileEntry('/file/')).toBe('file');
  expect(fileEntry('/file')).toBe('file');
  expect(fileEntry('/')).toBe('native');
});

it('starts the real preserving client under OFF without changing existing native data', async () => {
  localStorage.setItem('hf-lab-player', 'a'.repeat(32));
  localStorage.setItem('rope.save.cast.v1', 'synthetic-native-sentinel');
  const before = { ...localStorage };
  const runtime = await import('../src/ui/lab.ts');
  expect(runtime.startupEntry).toBe('file');
  expect(control.options).toEqual([{ game: 'rope', preservation: 'preserve' }]);
  expect(runtime.lab?.preservationStatus).toBe('existing-local');
  expect(runtime.lab?.telemetryOn).toBe(false);
  expect(runtime.lab?.dispose).not.toHaveBeenCalled();
  expect({ ...localStorage }).toEqual(before);
});

it('redirects old file addresses to the protected path before creating the SDK client', async () => {
  const { legacyFileDestination, startAtAddress } = await import('../src/ui/file-route.ts');
  const redirect = vi.fn();
  const boot = vi.fn();
  startAtAddress(new URL('/?file=1', location.href).href, redirect, boot);
  expect(redirect).toHaveBeenCalledOnce();
  expect(boot).not.toHaveBeenCalled();
  for (const address of ['/?file=1', '/?file=0', '/?file=1&file=1']) {
    const destination = legacyFileDestination(new URL(address, location.href).href);
    if (!destination) throw new Error('Missing redirect');
    expect(new URL(destination).pathname).toBe('/file/');
    expect(new URL(destination).searchParams.has('file')).toBe(false);
  }
  expect(control.options).toEqual([]);
  expect(legacyFileDestination(new URL('/file/', location.href).href)).toBeNull();
});

it('redirects the actual entry document without loading the game or SDK', async () => {
  const replace = vi.fn();
  vi.stubGlobal('location', { href: 'https://rope.example/?file=1&other=kept#part', replace });
  await import('../src/main.ts');
  expect(replace).toHaveBeenCalledWith('https://rope.example/file/?other=kept#part');
  expect(control.options).toEqual([]);
  expect(document.querySelector('.menu-trigger')).toBeNull();
});

it('disposes real blocked clients before host tracking, including unknown future statuses', async () => {
  for (const status of ['missing-identity', 'incompatible-session', 'identity-mismatch', 'future-status']) {
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('hf-lab-recording-off', '1');
    if (status !== 'missing-identity') localStorage.setItem('hf-lab-player', 'a'.repeat(32));
    if (status === 'incompatible-session') sessionStorage.setItem('hf-lab-session:rope', 'invalid');
    if (status === 'identity-mismatch') localStorage.setItem('hf-lab-top-level-player', 'b'.repeat(32));
    control.status = status === 'future-status' ? status : '';
    const runtime = await import('../src/ui/lab.ts');
    expect(runtime.lab?.preservationStatus).toBe(status);
    expect(runtime.lab?.dispose).toHaveBeenCalledOnce();
    expect(runtime.lab?.trackRun).not.toHaveBeenCalled();
    expect(runtime.lab?.telemetryOn).toBe(false);
  }
});

it('boots the actual public App chooser without native storage or Shelf effects', async () => {
  localStorage.setItem('hf-lab-player', 'a'.repeat(32));
  localStorage.setItem('rope.save.cast.v1', 'synthetic-native-sentinel');
  const storage = Object.getPrototypeOf(localStorage) as Storage;
  const reads = vi.spyOn(storage, 'getItem');
  const writes = vi.spyOn(storage, 'setItem');
  const removes = vi.spyOn(storage, 'removeItem');
  const register = vi.fn();
  const originalSW = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register } });
  await import('../src/boot.ts');
  await vi.advanceTimersByTimeAsync(0);
  expect(document.body.textContent).toContain('Choose a Rope file');
  expect(document.querySelector('iframe')).toBeNull();
  expect(document.querySelector('.lk-telemetry-notice')).not.toBeNull();
  for (const sink of [reads, writes, removes]) {
    expect(
      sink.mock.calls.filter(([key]) => key === 'rope.save.cast.v1' || String(key).startsWith('hf-persona')),
    ).toEqual([]);
  }
  expect(control.clients.at(-1)?.trackRun).not.toHaveBeenCalled();
  window.dispatchEvent(new Event('load'));
  expect(register).not.toHaveBeenCalled();
  if (originalSW) Object.defineProperty(navigator, 'serviceWorker', originalSW);
  else delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
});

it('keeps ordinary native startup ordinary', async () => {
  history.replaceState(null, '', '/');
  const runtime = await import('../src/ui/lab.ts');
  expect(runtime.startupEntry).toBe('native');
  expect(control.options).toEqual([{ game: 'rope' }]);
  expect(runtime.lab?.preservationStatus).toBe('standard');
  expect(runtime.lab?.dispose).not.toHaveBeenCalled();
});
