/**
 * Five voices for HF's answers. HF decides what (its act, verdict and reason); this module only says it
 * the way each person talks, keeping the content: the act they put first, the refusal, the reason. The variant is
 * chosen by the suggestion event’s recorded HF wording index. SCOPE: phrasing only; it never
 * changes a verdict or adds a reason HF did not give.
 */

type Pick = readonly string[];

const AFTER: Record<string, Pick> = {
  tamar: [
    'I will consider it after I {x}, but not before.',
    'I need to {x} first. Then I will think about it.',
    'Let me {x} properly first.',
    'First I need to {x}. We can discuss it then.',
  ],
  oskar: [
    'Let me {x} first. We are so close.',
    'Let me {x} first! Come on.',
    'Not yet. Let me {x} first. Then I will do it.',
    'Hang on, let me {x} first!',
  ],
  nell: [
    'Can I just {x} first? Then I will do it.',
    'Can I {x} first? I would like to.',
    'Let me {x} first, if that is all right.',
    'Could I {x} first? Then we can talk about it.',
  ],
  bilal: [
    'Let me {x}. Then I’ll listen.',
    'I will listen after I {x}, my friend.',
    'Give me time to {x}, then I’ll come.',
    'First let me {x}, friend. Then we can talk.',
  ],
  wren: [
    'Let me {x} first. I’m not stopping now.',
    'I will not do that until I {x}.',
    'I’ll {x}. Then ask me again.',
    'First I’ll {x}. The rest can wait.',
  ],
};

const INSTEAD: Record<string, Pick> = {
  tamar: [
    'I will {x} instead. I’ve thought about it.',
    'I would rather {x}.',
    'No, I will {x} instead.',
    'I’ve decided to {x} instead.',
  ],
  oskar: [
    'I will {x} instead. Come on.',
    'I’d rather {x}!',
    'No, let me {x} instead.',
    'I’m going to {x} instead.',
  ],
  nell: [
    'Could I {x} instead?',
    'I’d rather {x}, if that’s all right.',
    'I think I’ll {x} instead.',
    'Can I {x} instead, please?',
  ],
  bilal: [
    'I’ll {x} instead, my friend.',
    'I would rather {x}, friend.',
    'I think I’ll {x} instead.',
    'Let me {x} instead, my friend.',
  ],
  wren: [
    'I’ll {x} instead. That’s my choice.',
    'No, I’ll {x} instead.',
    'I’d rather {x}.',
    'I’m going to {x} instead.',
  ],
};

const NO: Record<string, Pick> = {
  tamar: ['No.', 'No. I’ve thought about it.', 'I won’t.', 'I have considered it. No.'],
  oskar: ['I will not do that.', 'No.', 'I will not agree to that.', 'No, I won’t do it.'],
  nell: ['I’m sorry, no.', 'I don’t think I can.', 'No, sorry.', 'I’m sorry, I won’t.'],
  bilal: ['Ah, no.', 'I will not do that this time.', 'No, friend.', 'I’m afraid not, my friend.'],
  wren: ['No.', 'Why would I?', 'Forget it.', 'I’m not doing that.'],
};

const CANNOT: Record<string, Pick> = {
  tamar: [
    'I cannot do that from here. Look where we are.',
    'I can’t do that here.',
    'That cannot be done from here.',
    'Look at where we are. I cannot do that here.',
  ],
  oskar: [
    'I cannot do that from here.',
    'How can I do that from here?',
    'I can’t do that here.',
    'Not from here, I can’t.',
  ],
  nell: [
    'I don’t think I can do that from here.',
    'Sorry, I cannot do that here.',
    'I can’t do that here, sorry.',
    'I don’t think I can do that from here, sorry.',
  ],
  bilal: [
    'I cannot do that from here, friend.',
    'That can’t be done here.',
    'Sorry, friend, I can’t do that here.',
    'I can’t do it from here, my friend.',
  ],
  wren: [
    'I cannot do that from here.',
    'I cannot do that here. Look around.',
    'I cannot do it from here.',
    'I can’t do that here.',
  ],
};

