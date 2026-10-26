// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';

const css = readFileSync('src/ui/style.css', 'utf8');

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

it('keeps essential tutorial instructions reachable by wrapping or scrolling', () => {
  document.head.innerHTML = `<style>${css}</style>`;
  document.body.innerHTML =
    '<div class="note"><button aria-label="dismiss">×</button><span class="note-copy">Someone is flagging. Pick them, then open <strong>more actions</strong> to <strong>take their pack</strong> or <strong>share food</strong> from yours.</span></div>';
  const note = document.querySelector('.note') as HTMLElement;
  const copy = document.querySelector('.note-copy') as HTMLElement;
  // Browser receipts cover actual wrapping and access to both ends of the note.
  // A bounded container must scroll; the copy must never discard instructions.
  const noteStyle = getComputedStyle(note);
  if (!['', 'none'].includes(noteStyle.maxHeight)) {
    expect(['auto', 'scroll']).toContain(noteStyle.overflowY || noteStyle.overflow);
  }
  expect(getComputedStyle(copy).getPropertyValue('-webkit-line-clamp')).toBe('');
  expect(getComputedStyle(copy).overflow).not.toBe('hidden');
});

it('names the tired person when teaching pack help', async () => {
  const { startClimb } = await import('../src/sim/climb.ts');
  const { nextNote } = await import('../src/ui/disclosure.ts');
  const state = startClimb(4, 3, undefined, 'hollin', 2);
  const oskar = state.members.find((m) => m.id === 'oskar');
  if (!oskar) throw new Error('Missing Oskar');
  oskar.rations = 0;
  const note = nextNote(
    { unlocked: ['insist', 'tell', 'promise', 'rope', 'fix'], seen: ['intro', 'people', 'walk'] },
    state,
  );
  expect(note?.text).toContain('Oskar');
  expect(note?.text).not.toContain('Someone');
});

it('does not keep teaching a completed first request', async () => {
  const { startClimb, queueInput, step } = await import('../src/sim/climb.ts');
  const { nextNote } = await import('../src/ui/disclosure.ts');
  const s = startClimb(4, 3);
  queueInput(s, { t: 'say', act: 'rest', to: 'all', force: 'ask' });
  step(s);
  expect(nextNote({ unlocked: ['insist'], seen: ['lead'] }, s)?.id).not.toBe('ask');
});
