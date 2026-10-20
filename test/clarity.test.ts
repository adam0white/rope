// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { type ClimbState, distance, type Line, MOUNTAINS, step } from '../src/sim/climb.ts';
import { newSeason } from '../src/sim/season.ts';
import { Game } from '../src/ui/game.ts';

vi.mock('../src/ui/scene.ts', () => ({
  Scene: class {
    at = new Map();
    mount = async () => {};
    draw = () => {};
  },
}));
vi.mock('../src/ui/lab.ts', () => ({ lab: { screen() {}, milestone() {} } }));

interface Driver {
  climb: ClimbState;
  resume(save: unknown): void;
  renderSheet(ifChanged?: boolean): void;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.spyOn(Date, 'now').mockReturnValue(20261018);
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const button = (text: string) => {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) =>
      b.textContent === text ||
      b.querySelector('span')?.textContent === text ||
      (b.classList.contains('chip') && b.textContent?.startsWith(text)),
  );
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
};

async function boot(all = false) {
  const game = new Game(document.querySelector('#app') as HTMLElement);
  await game.boot();
  if (all) {
    const { season, climb } = newSeason(20261018);
    (game as unknown as Driver).resume({
      season,
      start: season.start,
      inputs: [],
      minute: climb.minute,
      over: false,
      disclosure: { unlocked: ['insist', 'tell', 'promise', 'rope', 'fix', 'pack', 'share'], seen: [] },
    });
  }
  return game as unknown as Driver;
}

it('keeps mandatory opening story across title and hut below forty words, with context on request', async () => {
  await boot();
  const words = (title = false) => {
    const copy = document.querySelector('.page .inner')?.cloneNode(true) as HTMLElement;
    for (const el of copy.querySelectorAll('details, button, .footer, .caption, svg, h1')) el.remove();
    if (!title) copy.querySelector('.sub')?.remove();
    return (copy.textContent ?? '').trim().split(/\s+/).filter(Boolean).length;
  };
  const title = words(true);
  expect(document.querySelector('.page details')?.textContent).toContain('eleven summers');
  button('Begin the season').click();
  expect(title + words()).toBeLessThanOrEqual(40);
  expect(document.querySelector('.page details')?.textContent).toContain('Tamar checked');
  expect(document.querySelectorAll('[data-hour]')).toHaveLength(3);
});

it('gives every unavailable verb an adjacent readable reason and updates changed circumstances', async () => {
  const driver = await boot(true);
  for (const b of document.querySelectorAll<HTMLButtonElement>('.sheet .verb:disabled')) {
    const reason = document.getElementById(b.getAttribute('aria-describedby') ?? '');
    expect(reason?.textContent?.trim(), b.textContent ?? '').toBeTruthy();
    expect(reason?.parentElement).toBe(b.parentElement);
  }
  expect(button('go down').parentElement?.textContent).toContain('hut');
  button('Nell').click();
  expect(button('eat').disabled).toBe(false);
  const nell = driver.climb.members.find((x) => x.id === 'nell');
  if (!nell) throw new Error('Nell missing');
  nell.rations = 0;
  driver.renderSheet(true);
  expect(button('eat').disabled).toBe(true);
  expect(button('eat').parentElement?.textContent).toContain('food');
});

it('shows target, selected request and commit without repeating unrelated verb grids', async () => {
  await boot();
  button('Begin the season').click();
  button("We'll see").click();
  button('rest').click();
  expect(document.querySelector('.request-summary')?.textContent).toContain('rest');
  expect(document.querySelectorAll('.sheet .verbs')).toHaveLength(0);
  expect(document.querySelectorAll('.forces button')).toHaveLength(3);
  expect(document.querySelector('.target-hint')?.textContent).toContain('swipe');
  const insist = document.querySelector<HTMLButtonElement>('.forces button:disabled');
  expect(insist?.textContent).toContain('after a refusal');
  expect(document.querySelector('.force:not(:disabled)')?.classList.contains('task')).toBe(true);
  expect(document.querySelector('.chip[aria-pressed="true"]')?.classList.contains('task')).toBe(false);
});

