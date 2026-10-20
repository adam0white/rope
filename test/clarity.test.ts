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

async function boot(all = false, seed = 20261018) {
  const game = new Game(document.querySelector('#app') as HTMLElement);
  await game.boot();
  if (all) {
    const { season, climb } = newSeason(seed);
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
  nell.pos = { place: null, leg: MOUNTAINS[driver.climb.mountain]?.legs[0]?.id ?? null, t: 0 };
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
  // Main feedback belongs to the last request; changing selection does not mix in old answers.
  expect(document.querySelector('.request-replies')?.textContent).not.toContain(stillDeclines.says);
  expect(document.querySelector('.request-replies')?.textContent).toContain(latest.says);
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

it('keeps eating available without carried rations at the hut, for one person or the group', async () => {
  const driver = await boot(true);
  const c = driver.climb;
  const m = MOUNTAINS[c.mountain];
  if (!m?.legs[0]) throw new Error('Missing mountain');
  const nell = c.members.find((x) => x.id === 'nell');
  if (!nell) throw new Error('Nell missing');
  for (const person of c.members) {
    person.rations = 0;
    person.pos = { place: null, leg: m.legs[0].id, t: 0 };
  }
  c.leader.rations = 0;
  button('Nell').click();
  expect(button('eat').disabled).toBe(true);
  expect(button('eat').parentElement?.textContent).toContain('hut');
  nell.pos = { place: m.hut, leg: null, t: 0 };
  driver.renderSheet(true);
  expect(button('eat').disabled).toBe(false);
  button('everyone').click();
  expect(button('eat').disabled).toBe(false);
  nell.pos = { place: null, leg: m.legs[0].id, t: 0 };
  driver.renderSheet(true);
  expect(button('eat').disabled).toBe(true);
});

it('retains both rope partners’ HF answers after bubble expiry and when the pair is reversed', async () => {
  const driver = await boot(true, 1);
  button('Nell').click();
  button('rope up').click();
  button('Oskar').click();
  vi.advanceTimersByTime(500);
  document.querySelector<HTMLButtonElement>('.forces button')?.click();
  const nell = driver.climb.lines.find((l) => l.who === 'nell') as Line;
  const oskar = driver.climb.lines.find((l) => l.who === 'oskar') as Line;
  expect(nell.verdict).toBe('assented');
  expect(oskar.verdict).toBe('deferred');
  vi.advanceTimersByTime(8500);
  driver.renderSheet(true);
  const replies = () => document.querySelector('.request-replies');
  expect(replies()?.querySelector('p')?.textContent).toContain(oskar.says);
  expect(replies()?.textContent).toContain(nell.says);
  button('rope up').click();
  button('Oskar').click();
  expect(replies()?.querySelector('p')?.textContent).toContain(oskar.says);
  expect(replies()?.textContent).toContain(nell.says);
  button('cancel').click();
  button('Oskar').click();
  button('rope up').click();
  button('Nell').click();
  expect(replies()?.querySelector('p')?.textContent).toContain(oskar.says);
  expect(replies()?.textContent).toContain(nell.says);
  // Another pair must not inherit the Nell/Oskar answer.
  button('cancel').click();
  button('rope up').click();
  button('Tamar').click();
  expect(replies()).toBeNull();
});

it('shows the saved climb, mountain and time beside Continue without advancing the save', async () => {
  const { season, climb } = newSeason(23);
  const saved = JSON.stringify({
    v: 1,
    season,
    start: '',
    inputs: [],
    minute: climb.minute + 13,
    over: false,
    disclosure: { unlocked: [], seen: [] },
  });
  localStorage.setItem('rope.save.v1', saved);
  await boot();
  expect(button('Continue the season')).toBeTruthy();
  expect(document.querySelector('.continue-summary')?.textContent).toContain('Climb 1 of 3');
  expect(document.querySelector('.continue-summary')?.textContent).toContain('Hollin');
  expect(document.querySelector('.continue-summary')?.textContent).toContain('05:13');
  expect(localStorage.getItem('rope.save.v1')).toBe(saved);
});

it('keeps extra abilities behind More actions and returns to the same person', async () => {
  await boot(true);
  button('Oskar').click();
  button('more actions').click();
  expect(document.querySelector('.sheet')?.classList.contains('sheet-more')).toBe(true);
  expect(button('rope up').closest('.secondary-action')).not.toBeNull();
  expect(button('scout').closest('.secondary-action')).not.toBeNull();
  button('cancel').click();
  expect(document.querySelector('.sheet')?.classList.contains('sheet-main')).toBe(true);
  expect(button('Oskar').getAttribute('aria-pressed')).toBe('true');
  expect(button('walk to Oskar').closest('.secondary-action')).toBeNull();
});
