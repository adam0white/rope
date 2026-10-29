import { expect, it } from 'vitest';
import { queueInput, step } from '../src/sim/climb.ts';
import { archiveOf } from '../src/sim/hf4.ts';
import { newSeason } from '../src/sim/season.ts';
import { VOICES } from '../src/sim/voice.ts';

it('uses HF public narration for each answer, including the recorded alternative label', () => {
  const { climb } = newSeason(7);
  queueInput(climb, { t: 'say', to: 'all', act: 'rest', force: 'ask' });
  step(climb);
  expect(climb.lines).toHaveLength(5);
  const events = archiveOf(climb).current.events;
  for (const person of climb.people) {
    const event = person.events.findLast((e) => e.data.kind === 'suggestion-resolved');
    expect(event).toBeDefined();
    const words = event!.narration.map((line) => line.text).join(' ');
    expect(climb.lines.find((line) => line.who === person.id)?.says).toContain(words);
    const recorded = events.find((e) => e.id === event!.id);
    if (!recorded || recorded.data.kind !== 'suggestion-resolved') throw Error('Missing recorded answer');
    const fragments = recorded.wording?.fragments ?? {};
    const table = VOICES[person.id] as Record<string, string[]>;
    const verdict = recorded.data.resolution;
    const verdictKey =
      verdict.verdict === 'refused' && verdict.kind === 'cannot'
        ? 'verdict.cannot'
        : `verdict.${verdict.verdict}`;
    const choice = fragments[verdictKey];
    expect(choice).toBeDefined();
    const predicate = table[verdictKey]![choice!];
    const label = verdict.counterOffer?.label ?? 'do something else';
    expect(words).toContain(predicate!.replace('{alternative}', label));
    for (const [key, index] of Object.entries(fragments)) {
      if (key.startsWith('reason.') && table[key]) expect(words).toContain(table[key][index]);
    }
  }
  expect(climb.lines.find((line) => line.who === 'oskar')?.says).toContain('climb the hut path');
  const voices = VOICES;
  for (const who of ['tamar', 'oskar', 'nell', 'bilal', 'wren']) {
    for (const key of [
      'verdict.assented',
      'verdict.complied',
      'verdict.deferred',
      'verdict.modified',
      'verdict.refused',
      'verdict.cannot',
    ]) {
      expect(new Set(voices[who]![key as keyof (typeof voices)[string]]).size).toBeGreaterThanOrEqual(4);
    }
  }
});
