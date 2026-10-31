import { expect, it } from 'vitest';
import { type ClimbState, MOUNTAINS, startClimb } from '../src/sim/climb.ts';
import { eventStamp, playbackRate, skipEventStamp } from '../src/ui/playback.ts';

const copy = (c: ClimbState): ClimbState => structuredClone(c);

it('skip ignores ambient words while the ordinary event stamp still observes them', () => {
  const c = startClimb(41, 3);
  const before = skipEventStamp(c);
  const ordinary = eventStamp(c);
  c.lines.push({
    at: c.minute,
    who: 'nell',
    input: -1,
    verdict: 'heard',
    reason: '',
    says: 'The light is changing.',
  });
  c.journal.push({ at: c.minute, who: 'nell', text: 'Nell watched the changing light.' });
  expect(skipEventStamp(c)).toBe(before);
  expect(eventStamp(c)).not.toBe(ordinary);
});

it('skip stops for a recorded reply, a slip, a turn, an arrival or a pending company call', () => {
  const c = startClimb(41, 3);
  const before = skipEventStamp(c);
  const reply = copy(c);
  reply.lines.push({
    at: c.minute,
    who: 'nell',
    input: 0,
    verdict: 'refused',
    reason: 'tired',
    says: 'Not yet.',
  });
  const slip = copy(c);
  slip.journal.push({ at: c.minute, who: 'nell', text: 'Nell slipped on the ice wall.' });
  const injury = copy(c);
  injury.members[0]?.injuries.push({ at: c.minute, severity: 0.4, leg: 'meadow', caught: false });
  const turn = copy(c);
  const arrival = copy(c);
  const call = copy(c);
  const summit = copy(c);
  const turner = turn.members[0];
  const home = arrival.members[0];
  const caller = call.members[0];
  const climber = summit.members[0];
  if (!turner || !home || !caller || !climber) throw new Error('Missing member');
  turner.turnedAt = c.minute;
  home.homeAt = c.minute;
  caller.asks = { at: c.minute };
  climber.summitAt = c.minute;
  for (const changed of [reply, slip, injury, turn, arrival, call, summit]) {
    expect(skipEventStamp(changed)).not.toBe(before);
  }
});

it('skip observes the promised hour and dusk without treating every passing minute as an event', () => {
  const c = startClimb(41, 3);
  c.promise = { at: c.minute, hour: 12, hearers: c.members.map((member) => member.id), status: 'open' };
  c.minute = c.day * 1440 + 12 * 60 - 2;
  const before = skipEventStamp(c);
  c.minute++;
  expect(skipEventStamp(c)).toBe(before);
  c.minute++;
  expect(skipEventStamp(c)).not.toBe(before);
  c.promise = null;
  const mountain = MOUNTAINS[c.mountain];
  if (!mountain) throw new Error('Missing mountain');
  c.minute = c.day * 1440 + mountain.duskMinuteOfDay - 1;
  const daylight = skipEventStamp(c);
  c.minute++;
  expect(skipEventStamp(c)).not.toBe(daylight);
});

it('menu speed overrides retain attention and reading holds, and skip uses its own rate', () => {
  expect(playbackRate(false, false, false, false)).toBe(0.8);
  expect(playbackRate(false, false, false, false, 'slow')).toBe(0.15);
  expect(playbackRate(false, false, false, false, 'fast')).toBe(2.4);
  expect(playbackRate(false, false, true, true, 'fast')).toBe(0.25);
  expect(playbackRate(false, true, false, true, 'fast')).toBe(0.25); // reading slows, never stops or speeds up
  expect(playbackRate(true, false, false, true, 'fast')).toBe(0);
  expect(playbackRate(false, false, false, true, 'slow')).toBe(1200);
});
