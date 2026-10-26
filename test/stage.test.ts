// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { RopeStage } from '../src/ui/stage.ts';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});
it('measures the real scene, reports the host sheet, and leaves navigation and focus with the host', () => {
  document.body.innerHTML =
    '<main><div class="scene"></div><div class="sheet"><button>Back</button></div><div class="leader-bar"></div></main>';
  const root = document.querySelector('main')!;
  const scene = root.querySelector<HTMLElement>('.scene')!;
  let bounds = { x: 0, y: 62, width: 360, height: 318 };
  vi.spyOn(scene, 'getBoundingClientRect').mockImplementation(() => bounds as DOMRect);
  const resize = vi.fn();
  const push = vi.spyOn(history, 'pushState');
  const back = vi.spyOn(history, 'back');
  const button = root.querySelector('button')!;
  button.focus();
  const stage = new RopeStage(root, resize);
  stage.show('more');
  expect(resize).toHaveBeenLastCalledWith(360, 318);
  expect(root.dataset.sheetId).toBe('more');
  expect(root.dataset.sheet).toBe('fit');
  expect(document.activeElement).toBe(button);
  root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  window.dispatchEvent(new PopStateEvent('popstate'));
  expect(root.dataset.sheetId).toBe('more');
  expect(push).not.toHaveBeenCalled();
  expect(back).not.toHaveBeenCalled();
  bounds = { x: 0, y: 62, width: 1280, height: 420 };
  window.dispatchEvent(new Event('resize'));
  expect(resize).toHaveBeenLastCalledWith(1280, 420);
  stage.destroy();
  resize.mockClear();
  window.dispatchEvent(new Event('resize'));
  expect(resize).not.toHaveBeenCalled();
  expect(root.dataset.sheetId).toBeUndefined();
});
