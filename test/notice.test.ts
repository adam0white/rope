// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { Game } from '../src/ui/game.ts';

vi.mock('../src/ui/scene.ts', () => ({
  Scene: class {
    mount = async () => {};
  },
}));
vi.mock('@adam0white/lab-client', async (original) => ({
  ...(await original<typeof import('@adam0white/lab-client')>()),
  personaChannel: () => ({ ready: Promise.resolve(true), enabled: false, setEnabled() {}, request: vi.fn() }),
  watchPersonaCheckpoint: () => () => {},
}));
vi.mock('../src/ui/lab.ts', () => ({
  lab: {
    screen() {},
    trackRun() {
      return () => {};
    },
    telemetryOn: false,
    setTelemetryOff() {},
  },
}));
afterEach(() => vi.unstubAllGlobals());

it('mounts the actual non-null SDK notice once and retains its parent through page changes', async () => {
  vi.stubGlobal('requestAnimationFrame', () => 0);
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  const game = new Game(document.querySelector<HTMLElement>('#app') as HTMLElement);
  await game.boot();
  const footer = document.querySelector('.recording-footer');
  const notice = document.querySelector('.lk-telemetry-notice');
  expect(notice).not.toBeNull();
  expect(notice?.parentElement).toBe(footer);
  document.querySelector<HTMLButtonElement>('.menu-trigger')?.click();
  document.querySelector<HTMLButtonElement>('[data-menu-send]')?.click();
  expect(document.querySelector('.lk-telemetry-notice')).toBe(notice);
  expect(document.querySelector('.recording-footer')).toBe(footer);
  // The asynchronous SDK suppressor removes this exact node. It must not leave a clone.
  notice?.remove();
  expect(document.querySelectorAll('.lk-telemetry-notice')).toHaveLength(0);
  expect(document.querySelector('.recording-footer')).toBe(footer);
});
