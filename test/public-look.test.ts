import { expect, it } from 'vitest';
import { newSeason } from '../src/sim/season.ts';
import { newDisclosure, nextNote } from '../src/ui/disclosure.ts';
import { lookOf, moodWord } from '../src/ui/look.ts';

it('does not reveal private body or voice state in drawing or mood', () => {
  const { climb } = newSeason(7);
  const p = climb.people[0]!;
  const before = lookOf(p);
  const word = moodWord(p, 0);
  p.body.exertion = 1;
  p.body.pain = 1;
  p.body.health = 0.1;
  expect(lookOf(p)).toEqual(before);
  expect(moodWord(p, 0)).toBe(word);
  expect(word).toBe('');
});

it('teaches observable replies without claiming fatigue or sadness', () => {
  const { climb } = newSeason(7);
  const d = newDisclosure();
  d.seen.push('lead', 'ask', 'with');
  climb.lines.push({
    at: climb.minute,
    who: 'oskar',
    input: 0,
    verdict: 'assented',
    says: 'I will go.',
    reason: 'test',
  });
  const note = nextNote(d, climb);
  expect(note?.id).toBe('watch');
  expect(note?.text).not.toMatch(/tired|sad|bent back|short steps/i);
});

it('teaches pack help from a known empty ration ledger without inferring a condition', () => {
  const { climb } = newSeason(7);
  const oskar = climb.members.find((member) => member.id === 'oskar')!;
  oskar.rations = 0;
  const note = nextNote(
    { unlocked: ['insist', 'tell', 'promise', 'rope', 'fix'], seen: ['lead', 'ask', 'with', 'watch'] },
    climb,
  );
  expect(note?.id).toBe('pack');
  expect(note?.text).toContain('Oskar has no food left.');
  expect(note?.text).toContain('They can refuse.');
  expect(note?.text).not.toMatch(/tired|hungry|sad/i);
});
