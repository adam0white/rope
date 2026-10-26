// @vitest-environment happy-dom
import assert from 'node:assert/strict';
import { Blob as NodeBlob } from 'node:buffer';
import { gunzipSync } from 'node:zlib';
import { createLab, FEEDBACK_LABELS } from '@adam0white/lab-client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Game } from '../src/ui/game.ts';

const control = vi.hoisted(() => ({ lab: null as unknown as import('@adam0white/lab-client').Lab }));
vi.mock('../src/ui/lab.ts', () => ({
  get lab() {
    return control.lab;
  },
}));
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
const envelopes: Record<string, unknown>[] = [];
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('hf-lab-recording-off', '1');
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal(
    'Worker',
    class {
      postMessage() {}
    },
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      assert(init?.body && typeof init.body.arrayBuffer === 'function');
      envelopes.push(JSON.parse(gunzipSync(Buffer.from(await init.body.arrayBuffer())).toString()));
      return Response.json({ ok: true, id: 'r-control' });
    }),
  );
  envelopes.length = 0;
  control.lab = createLab({
    game: 'rope',
    build: { c: 'control' },
    endpoint: 'https://feedback.invalid',
    captureErrors: false,
  });
  document.body.innerHTML = '<div id="app"></div>';
});
afterEach(() => {
  control.lab.setTelemetryOff(true);
  vi.unstubAllGlobals();
});
async function open() {
  const root = document.querySelector<HTMLElement>('#app');
  assert(root);
  const game = new Game(root);
  await game.boot();
  (game as unknown as { feedbackPage(): void }).feedbackPage();
  const note = document.querySelector<HTMLTextAreaElement>('[data-feedback-note]');
  assert(note);
  return note;
}
function choose(label: string) {
  const b = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === label);
  assert(b);
  b.click();
}
test('shared quiet choices preserve edited notes, send nothing until Submit, and keep recording-off notes unlinked', async () => {
  const note = await open();
  choose(FEEDBACK_LABELS.stopping);
  expect(note.value).toBe(FEEDBACK_LABELS.stopping);
  choose(FEEDBACK_LABELS.stopping);
  expect(note.value).toBe('');
  choose(FEEDBACK_LABELS.stopping);
  expect(envelopes).toEqual([]);
  note.value = "I'm stopping because the route is unclear.\n\nKeep this detail.";
  choose(FEEDBACK_LABELS.confused);
  expect(note.value).toBe("I'm confused\n\nI'm stopping because the route is unclear.\n\nKeep this detail.");
  choose(FEEDBACK_LABELS.confused);
  expect(note.value).toBe("I'm stopping because the route is unclear.\n\nKeep this detail.");
  choose(FEEDBACK_LABELS.stopping);
  choose(FEEDBACK_LABELS.confused);
  expect(note.value).toBe("I'm confused\n\nI'm stopping because the route is unclear.\n\nKeep this detail.");
  expect(envelopes).toEqual([]);
  const consent = document.querySelector<HTMLInputElement>('[data-feedback-consent] input');
  assert(consent);
  expect(consent.checked).toBe(false);
  choose('Submit');
  await vi.waitFor(() =>
    expect(document.querySelector('[data-feedback-status]')?.textContent).toBe('Sent. Your note is stored.'),
  );
  expect(envelopes).toHaveLength(1);
  expect(envelopes[0]?.note).toBe(note.value);
  expect(envelopes[0]?.run).toEqual({ feedbackOnly: true });
  expect(envelopes[0]?.player).toBeUndefined();
  expect(control.lab.telemetryOn).toBe(false);
  const receipt = await control.lab.sendFeedback('Optional run control', {
    run: { privateControl: 'must stay local' },
  });
  expect(receipt).toBe('r-control');
  expect(envelopes).toHaveLength(2);
  expect(envelopes[1]?.run).toEqual({ feedbackOnly: true });
  expect(envelopes[1]?.player).toBeUndefined();
  expect(document.querySelector('a[href="https://human.adamwhite.work/lab/privacy/"]')).toBeTruthy();
});
