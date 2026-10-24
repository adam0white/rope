import { expect, it } from 'vitest';
import { displayText } from '../src/ui/plain-english.ts';

it('clarifies every voiced deferral form without changing its action or person', () => {
  const pairs = [
    [
      'Once I’ve done Climb the hut path. Not before.',
      'I will consider it after I climb the hut path, but not before.',
    ],
    [
      'Climb the hut path first. Then I’ll think about it.',
      'I need to climb the hut path first. Then I will think about it.',
    ],
    ['Climb the hut path first, we’re so close.', 'Let me climb the hut path first. We are so close.'],
    ['After I climb the hut path! Come on.', 'Let me climb the hut path first! Come on.'],
    ['Um, after I climb the hut path? I’d like to.', 'Can I climb the hut path first? I would like to.'],
    [
      'After I climb the hut path, if that’s all right.',
      'Let me climb the hut path first, if that is all right.',
    ],
    ['After I climb the hut path, my friend.', 'I will listen after I climb the hut path, my friend.'],
    ['Not till I climb the hut path.', 'I will not do that until I climb the hut path.'],
  ];
  for (const [original, displayed] of pairs) {
    expect(displayText(original ?? '')).toBe(displayed);
    expect(displayText(`Tamar Vale: “${original}”`)).toBe(`Tamar Vale: “${displayed}”`);
  }
});

it('preserves names, faith, cultural words and uncertainty in displayed records', () => {
  const line = 'At dusk Bilal stepped aside at the col to pray, then came back to the others.';
  expect(displayText(line)).toBe(line);
  expect(displayText('Wren said Ezra had always said the arête was the honest way up.')).toContain(
    'arête, a narrow rock ridge',
  );
  expect(displayText('I can do it, but I’ll be spent for the descent.')).toBe(
    'I can do it, but I’ll be spent for the descent.',
  );
});

it('preserves uncertainty, promise content and plain camp records', () => {
  expect(displayText('No old account is claimed corrected elsewhere.')).toBe(
    'She does not say whether her earlier account was corrected elsewhere.',
  );
  expect(displayText('I promised: down before dark, as I told Mum.')).toBe(
    'I promised Mum I would be back before dark.',
  );
  expect(displayText('Bilal: stood on the top and was down by 16:20.')).toBe(
    'Bilal reached the summit and was back at the hut by 16:20.',
  );
  expect(
    displayText(
      'Someone remembered: Wren (deferred, goal:summit): "Not yet. Let me climb the hut path, then sure."',
    ),
  ).toBe('The journal records Wren’s answer: “Not yet. Let me climb the hut path first. Then I will do it.”');
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

it('keeps unavailable replies literal and reluctant agreement explicit', () => {
  expect(displayText('Not from here. Look where we are.')).toBe(
    'I cannot do that from here. Look where we are.',
  );
  expect(displayText('Not from here, friend.')).toBe('I cannot do that from here, friend.');
  expect(displayText('If you insist. I don’t like it.')).toBe(
    'I will do it if you insist, but I don’t like it.',
  );
  expect(displayText('As you say. But I don’t agree.')).toBe('I will do what you say, but I don’t agree.');
});
