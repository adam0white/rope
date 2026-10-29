import { expect, it } from 'vitest';
import { memberState, queueInput, startClimb, step } from '../src/sim/climb.ts';
import { fieldNotice } from '../src/ui/field.ts';

function meeting() {
  const s = startClimb(1, 3);
  for (const x of [...s.members, s.leader]) x.pos = { place: null, leg: 'snow', t: 0.5 };
  for (const x of s.members) {
    x.path = ['meadow', 'moraine'];
    x.high = 'moraine';
    x.idleUntil = s.minute + 200;
  }
  queueInput(s, { t: 'field-rules', bladder: false });
  step(s);
  return s;
}

it('an assent without a completed meeting does not create a rope or report descent', () => {
  const s = meeting();
  memberState(s, 'oskar').asks = { at: s.minute };
  queueInput(s, { t: 'say', to: 'tamar', with: 'oskar', act: 'escort-reach', force: 'ask' });
  let tied = false;
  for (let i = 0; i < 20; i++) {
    step(s);
    tied ||= memberState(s, 'tamar').ropedTo !== null || memberState(s, 'oskar').ropedTo !== null;
  }
  expect(s.lines.filter((l) => l.input === 1).map((l) => l.verdict)).toEqual(['assented']);
  expect(tied).toBe(false);
  expect(s.journal.some((j) => j.text.includes('went down with Oskar'))).toBe(false);
  expect(memberState(s, 'tamar').ropedTo).toBeNull();
  expect(memberState(s, 'oskar').ropedTo).toBeNull();
});

it('a refused escort cannot be revived by a later ordinary gather', () => {
  const s = meeting();
  for (const x of [...s.members, s.leader]) x.pos = { place: 'col', leg: null, t: 0 };
  for (const x of s.members) x.path = ['meadow', 'moraine', 'snow'];
  queueInput(s, { t: 'say', to: 'oskar', with: 'wren', act: 'escort-reach', force: 'ask' });
  step(s);
  expect(s.lines.find((l) => l.input === 1)?.verdict).toBe('refused');
  queueInput(s, { t: 'say', to: 'oskar', with: 'wren', act: 'gather', force: 'ask' });
  for (let i = 0; i < 20; i++) step(s);
  expect(s.lines.filter((l) => l.input === 1).map((l) => l.verdict)).toEqual(['refused']);
  expect(memberState(s, 'oskar').escortMeeting).toBeUndefined();
});

it('uses the newer observed gully conditions and preserves newer direct observations', () => {
  for (const reportIsNewer of [true, false]) {
    const s = meeting();
    for (const x of [...s.members, s.leader]) x.pos = { place: 'summit', leg: null, t: 0 };
    s.known = ['gully-quiet'];
    s.fieldRules = {
      bladder: false,
      observations: { 'gully-quiet': { at: s.minute - (reportIsNewer ? 20 : 0), source: 'direct' } },
    };
    memberState(s, 'tamar').scoutReport = {
      leg: 'gully',
      at: s.minute - 10,
      words: 'stones were coming down',
      fact: 'gully-loose',
    };
    step(s);
    expect(s.known.includes('gully-loose')).toBe(reportIsNewer);
    expect(s.known.includes('gully-quiet')).toBe(!reportIsNewer);
  }
});

it('distinguishes the uncertain forecast from current wind and an elapsed window', () => {
  const s = meeting();
  s.known.push('storm');
  s.minute = s.day * 1440 + 10 * 60;
  const before = fieldNotice(s);
  s.weather.stormAt += 10;
  expect(fieldNotice(s)).toBe(before);
  expect(before).toContain('estimate');
  s.minute = s.day * 1440 + 13 * 60;
  expect(fieldNotice(s)).toContain('wind is strong now');
  s.minute = s.day * 1440 + 17 * 60 + 1;
  expect(fieldNotice(s)).toContain('forecast window has passed');
  expect(fieldNotice(s)).not.toContain('Cloud is building');
});

it('does not revive a refused escort proposal or issue a later descent', () => {
  const s = meeting();
  for (const x of [...s.members, s.leader]) x.pos = { place: 'col', leg: null, t: 0 };
  for (const x of s.members) x.path = ['meadow', 'moraine', 'snow'];
  queueInput(s, { t: 'say', to: 'oskar', with: 'wren', act: 'escort-reach', force: 'ask' });
  step(s);
  expect(s.lines.find((l) => l.input === 1)?.verdict).toBe('refused');
  for (let i = 0; i < 15; i++) step(s);
  expect(memberState(s, 'oskar').escortMeeting).toBeUndefined();
  expect(s.lines.filter((l) => l.input === 1 && l.verdict === 'assented')).toHaveLength(0);
});
