import { expect, it } from 'vitest';
import { queueInput, step } from '../src/sim/climb.ts';
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
    expect(say('modified', 'need:water', 'drink')).toContain('instead');
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
  expect(climb.lines.find((l) => l.who === 'oskar')?.says).toContain('climb first');
  for (const line of climb.lines) {
    expect(line.says).not.toMatch(/I will climb\.|need:|preference/);
    expect(line.says.length).toBeGreaterThan(5);
  }
});
