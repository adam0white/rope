/** Authored first-person phrasebooks. HF selects and renders each recorded fragment. */
const people = {
  tamar: {
    yes: [
      'Yes. I have decided to do it.',
      'I agree. I will do it.',
      'I will do as you ask.',
      'I have considered it, and I will do it.',
    ],
    no: [
      'I will not do that.',
      'I have considered it, and I will not agree.',
      'No. I will not take that risk.',
      'I will not follow that plan.',
    ],
    reluctant: [
      'I will do it, though I disagree.',
      'I will follow your plan, but I have doubts.',
      'I will do it, though I would choose differently.',
      'I will do as you ask, but I am uneasy about it.',
    ],
    cannot: [
      'I cannot carry out your request.',
      'I cannot manage that task.',
      'I cannot carry out that plan.',
      'I cannot do what you ask.',
    ],
    deferred: [
      'I will consider it after I {alternative}.',
      'I need to {alternative} first.',
      'I will {alternative} first, then consider it.',
      'After I {alternative}, I will consider your request.',
    ],
    later: [
      'I will consider that later.',
      'I need more time before I decide.',
      'Ask me again later, after I have had time to think.',
      'I will return to that decision later.',
    ],
    modified: [
      'I have decided to {alternative} instead.',
      'I would rather {alternative} instead.',
      'I will {alternative} instead.',
      'After thinking it over, I will {alternative} instead.',
    ],
  },
  oskar: {
    yes: ['Yes! Let’s do it.', 'I am ready! I will do it.', 'Absolutely! I will do it.', 'Yes! Count me in.'],
    no: [
      'No, I won’t do that.',
      'I won’t go along with that.',
      'I will not do it.',
      'No way. I won’t agree to that.',
    ],
    reluctant: [
      'I will do it, but I don’t like it.',
      'All right, I will do it, though I have doubts.',
      'I will follow your plan, but I disagree.',
      'I will do it, though I would rather not.',
    ],
    cannot: [
      'I can’t do that, even if I want to.',
      'I can’t make that happen.',
      'I can’t take that on right now.',
      'I can’t do what you are asking.',
    ],
    deferred: [
      'I want to {alternative} first.',
      'Let me {alternative} first, then I will consider it.',
      'I will think about it after I {alternative}.',
      'First I will {alternative}, then we can talk.',
    ],
    later: [
      'Not yet. Ask me again later.',
      'I will think about it later.',
      'Give me some time first.',
      'Later, maybe. Ask me again.',
    ],
    modified: [
      'I want to {alternative} instead.',
      'Let’s {alternative} instead!',
      'I would rather {alternative} instead.',
      'I will {alternative} instead.',
    ],
  },
  nell: {
    yes: [
      'Yes, I will do it.',
      'I will do as you ask.',
      'I agree. Let’s do it.',
      'Yes, I am ready to do that.',
    ],
    no: [
      'I am sorry, but I won’t do that.',
      'No, I will not agree to that.',
      'I won’t follow that plan.',
      'I have decided I won’t do it.',
    ],
    reluctant: [
      'I will do it, though I am scared.',
      'I will do it, but I am worried.',
      'I will do as you ask, though I have doubts.',
      'I will follow your plan, but I am uneasy.',
    ],
    cannot: [
      'I am sorry, but I can’t do that.',
      'I can’t manage what you ask.',
      'I cannot do that right now.',
      'I can’t take that on, sorry.',
    ],
    deferred: [
      'I would like to {alternative} first.',
      'I will consider it after I {alternative}.',
      'First I need to {alternative}, then I can think about it.',
      'After I {alternative}, I will consider your request.',
    ],
    later: [
      'Not yet. Please ask me again later.',
      'I need some time first.',
      'I will consider it later.',
      'Please let me think about that first.',
    ],
    modified: [
      'I would like to {alternative} instead.',
      'I will {alternative} instead.',
      'I have decided to {alternative} instead.',
      'I would rather {alternative} instead.',
    ],
  },
  bilal: {
    yes: [
      'Yes, my friend. I will do it.',
      'I agree with you, friend.',
      'Gladly. I will do it.',
      'Yes, friend. I agree to do it.',
    ],
    no: [
      'I won’t do that, friend.',
      'No, my friend. I will not agree.',
      'I won’t follow that plan.',
      'I am sorry, friend, but I will not do it.',
    ],
    reluctant: [
      'I will do as you ask, though I disagree.',
      'I will do it, friend, but I have doubts.',
      'I will do it, though I would rather not.',
      'I will do it, but I am concerned.',
    ],
    cannot: [
      'I can’t do that, friend.',
      'I cannot manage that, my friend.',
      'I am sorry, friend, I can’t do it.',
      'I can’t take that on right now.',
    ],
    deferred: [
      'I will consider it after I {alternative}, my friend.',
      'I need to {alternative} first, friend.',
      'Let me {alternative} first, then we can talk.',
      'After I {alternative}, I will consider it, friend.',
    ],
    later: [
      'Ask me again later, my friend.',
      'I need some time first, friend.',
      'I will consider it later.',
      'Let us return to that later, friend.',
    ],
    modified: [
      'I will {alternative} instead, my friend.',
      'I would rather {alternative} instead, friend.',
      'Let’s {alternative} instead.',
      'I have decided to {alternative} instead, friend.',
    ],
  },
  wren: {
    yes: ['Yes. I will.', 'I will do it.', 'I agree. I will do it.', 'Yes. Count me in.'],
    no: [
      'No. I won’t do that.',
      'Forget it. I won’t agree.',
      'I will not follow that plan.',
      'I won’t do it.',
    ],
    reluctant: [
      'I will do it, but I disagree.',
      'Fine, I will do it, though I have doubts.',
      'I will follow your plan, but I don’t like it.',
      'I will do it, though I think you are wrong.',
    ],
    cannot: [
      'I can’t do that.',
      'I can’t make it happen.',
      'I cannot carry out that plan.',
      'I can’t take that on.',
    ],
    deferred: [
      'I will {alternative} first.',
      'I will consider it after I {alternative}.',
      'First I will {alternative}, then we can talk.',
      'Ask me after I {alternative}.',
    ],
    later: ['Not yet. Ask me later.', 'I will decide later.', 'Give me time first.', 'Later. Ask me again.'],
    modified: [
      'I will {alternative} instead.',
      'I would rather {alternative} instead.',
      'I have chosen to {alternative} instead.',
      'Let’s {alternative} instead.',
    ],
  },
};

