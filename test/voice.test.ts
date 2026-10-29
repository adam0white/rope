import { expect, it } from 'vitest';
import { queueInput, step } from '../src/sim/climb.ts';
import { archiveOf } from '../src/sim/hf4.ts';
import { newSeason } from '../src/sim/season.ts';
import { voiced } from '../src/sim/voice.ts';

for (const who of ['tamar', 'oskar', 'nell', 'bilal', 'wren']) {
  it(`${who} voices HF4 assent, compliance, refusal and the chosen act without engine wording`, () => {
    const say = (verdict: string, reason = 'need:rest', act = 'rest') =>
      voiced(7, who, 4621, verdict, 'I will climb. I need rest.', reason, act);
    expect(say('assented')).not.toContain('I will climb');
    expect(say('complied')).not.toEqual(say('assented'));
    expect(say('refused', 'distrust')).toContain('trust');
    expect(say('refused', 'distrust')).not.toContain('distrust');
    expect(say('deferred')).toMatch(/rest/);
    expect(say('deferred')).not.toContain('I will climb');
    expect(say('modified', 'need:water', 'drink')).toContain('drink');
    expect(say('modified', 'need:water', 'drink')).toMatch(/instead|rather/);
    expect(say('refused', 'unavailable')).toContain('here');
    expect(say('refused', 'new:unknown')).not.toContain('new:unknown');
  });
}
it('voices actual HF4 answers from their identities, including the deferred alternative', () => {
  const { climb } = newSeason(7);
  queueInput(climb, { t: 'say', to: 'all', act: 'rest', force: 'ask' });
  step(climb);
  expect(climb.lines).toHaveLength(5);
  expect(climb.lines.some((l) => l.verdict === 'assented')).toBe(true);
  expect(climb.lines.some((l) => l.verdict === 'deferred')).toBe(true);
  expect(climb.lines.find((l) => l.who === 'oskar')?.says).toContain('climb the hut path');
  for (const line of climb.lines) {
    expect(line.says).not.toMatch(/I will climb\.|need:|preference/);
    expect(line.says.length).toBeGreaterThan(5);
  }
});

it('uses each actual HF recorded choice and retains four distinct lines for every meaning', () => {
  const { climb } = newSeason(7);
  queueInput(climb, { t: 'say', to: 'all', act: 'rest', force: 'ask' });
  step(climb);
  const events = archiveOf(climb).current.events;
  for (const person of climb.people) {
    const event = events.findLast((e) => e.person === person.id && e.data.kind === 'suggestion-resolved');
    expect(event?.wording?.key).toBe('suggestion.resolved');
    expect(person.events.find((e) => e.id === event?.id)?.choiceIndex).toEqual(event?.wording?.index);
    const answer = climb.lines.find((l) => l.who === person.id)!;
    const resolution = event!.data;
    if (resolution.kind !== 'suggestion-resolved') throw Error('Missing resolution');
    expect(answer.says).toContain(
      voiced(
        7,
        person.id,
        climb.minute,
        resolution.resolution.verdict,
        '',
        resolution.resolution.reason,
        'climb',
        'climb the hut path',
        event!.wording!.index,
      ),
    );
  }
  for (const who of ['tamar', 'oskar', 'nell', 'bilal', 'wren']) {
    for (const [verdict, reason] of [
      ['deferred', ''],
      ['modified', ''],
      ['refused', ''],
      ['refused', 'unavailable'],
      ['assented', ''],
      ['complied', ''],
    ]) {
      const lines = Array.from({ length: 4 }, (_, index) =>
        voiced(7, who, 1, verdict!, '', reason, 'rest', 'rest', index),
      );
      expect(new Set(lines).size).toBe(4);
    }
  }
});
