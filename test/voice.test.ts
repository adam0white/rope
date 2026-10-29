import { expect, it } from 'vitest';
import { distance, earshot, MOUNTAINS, queueInput, startClimb, step } from '../src/sim/climb.ts';
import { archiveOf } from '../src/sim/hf4.ts';
import { newSeason } from '../src/sim/season.ts';

it('uses recorded public narration and names the recorded action alternative', () => {
  const { climb } = newSeason(7);
  queueInput(climb, { t: 'say', to: 'all', act: 'rest', force: 'ask' });
  step(climb);
  expect(climb.lines).toHaveLength(5);
  let alternatives = 0;
  for (const person of climb.people) {
    const event = person.events.findLast((e) => e.data.kind === 'suggestion-resolved');
    if (!event || event.data.kind !== 'suggestion-resolved') throw Error('Missing recorded answer');
    const words = event.narration.map((line) => line.text).join(' ');
    const spoken = climb.lines.find((line) => line.who === person.id)?.says;
    expect(spoken).toBeDefined();
    expect(spoken!.startsWith(words)).toBe(true);
    expect(words).not.toMatch(/[“”{}]/);
    const resolution = event.data.resolution;
    if (
      (resolution.verdict === 'modified' || resolution.verdict === 'deferred') &&
      resolution.insteadAffordanceId &&
      !resolution.commitmentId &&
      resolution.counterOffer?.label &&
      resolution.counterOffer.label !== 'later'
    ) {
      expect(words).toContain(resolution.counterOffer.label);
      alternatives++;
    }
  }
  expect(alternatives).toBeGreaterThan(0);
});

it('explains an unavailable pack request with the observed distance', () => {
  const climb = startClimb(1, 3);
  const mountain = MOUNTAINS[climb.mountain];
  if (!mountain) throw Error('Missing mountain');
  const leg = mountain.legs.find((candidate) => candidate.from === mountain.hut);
  if (!leg) throw Error('Missing hut path');
  const hut = { place: mountain.hut, leg: null, t: 0 };
  const end = { place: leg.to, leg: null, t: 0 };
  climb.leader.pos = { place: null, leg: leg.id, t: 80 / distance(climb, hut, end) };
  expect(distance(climb, hut, climb.leader.pos)).toBeGreaterThan(40);
  expect(distance(climb, hut, climb.leader.pos)).toBeLessThan(earshot(climb));
  queueInput(climb, { t: 'say', to: 'oskar', act: 'pack', force: 'ask' });
  step(climb);
  const answer = climb.lines.find((line) => line.who === 'oskar');
  expect(answer).toMatchObject({ reason: 'unavailable' });
  const event = archiveOf(climb).current.events.findLast((e) => e.data.kind === 'suggestion-resolved');
  expect(event?.data.kind).toBe('suggestion-resolved');
  if (!event || event.data.kind !== 'suggestion-resolved') throw Error('Missing recorded answer');
  expect(event.data.resolution).toMatchObject({ verdict: 'refused', kind: 'cannot' });
  const words = event.narration.map((line) => line.text).join(' ');
  expect(answer!.says).toBe(`${words} You are too far away to take my pack. Walk closer first.`);
  expect(answer!.says).not.toMatch(/option|[“”{}]/i);
});
