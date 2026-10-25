/**
 * The five people. Each is an HF person with traits, values, a summit goal and a voice relation to the leader (the
 * player, voice id `leader`). The game never decides for them: it only offers what the mountain affords.
 */
import { createPerson, type Person, type PersonSpec } from '@adam0white/human-framework';
import { castForGame } from '@adam0white/lab-client';
import { hashUnit } from './rng.ts';

export const LEADER = 'leader';
const YEAR = 525600;

export interface Member {
  id: string;
  name: string;
  /** One line the game uses to introduce them through a situation, in the narrator's voice. */
  first: string;
  /** She / he, for narration. */
  they: 'she' | 'he';
  /** Ink hue for their figure: a small tick mark, never a second loud color. */
  mark: number;
}

export const FAMILY: Record<string, string> = {
  tamar: 'Nell is her student, not her daughter.',
  oskar: 'He has a younger sister.',
  nell: 'Her mother stays in touch. Tamar Vale is her mentor.',
  bilal: 'He is married and has a stepchild. This climbing trip is a short visit away from his family.',
  wren: 'She has one older sibling. Her work and her climbing remain her own choices.',
};

export const MEMBERS: Member[] = [
  {
    id: 'tamar',
    name: 'Tamar Vale',
    they: 'she',
    mark: 0,
    first: 'Tamar Vale checked everyone’s boots by torchlight before she checked her own.',
  },
  {
    id: 'oskar',
    name: 'Oskar',
    they: 'he',
    mark: 1,
    first: 'Oskar was outside the hut at 04:30, already looking at the summit.',
  },
  {
    id: 'nell',
    name: 'Nell',
    they: 'she',
    mark: 2,
    first:
      'Nell had borrowed her crampons, spikes for walking on ice, and kept asking if she had put them on correctly.',
  },
  {
    id: 'bilal',
    name: 'Bilal',
    they: 'he',
    mark: 3,
    first: 'Bilal carried the stove nobody else wanted to carry, and the tea.',
  },
  {
    id: 'wren',
    name: 'Wren',
    they: 'she',
    mark: 4,
    first: 'Wren came because Oskar said she wouldn’t.',
  },
];

export const memberOf = (id: string): Member => {
  const m = MEMBERS.find((x) => x.id === id);
  if (!m) throw new Error(`no member ${id}`);
  return m;
};

const NAMES: Record<string, string> = Object.fromEntries([
  ...MEMBERS.map((m) => [m.id, m.name]),
  [LEADER, 'you'],
  ['nell-mother', 'Mum'],
]);

/** Standing on the top: valued by expected completion (HF 2.3 temporal goals), so time left matters. */
const summitGoal = (importance: number) => ({
  id: 'summit',
  label: 'stand on the top',
  serves: ['achievement' as const, 'competence' as const],
  advancedBy: [
    { action: 'summit', amount: 1 },
    { action: 'climb', amount: 0.15 },
  ],
  importance,
  temporal: { halfLifeMinutes: 240 },
});