it('retains actual HF refusal words by request and refreshes them after another answer', async () => {
  const driver = await boot();
  button('Begin the season').click();
  button("We'll see").click();
  vi.advanceTimersByTime(500);
  button('rest').click();
  document.querySelector<HTMLButtonElement>('.forces button')?.click();
  const refusals = driver.climb.lines.filter((l) => ['refused', 'deferred', 'modified'].includes(l.verdict));
  expect(refusals.length).toBeGreaterThan(0);
  const refusal = refusals[0] as Line;
  vi.advanceTimersByTime(8000);
  driver.renderSheet(true);
  expect(document.querySelector('.request-replies')?.textContent).toContain(refusal.says);
  button(refusal.who[0]?.toUpperCase() + refusal.who.slice(1)).click();
  button('rest').click();
  expect(document.querySelector('.request-replies')?.textContent).toContain(refusal.says);
  expect(document.querySelector<HTMLButtonElement>('.forces button:last-child')?.disabled).toBe(false);
  // Another real HF resolution replaces the earlier answer for this person/request.
  vi.advanceTimersByTime(500);
  document.querySelector<HTMLButtonElement>('.forces button:last-child')?.click();
  step(driver.climb);
  button('rest').click();
  const latest = driver.climb.lines.filter((l) => l.who === refusal.who).at(-1) as Line;
  expect(latest.says).not.toBe(refusal.says);
  expect(document.querySelector('.request-replies')?.textContent).toContain(latest.says);
  expect(document.querySelector('.request-replies')?.textContent).not.toContain(refusal.says);
  button('cancel').click();
  button('everyone').click();
  const stillDeclines = driver.climb.lines.filter((l) => l.who === 'wren').at(-1) as Line;
  expect(document.querySelector('.request-replies')?.textContent).toContain(stillDeclines.says);
  expect(document.querySelector('.request-replies')?.textContent).not.toContain(latest.says);
});

it('updates an open request when the target leaves earshot and when they return', async () => {
  const driver = await boot(true);
  button('Nell').click();
  button('rest').click();
  const nell = driver.climb.members.find((x) => x.id === 'nell');
  if (!nell) throw new Error('Nell missing');
  const near = { ...nell.pos };
  nell.pos = { place: MOUNTAINS[driver.climb.mountain]?.summit ?? null, leg: null, t: 0 };
  driver.renderSheet(true);
  expect([...document.querySelectorAll<HTMLButtonElement>('.forces button')].every((b) => b.disabled)).toBe(
    true,
  );
  expect(document.querySelector('.force-reason')?.textContent).toContain('Out of earshot');
  nell.pos = near;
  driver.renderSheet(true);
  expect([...document.querySelectorAll<HTMLButtonElement>('.forces button')].every((b) => !b.disabled)).toBe(
    true,
  );
  expect(document.querySelector('.force-reason')).toBeNull();
});

it('updates take-pack availability at the actual forty-metre boundary', async () => {
  const driver = await boot(true);
  button('Nell').click();
  const c = driver.climb;
  const nell = c.members.find((x) => x.id === 'nell');
  const leg = MOUNTAINS[c.mountain]?.legs[0];
  if (!nell || !leg) throw new Error('Missing trail fixture');
  const standAt = (metres: number) => {
    let low = 0;
    let high = 1;
    for (let i = 0; i < 40; i++) {
      const t = (low + high) / 2;
      c.leader.pos = { place: null, leg: leg.id, t };
      if (distance(c, nell.pos, c.leader.pos) < metres) low = t;
      else high = t;
    }
    driver.renderSheet(true);
  };
  standAt(39);
  expect(button('take pack').disabled).toBe(false);
  standAt(41);
  expect(button('take pack').disabled).toBe(true);
  expect(button('take pack').parentElement?.textContent).toContain('Walk to them first');
});
