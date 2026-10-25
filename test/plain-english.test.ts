import { expect, it } from 'vitest';
import { displayText } from '../src/ui/plain-english.ts';

it('displays the observed remembered-climb refusal as complete sentences', () => {
  const memory =
    'I will not do it. I remember what happened last time: I could not complete this action: climb the hut path.';
  expect(displayText(`Wren refused your request. “${memory}”`)).toBe(
    'Wren refused your request. “I will not do it. Last time, I could not climb the hut path.”',
  );
  expect(memory).toContain('complete this action: climb the hut path');
  const unknown =
    'I remember what happened last time: I could not complete this action: climb an unknown route.';
  expect(displayText(unknown)).toBe(unknown);
});

it('keeps pinned HF records unchanged while displaying known promise and route labels', () => {
  expect(displayText('I promised: down before dark, as I told Mum.')).toBe(
    'I promised Mum I would be back before dark.',
  );
  expect(displayText('I promised: leave the tin on the top.')).toBe(
    'I promised to leave the tin on the summit.',
  );
  const line = 'At dusk Bilal stepped aside at the col to pray, then came back to the others.';
  expect(displayText(line)).toBe(
    'At dusk Bilal stepped aside at the low pass to pray, then came back to the others.',
  );
  expect(displayText('I can do it, but I’ll be spent for the descent.')).toBe(
    'I can do it, but I’ll be spent for the descent.',
  );
});

it('authors the plain ridge description and historical uncertainty at their sources', async () => {
  const { TOOTH } = await import('../src/sim/mountain.ts');
  const { DISCOVERIES } = await import('../src/sim/discoveries.ts');
  expect(TOOTH.beats.some((b) => b.text.includes('narrow east ridge'))).toBe(true);
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

it('uses clear route names without changing affordances or remembered HF labels', async () => {
  const { SEASON, routeName } = await import('../src/sim/mountain.ts');
  const { offersFor, personOf, startClimb } = await import('../src/sim/climb.ts');
  const before = SEASON.map((m) => ({
    places: m.places.map((p) => p.name),
    legs: m.legs.map((l) => l.name),
  }));
  const jargon = /moraine|\bcol\b|gully|screes|couloir|headwall|arête|gendarme|tarn|bergschrund|larch|notch/;
  for (const mountain of SEASON) {
    for (const route of [...mountain.places, ...mountain.legs]) {
      expect(routeName(route)).not.toMatch(jargon);
      expect(displayText(`I will climb ${route.name}.`)).toBe(`I will climb ${routeName(route)}.`);
    }
  }
  const s = startClimb(4, 3, undefined, 'tooth');
  const nell = s.members.find((m) => m.id === 'nell');
  if (!nell) throw new Error('missing Nell');
  nell.pos = { place: 'notch', leg: null, t: 0 };
  const stored = JSON.stringify(personOf(s, 'nell'));
  const offers = offersFor(s, 'nell');
  expect(offers.some((a) => a.label === 'climb the north couloir')).toBe(true);
  for (const offer of offers) displayText(offer.label);
  expect(JSON.stringify(personOf(s, 'nell'))).toBe(stored);
  expect(
    SEASON.map((m) => ({ places: m.places.map((p) => p.name), legs: m.legs.map((l) => l.name) })),
  ).toEqual(before);
});

it('keeps turn-place identities exact when journal prose uses reader-facing route names', async () => {
  const { startClimb } = await import('../src/sim/climb.ts');
  const { factsOf } = await import('../src/sim/debrief.ts');
  const s = startClimb(4, 3, undefined, 'kestrel');
  const bilal = s.members.find((m) => m.id === 'bilal');
  if (!bilal) throw new Error('missing Bilal');
  bilal.turnedAt = s.minute;
  s.journal.push({ at: s.minute, who: 'bilal', text: 'Bilal turned for home from the deep glacier crack.' });
  expect(factsOf(s).bilal?.turnedWhere).toBe('the bergschrund');
  expect(displayText('Bilal turned for home from the bergschrund.')).toBe(
    'Bilal turned for home from the deep glacier crack.',
  );
});

it.each(['tamar', 'oskar', 'nell', 'bilal', 'wren'])(
  'names %s alone in private-conversation refusals',
  async (id) => {
    const { queueInput, startClimb, step, personOf } = await import('../src/sim/climb.ts');
    const s = startClimb(13, 3);
    personOf(s, id).body.downed = { since: s.minute, reason: 'fall', until: s.minute + 60 };
    queueInput(s, { t: 'ask-life', to: id });
    step(s);
    const line = s.journal.find((j) => j.text.startsWith('You asked '));
    expect(line?.text).toContain(
      ['tamar', 'nell', 'wren'].includes(id)
        ? 'She did not discuss it this time.'
        : 'He did not discuss it this time.',
    );
    expect(line?.text).not.toContain('They');
  },
);

it('matches complete route labels without corrupting ordinary words or sentence capitals', () => {
  for (const text of [
    'I cannot continue in the cold.',
    'I can see the colour.',
    'the colonnade',
    'the tarnished tin',
    'the headwallaby',
    'another col',
  ])
    expect(displayText(text)).toBe(text);
  expect(displayText('The screes looked safe to walk on.')).toBe('The loose stones looked safe to walk on.');
  expect(displayText('I will climb the snow slope below the col.')).toBe(
    'I will climb the snow slope below the pass.',
  );
  expect(displayText('The moraine and the ice looked safe.')).toBe('The glacier rocks and ice looked safe.');
});