function spec(seed: number, now: number, id: string): PersonSpec {
  const base = {
    id,
    name: memberOf(id).name,
    seed,
    now,
    lexicon: { names: NAMES, plainEnglish: true },
    // HF 2.6.0: exertion accumulates over the day, so a long climb leaves a person spent for the descent.
    enable: { fatigueStore: true },
  };
  const rel = (
    otherId: string,
    affection: number,
    trust: number,
    respect: number,
    roles: string[] = ['friend'],
  ) => ({
    otherId,
    affection,
    trust,
    respect,
    familiarity: 0.6,
    roles,
  });
  switch (id) {
    case 'tamar':
      return {
        ...base,
        bornAt: now - 52 * YEAR,
        sex: 'female',
        traits: {
          conscientiousness: 0.85,
          emotionality: 0.4,
          agreeableness: 0.6,
          openness: 0.5,
          honesty: 0.8,
        },
        values: { security: 0.8, benevolence: 0.75, achievement: 0.4, selfDirection: 0.55, stimulation: 0.3 },
        skills: { climbing: 0.8 },
        body: { fitness: 0.7 },
        goals: [summitGoal(0.4)],
        voices: [{ voiceId: LEADER, trust: 0.55 }],
        relationships: [rel('nell', 0.7, 0.6, 0.3, ['friend', 'mentor']), rel('bilal', 0.5, 0.75, 0.6)],
      };
    case 'oskar':
      return {
        ...base,
        bornAt: now - 34 * YEAR,
        sex: 'male',
        traits: { conscientiousness: 0.45, emotionality: 0.2, agreeableness: 0.4, extraversion: 0.75 },
        values: { achievement: 0.9, stimulation: 0.8, security: 0.3, power: 0.55, benevolence: 0.45 },
        skills: { climbing: 0.65 },
        body: { fitness: 0.85 },
        goals: [summitGoal(0.9)],
        voices: [{ voiceId: LEADER, trust: 0.6 }],
        relationships: [rel('wren', 0.3, 0.4, 0.5, ['rival']), rel('tamar', 0.3, 0.6, 0.7)],
      };
    case 'nell':
      return {
        ...base,
        bornAt: now - 23 * YEAR,
        sex: 'female',
        traits: { emotionality: 0.8, openness: 0.8, agreeableness: 0.7, conscientiousness: 0.5 },
        values: { stimulation: 0.65, benevolence: 0.6, security: 0.55, achievement: 0.6, conformity: 0.5 },
        skills: { climbing: 0.3 },
        body: { fitness: 0.6 },
        goals: [summitGoal(0.6)],
        voices: [{ voiceId: LEADER, trust: 0.7 }],
        relationships: [rel('tamar', 0.8, 0.85, 0.8, ['friend', 'student'])],
      };
    case 'bilal':
      return {
        ...base,
        bornAt: now - 41 * YEAR,
        sex: 'male',
        traits: { agreeableness: 0.85, conscientiousness: 0.7, emotionality: 0.5, honesty: 0.85 },
        values: { benevolence: 0.9, tradition: 0.7, conformity: 0.6, security: 0.6, achievement: 0.35 },
        skills: { climbing: 0.55 },
        body: { fitness: 0.6 },
        goals: [summitGoal(0.45)],
        voices: [{ voiceId: LEADER, trust: 0.65 }],
        relationships: [rel('tamar', 0.6, 0.75, 0.7), rel('nell', 0.5, 0.6, 0.4)],
      };
    default:
      return {
        ...base,
        bornAt: now - 29 * YEAR,
        sex: 'female',
        traits: {
          agreeableness: 0.25,
          extraversion: 0.3,
          openness: 0.7,
          conscientiousness: 0.55,
          emotionality: 0.35,
        },
        values: { selfDirection: 0.95, stimulation: 0.7, achievement: 0.7, conformity: 0.15, security: 0.35 },
        skills: { climbing: 0.7 },
        // Some mornings Wren leaves without breakfast: a real need that can say no to the very first order.
        body: { fitness: 0.75, satiety: 0.3 + 0.45 * hashUnit(seed, 4242) },
        goals: [summitGoal(0.7)],
        voices: [{ voiceId: LEADER, trust: 0.4 }],
        relationships: [rel('oskar', 0.2, 0.35, 0.55, ['rival'])],
      };
  }
}

export const CAST = castForGame('rope');
export const castIdOf = (id: string): string => `hf.cast.${id}.rope`;
export function createParty(seed: number, now: number): Person[] {
  return MEMBERS.map((m, i) => {
    const canonical = CAST.find((c) => c.castId === castIdOf(m.id));
    if (!canonical) throw new Error('Missing canonical Rope person');
    return createPerson({
      ...spec(seed * 31 + i, now, m.id),
      name: canonical.name,
      bornAt: now - canonical.age * YEAR,
      traits: structuredClone(canonical.traits),
      values: structuredClone(canonical.values),
    });
  });
}