const YES: Record<string, Pick> = {
  tamar: ['I will do it.', 'Yes, but we need to be careful.', 'I’ll come.', 'All right, I’ll do it.'],
  oskar: ['Yes! Let’s go.', 'I have been waiting for this.', 'I will do it!', 'All right, let’s do it!'],
  nell: [
    'Okay, I’ll try.',
    'I will try if you think I should.',
    'All right, I’m coming.',
    'Yes, okay, I’ll do it.',
  ],
  bilal: ['That sounds good.', 'Lead the way, friend.', 'Yes, I will do it.', 'All right, my friend.'],
  wren: ['I will do it.', 'I was going anyway.', 'Yes, I will do it.', 'Fine, I’ll do it.'],
};
const GRUDGING: Record<string, Pick> = {
  tamar: [
    'I will do it if you insist, but I don’t like it.',
    'I will do it. You are responsible if this goes wrong.',
    'All right, I will do it, though I disagree.',
    'I don’t like it, but I will do as you ask.',
  ],
  oskar: [
    'I do not like this, but I will do it.',
    'I will do it, then.',
    'Fine, I’ll do it, though I don’t want to.',
    'All right, I’ll do it your way.',
  ],
  nell: [
    'Okay, I will do it if I have to.',
    'I will, but I’m scared.',
    'All right, I’ll do it, though I don’t want to.',
    'If you insist, I’ll do it.',
  ],
  bilal: [
    'I will do what you say, but I don’t agree.',
    'I will do it for you, then.',
    'All right, friend, though I would rather not.',
    'I’ll do it, but I’m not happy about it.',
  ],
  wren: [
    'I will do what you say.',
    'I will do it. Remember I said no.',
    'Fine. I’ll do it your way.',
    'I don’t agree, but I’ll do it.',
  ],
};
/** Game words keyed by HF identities, never by generated narration. */
const ACT: Record<string, string> = {
  climb: 'climb',
  summit: 'reach the top',
  descend: 'go down',
  walk: 'walk',
  rest: 'rest',
  sleep: 'sleep',
  eat: 'eat',
  drink: 'drink',
  relieve: 'wash',
  wait: 'wait',
  rope: 'attach the rope',
  pack: 'carry the pack',
  scout: 'check the route',
  gather: 'meet the others',
  talk: 'talk',
  pray: 'pray',
  escort: 'walk with them',
};
const REASON: Record<string, string> = {
  distrust: 'I don’t trust what you are asking me to do.',
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
  'need:leisure': 'I need some time for myself.',
  'need:meaning': 'This matters to me.',
  asleep: 'I need to sleep.',
  downed: 'I cannot get up.',
  capacity: 'I cannot manage that.',
  break: 'I need a break.',
};
const REASON_KIND: Record<string, string> = {
  norm: 'That goes against what I believe I should do.',
  rule: 'I have a rule about that.',
  commitment: 'I have a promise to keep.',
  skill: 'I do not know how to do that.',
  capacity: 'I cannot manage that.',
};
export function voiced(
  _seed: number,
  who: string,
  _minute: number,
  verdict: string,
  _narration: string,
  reason = '',
  chosenAction = '',
  chosenLabel?: string,
  choiceIndex = 0,
): string {
  const k = (n: number) => choiceIndex % n;
  const table =
    reason === 'unavailable'
      ? CANNOT
      : verdict === 'assented' || verdict === 'commanded'
        ? YES
        : verdict === 'complied'
          ? GRUDGING
          : verdict === 'modified'
            ? INSTEAD
            : verdict === 'deferred'
              ? AFTER
              : NO;
  const options = table[who];
  const words = options?.[k(options.length)] ?? 'I won’t agree to that.';
  // The chosen act is the alternative HF selected, not the requested act.
  const act = ACT[chosenAction] ? chosenLabel || ACT[chosenAction] : undefined;
  const opening =
    table === AFTER || table === INSTEAD
      ? act
        ? words.replace('{x}', act)
        : 'Not yet. Ask me again later.'
      : words;
  const cause =
    reason === 'unavailable' ? '' : (REASON[reason] ?? REASON_KIND[reason.split(':')[0] ?? ''] ?? '');
  return [opening, cause].filter(Boolean).join(' ');
}
