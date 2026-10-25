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
