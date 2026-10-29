/**
 * Five voices for HF's answers. HF decides what (its act, verdict and reason); this module only says it
 * the way each person talks, keeping the content: the act they put first, the refusal, the reason. The variant is
 * chosen by a hash of seed, person and minute, so a replay says the same words. SCOPE: phrasing only; it never
 * changes a verdict or adds a reason HF did not give.
 */
import { hashUnit } from './rng.ts';

type Pick = readonly string[];

const AFTER: Record<string, Pick> = {
  tamar: [
    'I will consider it after I {x}, but not before.',
    'I need to {x} first. Then I will think about it.',
    'Let me {x} properly first.',
  ],
  oskar: [
    'Let me {x} first. We are so close.',
    'Let me {x} first! Come on.',
    'Not yet. Let me {x} first. Then I will do it.',
  ],
  nell: [
    'Can I just {x} first? Then I will do it.',
    'Can I {x} first? I would like to.',
    'Let me {x} first, if that is all right.',
  ],
  bilal: [
    'Let me {x}. Then I’ll listen.',
    'I will listen after I {x}, my friend.',
    'Give me time to {x}, then I’ll come.',
  ],
  wren: [
    'Let me {x} first. I’m not stopping now.',
    'I will not do that until I {x}.',
    'I’ll {x}. Then ask me again.',
  ],
};

const INSTEAD: Record<string, Pick> = {
  tamar: ['I will {x} instead. I’ve thought about it.'],
  oskar: ['I will {x} instead. Come on.'],
  nell: ['Could I {x} instead?'],
  bilal: ['I’ll {x} instead, my friend.'],
  wren: ['I’ll {x} instead. That’s my choice.'],
};

const NO: Record<string, Pick> = {
  tamar: ['No.', 'No. I’ve thought about it.', 'I won’t.'],
  oskar: ['I will not do that.', 'No.', 'I will not agree to that.'],
  nell: ['I’m sorry, no.', 'I don’t think I can.', 'No, sorry.'],
  bilal: ['Ah, no.', 'I will not do that this time.', 'No, friend.'],
  wren: ['No.', 'Why would I?', 'Forget it.'],
};

const CANNOT: Record<string, Pick> = {
  tamar: ['I cannot do that from here. Look where we are.', 'I can’t do that here.'],
  oskar: ['I cannot do that from here.', 'How can I do that from here?'],
  nell: ['I don’t think I can do that from here.', 'Sorry, I cannot do that here.'],
  bilal: ['I cannot do that from here, friend.', 'That can’t be done here.'],
  wren: ['I cannot do that from here.', 'I cannot do that here. Look around.'],
};

const YES: Record<string, Pick> = {
  tamar: ['I will do it.', 'Yes, but we need to be careful.', 'I’ll come.'],
  oskar: ['Yes! Let’s go.', 'I have been waiting for this.', 'I will do it!'],
  nell: ['Okay, I’ll try.', 'I will try if you think I should.', 'All right, I’m coming.'],
  bilal: ['That sounds good.', 'Lead the way, friend.', 'Yes, I will do it.'],
  wren: ['I will do it.', 'I was going anyway.', 'Yes, I will do it.'],
};
const GRUDGING: Record<string, Pick> = {
  tamar: [
    'I will do it if you insist, but I don’t like it.',
    'I will do it. You are responsible if this goes wrong.',
  ],
  oskar: ['I do not like this, but I will do it.', 'I will do it, then.'],
  nell: ['Okay, I will do it if I have to.', 'I will, but I’m scared.'],
  bilal: ['I will do what you say, but I don’t agree.', 'I will do it for you, then.'],
  wren: ['I will do what you say.', 'I will do it. Remember I said no.'],
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
  seed: number,
  who: string,
  minute: number,
  verdict: string,
  _narration: string,
  reason = '',
  chosenAction = '',
  chosenLabel?: string,
): string {
  const k = (n: number) => Math.floor(hashUnit(seed, 9101, minute, who.length, who.charCodeAt(0), 0) * n);
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
