/** Authored first-person phrasebooks. HF selects and renders each recorded fragment. */
const people = {
  tamar: {
    yes: ['will do it', 'will be careful and do it', 'will come', 'have decided to do it'],
    no: ['will not do that', 'have considered it and say no', 'will not agree', 'have decided against it'],
    reluctant: [
      'will do it if you insist, though I disagree',
      'will do it, though I do not like it',
      'will follow your request reluctantly',
      'will do as you ask despite my doubts',
    ],
  },
  oskar: {
    yes: ['will do it', 'am ready to go', 'have been waiting for this', 'am coming'],
    no: ['will not do that', 'say no', 'will not agree to that', 'will not do it'],
    reluctant: [
      'will do it, though I do not like it',
      'will do it your way',
      'will do it despite my doubts',
      'will follow your request reluctantly',
    ],
  },
  nell: {
    yes: ['will try', 'will try if you think I should', 'am coming', 'will do it'],
    no: [
      'am sorry, but I say no',
      'do not think I can agree',
      'am sorry, but I will not',
      'cannot agree to that',
    ],
    reluctant: [
      'will do it if I have to',
      'will do it, though I am scared',
      'will do it despite my doubts',
      'will follow your request reluctantly',
    ],
  },
  bilal: {
    yes: ['will do it, my friend', 'am ready to follow', 'agree, friend', 'will come along'],
    no: [
      'say no, friend',
      'will not do that this time',
      'cannot agree, my friend',
      'am afraid I must say no',
    ],
    reluctant: [
      'will do as you ask, though I disagree',
      'will do it for you',
      'will do it, friend, though I would rather not',
      'will follow your request reluctantly',
    ],
  },
  wren: {
    yes: ['will do it', 'was going anyway', 'agree to do it', 'am coming'],
    no: ['say no', 'will not do that', 'refuse', 'am not doing that'],
    reluctant: [
      'will do what you say',
      'will do it, but remember I said no',
      'will do it your way',
      'will follow your request, though I disagree',
    ],
  },
};

const reasons: Record<string, string> = {
  distrust: 'I do not trust what you are asking me to do.',
  'need:rest': 'I need rest.',
  'need:sleep': 'I need sleep.',
  'need:food': 'I need food.',
  'need:water': 'I need water.',
  'need:safety': 'I need to stay safe.',
  'need:belonging': 'I want company.',
  'need:autonomy': 'I want to choose for myself.',
  'need:relief': 'I need a private stop.',
  'need:esteem': 'I want to do something I can be proud of.',
  'need:competence': 'I want to put my skills to use.',
  'need:leisure': 'I need time for myself.',
  'need:meaning': 'This matters to me.',
  downed: 'I cannot get up.',
  capacity: 'I cannot manage that.',
  break: 'I need a break.',
  norm: 'That goes against what I believe I should do.',
  rule: 'I have a rule about that.',
  commitment: 'I have a promise to keep.',
  skill: 'I do not know how to do that.',
};
const reasonWordings = Object.fromEntries(
  Object.entries(reasons).map(([key, line]) => [
    `reason.${key}`,
    [
      line,
      `Right now, ${line.startsWith('I ') ? line : line.charAt(0).toLowerCase() + line.slice(1)}`,
      `For me, ${line.startsWith('I ') ? line : line.charAt(0).toLowerCase() + line.slice(1)}`,
      `At the moment, ${line.startsWith('I ') ? line : line.charAt(0).toLowerCase() + line.slice(1)}`,
    ],
  ]),
);
const alternatives: Record<string, { deferred: string[]; modified: string[] }> = {
  tamar: {
    deferred: [
      'will consider it after “{alternative}”',
      'need to finish “{alternative}” first',
      'will attend to “{alternative}” first',
      'have decided to finish “{alternative}” before considering it',
    ],
    modified: [
      'have decided on “{alternative}” instead',
      'would rather choose “{alternative}”',
      'will choose “{alternative}” instead',
      'have thought it over and will choose “{alternative}”',
    ],
  },
  oskar: {
    deferred: [
      'want to finish “{alternative}” first',
      'will attend to “{alternative}” first',
      'am not ready until after “{alternative}”',
      'will consider it after “{alternative}”',
    ],
    modified: [
      'would rather choose “{alternative}”',
      'will choose “{alternative}” instead',
      'am going for “{alternative}” instead',
      'want “{alternative}” instead',
    ],
  },
  nell: {
    deferred: [
      'would like to finish “{alternative}” first',
      'hope to finish “{alternative}” before that',
      'will consider it after “{alternative}”',
      'need to attend to “{alternative}” first',
    ],
    modified: [
      'would rather choose “{alternative}”, if that is all right',
      'think I will choose “{alternative}” instead',
      'would like “{alternative}” instead',
      'hope to choose “{alternative}” instead',
    ],
  },
  bilal: {
    deferred: [
      'will listen after “{alternative}”, my friend',
      'need time for “{alternative}” first',
      'will attend to “{alternative}” first, friend',
      'will consider it after “{alternative}”',
    ],
    modified: [
      'will choose “{alternative}” instead, my friend',
      'would rather choose “{alternative}”, friend',
      'think I will choose “{alternative}” instead',
      'will take “{alternative}” instead',
    ],
  },
  wren: {
    deferred: [
      'will finish “{alternative}” first',
      'will not consider that until after “{alternative}”',
      'have chosen “{alternative}” first',
      'will return to that after “{alternative}”',
    ],
    modified: [
      'will choose “{alternative}” instead',
      'have chosen “{alternative}”',
      'would rather take “{alternative}”',
      'am going with “{alternative}” instead',
    ],
  },
};

const cannot: Record<string, string[]> = {
  tamar: ['cannot do that', 'am unable to do that', 'cannot do that now', 'cannot manage that'],
  oskar: ['cannot do that', 'am unable to do that', 'cannot manage that', 'cannot do that now'],
  nell: [
    'do not think I can do that',
    'am sorry, but I cannot do that',
    'cannot do that, sorry',
    'do not think I can manage that',
  ],
  bilal: [
    'cannot do that, friend',
    'cannot do that',
    'am sorry, friend, I cannot do that',
    'cannot manage that, my friend',
  ],
  wren: ['cannot do that', 'am unable to do that', 'cannot manage that', 'cannot do that now'],
};

export const VOICES = Object.fromEntries(
  Object.entries(people).map(([id, p]) => [
    id,
    {
      ...reasonWordings,
      'suggestion.resolved': [
        'I {verdict}.{reason}',
        'For now, I {verdict}.{reason}',
        'After thinking it over, I {verdict}.{reason}',
        'This time, I {verdict}.{reason}',
      ],
      'verdict.assented': p.yes,
      'verdict.commanded': p.yes,
      'verdict.complied': p.reluctant,
      'verdict.refused': p.no,
      'verdict.cannot': cannot[id] ?? cannot.tamar ?? [],
      'verdict.deferred': alternatives[id]!.deferred,
      'verdict.modified': alternatives[id]!.modified,
    },
  ]),
);