const reasons: Record<string, string[]> = {
  distrust: [
    'I do not trust what you are asking.',
    'I doubt this is safe to follow.',
    'I do not trust this request.',
    'I have doubts about what you are asking.',
  ],
  'need:rest': ['I need rest.', 'I need to rest.', 'Rest is what I need.', 'I need some rest first.'],
  'need:sleep': ['I need sleep.', 'I need to sleep.', 'Sleep is what I need.', 'I need some sleep first.'],
  'need:food': ['I need food.', 'I need to eat.', 'Food is what I need.', 'I need something to eat.'],
  'need:water': ['I need water.', 'I need to drink.', 'Water is what I need.', 'I need something to drink.'],
  'need:safety': [
    'I need to stay safe.',
    'I need safety.',
    'Being safe matters to me.',
    'I need to protect myself.',
  ],
  'need:belonging': [
    'I want company.',
    'I want someone with me.',
    'I need company.',
    'I want to be with the others.',
  ],
  'need:autonomy': [
    'I want to choose for myself.',
    'I need to make my own choice.',
    'I want this decision to be mine.',
    'I need a say in what I do.',
  ],
  'need:relief': [
    'I need a private stop.',
    'I need some privacy for a stop.',
    'I need to stop somewhere private.',
    'I need a moment in private.',
  ],
  'need:esteem': [
    'I want to do something I can be proud of.',
    'I want to feel proud of what I do.',
    'It matters to me to do something worthwhile.',
    'I want to be proud of my work.',
  ],
  'need:competence': [
    'I want to put my skills to use.',
    'I want to use what I know.',
    'I need a chance to use my skills.',
    'I want to contribute my skills.',
  ],
  'need:leisure': [
    'I need time for myself.',
    'I need some time to relax.',
    'I want some time to myself.',
    'I need a little leisure time.',
  ],
  'need:meaning': [
    'This matters to me.',
    'This has meaning for me.',
    'I care about this.',
    'This is important to me.',
  ],
  downed: [
    'I cannot get up.',
    'I am down and cannot get up.',
    'I cannot stand up.',
    'I am unable to get up.',
  ],
  capacity: [
    'My body cannot meet the demands of that task.',
    'I do not have the physical capacity for that.',
    'That is beyond what my body can manage.',
    'My body cannot handle that task.',
  ],
  break: [
    'I need a break.',
    'I need to pause.',
    'I need some time to recover.',
    'A break would help me recover.',
  ],
  norm: [
    'That goes against what I believe I should do.',
    'I believe that would be wrong.',
    'That conflicts with what I believe is right.',
    'I do not believe I should do that.',
  ],
  rule: [
    'I have a rule about that.',
    'That goes against a rule I follow.',
    'My rule does not allow that.',
    'I follow a rule that prevents it.',
  ],
  commitment: [
    'I have a promise to keep.',
    'I have given my word.',
    'I need to keep my promise.',
    'I have already made a commitment.',
  ],
  skill: [
    'I do not know how to do that.',
    'I lack the skills for that.',
    'I have not learned how to do that.',
    'I do not have the skills this takes.',
  ],
  unavailable: [
    'What I need for that is missing.',
    'The conditions for that are not in place.',
    'Something I need for that is missing.',
    'I do not have what I need for that.',
  ],
  asleep: ['I need to sleep.', 'I need sleep.', 'I need some sleep first.', 'Sleep is what I need.'],
};

const reasonWordings = Object.fromEntries(
  Object.entries(reasons).map(([key, lines]) => [`reason.${key}`, lines]),
);

export const VOICES = Object.fromEntries(
  Object.entries(people).map(([id, p]) => [
    id,
    {
      ...reasonWordings,
      'suggestion.resolved': ['{verdict}{reason}'],
      'verdict.assented': p.yes,
      'verdict.commanded': p.yes,
      'verdict.complied': p.reluctant,
      'verdict.refused': p.no,
      'verdict.cannot': p.cannot,
      'verdict.deferred': p.deferred,
      'verdict.deferred.later': p.later,
      'verdict.modified': p.modified,
    },
  ]),
);
