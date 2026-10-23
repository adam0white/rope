// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';

const css = readFileSync('src/ui/style.css', 'utf8');

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

it('lets essential tutorial notes wrap fully instead of clipping their final instructions', () => {
  document.head.innerHTML = `<style>${css}</style>`;
  document.body.innerHTML =
    '<div class="note"><button aria-label="dismiss">×</button><span class="note-copy">Someone is flagging. Pick them, then open <strong>more actions</strong> to <strong>take their pack</strong> or <strong>share food</strong> from yours.</span></div>';
  const note = document.querySelector('.note') as HTMLElement;
  const copy = document.querySelector('.note-copy') as HTMLElement;
  // The browser receipts cover actual 360 px wrapping. These constraints guard
  // against restoring either independent source of lost tutorial text.
  expect(['', 'none']).toContain(getComputedStyle(note).maxHeight);
  expect(getComputedStyle(copy).getPropertyValue('-webkit-line-clamp')).toBe('');
  expect(getComputedStyle(copy).overflow).not.toBe('hidden');
});
