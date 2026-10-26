// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { DisplaySession } from '../src/ui/display.ts';

afterEach(() => vi.restoreAllMocks());

it('requests one wake lock across repeated starts and never forces desktop fullscreen', async () => {
  const request = vi.fn(async () => ({ release: vi.fn(), addEventListener: vi.fn() }));
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
  const fullscreen = vi.fn(async () => {});
  Object.defineProperty(document.documentElement, 'requestFullscreen', {
    configurable: true,
    value: fullscreen,
  });
  const session = new DisplaySession();
  session.start();
  session.start();
  await Promise.resolve();
  expect(request).toHaveBeenCalledTimes(1);
  expect(fullscreen).not.toHaveBeenCalled();
});

it('releases a pending lock on disposal and never reacquires on visibility', async () => {
  let finish!: (lock: WakeLockSentinel) => void;
  const request = vi.fn(
    () =>
      new Promise<WakeLockSentinel>((resolve) => {
        finish = resolve;
      }),
  );
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
  const session = new DisplaySession();
  session.start();
  session.destroy();
  const release = vi.fn(async () => {});
  finish({ release, addEventListener: vi.fn() } as unknown as WakeLockSentinel);
  await Promise.resolve();
  document.dispatchEvent(new Event('visibilitychange'));
  session.start();
  expect(release).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledTimes(1);
});
