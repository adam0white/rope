import { expect, it } from 'vitest';
import { displayText } from '../src/ui/plain-english.ts';

it('keeps the display projection limited to pinned HF promise labels', () => {
  expect(displayText('I promised: down before dark, as I told Mum.')).toBe(
    'I promised Mum I would be back before dark.',
  );
  expect(displayText('I promised: leave the tin on the top.')).toBe(
    'I promised to leave the tin on the summit.',
  );
  const line = 'At dusk Bilal stepped aside at the col to pray, then came back to the others.';
  expect(displayText(line)).toBe(line);
  expect(displayText('I can do it, but I’ll be spent for the descent.')).toBe(
    'I can do it, but I’ll be spent for the descent.',
  );
});

it('authors the ridge explanation and historical uncertainty at their sources', async () => {
  const { TOOTH } = await import('../src/sim/mountain.ts');
  const { DISCOVERIES } = await import('../src/sim/discoveries.ts');
  expect(TOOTH.beats.some((b) => b.text.includes('arête, a narrow rock ridge'))).toBe(true);
  expect(DISCOVERIES.tamar?.outcome).toContain(
    'She does not say whether her earlier account was corrected elsewhere.',
  );
});

it('camp fallback identifies the speaker without showing internal verdict and reason codes', async () => {
  const { campFallback } = await import('../src/sim/camp.ts');
  const [answer] = campFallback({
    mountain: 'Hollin Crag',
    people: [],
    answers: ['05:00 Wren (deferred, goal:summit): "Let me climb the hut path first."'],
    journal: [],
  });
  expect(answer).toBe('The journal records Wren’s answer: “Let me climb the hut path first.”');
});

it('covers all fifteen real voice variants for a deferred action', async () => {
  const { voiced } = await import('../src/sim/voice.ts');
  const expected: Record<string, string[]> = {
    tamar: [
      'I will consider it after I climb the hut path, but not before.',
      'I need to climb the hut path first. Then I will think about it.',
      'Let me climb the hut path properly first.',
    ],
    oskar: [
      'Let me climb the hut path first. We are so close.',
      'Let me climb the hut path first! Come on.',
      'Not yet. Let me climb the hut path first. Then I will do it.',
    ],
    nell: [
      'Can I just climb the hut path first? Then I will do it.',
      'Can I climb the hut path first? I would like to.',
      'Let me climb the hut path first, if that is all right.',
    ],
    bilal: [
      'Let me climb the hut path. Then I’ll listen.',
      'I will listen after I climb the hut path, my friend.',
      'Give me time to climb the hut path, then I’ll come.',
    ],
    wren: [
      'Let me climb the hut path first. I’m not stopping now.',
      'I will not do that until I climb the hut path.',
      'I’ll climb the hut path. Then ask me again.',
    ],
  };
  for (const [who, variants] of Object.entries(expected)) {
    const displayed = new Set<string>();
    for (let seed = 0; seed < 100; seed++)
      displayed.add(
        displayText(voiced(seed, who, 480, 'deferred', 'After I climb the hut path, then I will.')),
      );
    expect([...displayed].sort()).toEqual(variants.sort());
  }
});

it('authors unavailable replies and reluctant agreement directly in each voice', async () => {
  const { voiced } = await import('../src/sim/voice.ts');
  const unavailable = new Set<string>();
  const reluctant = new Set<string>();
  for (const who of ['tamar', 'oskar', 'nell', 'bilal', 'wren'])
    for (let seed = 0; seed < 100; seed++) {
      unavailable.add(voiced(seed, who, 480, 'refused', 'Not from here.', 'unavailable'));
      reluctant.add(voiced(seed, who, 480, 'complied', 'Fine.'));
    }
  expect([...unavailable].every((line) => /cannot|can’t|can (?:I|do)/.test(line))).toBe(true);
  expect(reluctant).toContain('I will do it if you insist, but I don’t like it.');
  expect(reluctant).toContain('I will do what you say, but I don’t agree.');
});
