/**
 * Five voices for HF's answers. HF decides and says what (its `says`, verdict and reason); this module only says it
 * the way each person talks, keeping the content: the act they put first, the refusal, the reason. The variant is
 * chosen by a hash of seed, person and minute, so a replay says the same words. SCOPE: phrasing only; it never
 * changes a verdict or adds a reason HF did not give.
 */
import { hashUnit } from './rng.ts';

type Pick = readonly string[];

const AFTER: Record<string, Pick> = {
  tamar: [
    'Once I’ve done {X}. Not before.',
    '{X} first. Then I’ll think about it.',
    'Let me {x} properly first.',
  ],
  oskar: ['{X} first, we’re so close.', 'After I {x}! Come on.', 'Not yet. Let me {x}, then sure.'],
  nell: [
    'Can I just {x} first? Then yes.',
    'Um, after I {x}? I’d like to.',
    'After I {x}, if that’s all right.',
  ],
  bilal: ['Let me {x}. Then I’ll listen.', 'After I {x}, my friend.', 'Give me time to {x}, then I’ll come.'],
  wren: ['After I {x}. I’m not stopping now.', 'Not till I {x}.', 'I’ll {x}. Then ask me again.'],
};

const NO: Record<string, Pick> = {
  tamar: ['No.', 'No. I’ve thought about it.', 'I won’t.'],
  oskar: ['No way.', 'Nope.', 'Not a chance.'],
  nell: ['I’m sorry, no.', 'I don’t think I can.', 'No, sorry.'],
  bilal: ['Ah, no.', 'Not this time.', 'No, friend.'],
  wren: ['No.', 'Why would I?', 'Forget it.'],
};

const cap = (t: string) => t.replace(/^./, (c) => c.toUpperCase());

const CANNOT: Record<string, Pick> = {
  tamar: ['Not from here. Look where we are.', 'I can’t do that here.'],
  oskar: ['Can’t, not from here.', 'How? Not from here.'],
  nell: ['I don’t think I can, from here?', 'Sorry, I can’t, not here.'],
  bilal: ['Not from here, friend.', 'That can’t be done here.'],
  wren: ['Not from here.', 'Can’t. Look around.'],
};

const YES: Record<string, Pick> = {
  tamar: ['All right.', 'Yes. Carefully, though.', 'I’ll come.'],
  oskar: ['Yes! Let’s go.', 'Finally.', 'On it!'],
  nell: ['Okay, I’ll try.', 'If you think so.', 'All right, I’m coming.'],
  bilal: ['Good, good.', 'Lead on, friend.', 'Yes, why not.'],
  wren: ['Fine.', 'Was going anyway.', 'Sure.'],
};
const GRUDGING: Record<string, Pick> = {
  tamar: ['If you insist. I don’t like it.', 'Fine. On your head.'],
  oskar: ['Ugh. Okay.', 'Fine, fine.'],
  nell: ['Okay… if I have to.', 'I will, but I’m scared.'],
  bilal: ['As you say. But I don’t agree.', 'For you, then.'],
  wren: ['Whatever you say.', 'Fine. Remember I said no.'],
};
// HF's generic yeses: a voice replaces only these, so a yes that carries a reason ("I trust you") keeps it.
const PLAIN_YES = /^(Good idea\. On it\.|Fine\.|Alright, I'll do it\.|OK\.|Okay\.|Sure\.)\s*/;

export function voiced(
  seed: number,
  who: string,
  minute: number,
  verdict: string,
  says: string,
  reason = '',
): string {
  const k = (n: number) => Math.floor(hashUnit(seed, 9101, minute, who.length, who.charCodeAt(0), 0) * n);
  if ((verdict === 'assented' || verdict === 'complied') && PLAIN_YES.test(says)) {
    const opts = (verdict === 'complied' ? GRUDGING : YES)[who];
    const t = opts?.[k(opts.length)];
    if (t) return `${t} ${says.replace(PLAIN_YES, '')}`.trim();
  }
  if (reason === 'unavailable') {
    const opts = CANNOT[who];
    const t = opts?.[k(opts.length)];
    if (t) return t;
  }
  // "After I climb the ice wall, then I will." / "Not now. After I climb the ice wall."
  const m = says.match(/After I ([^,.]+)[,.]/);
  if (verdict === 'deferred' && m?.[1]) {
    const opts = AFTER[who];
    const t = opts?.[k(opts.length)];
    if (t) {
      const rest = says
        .slice((m.index ?? 0) + m[0].length)
        .replace(/^\s*then I will\.\s*/, '')
        .trim();
      const line = t.replace('{X}', cap(m[1])).replace('{x}', m[1]);
      return rest ? `${line} ${rest}` : line;
    }
  }
  if (verdict === 'refused' && /^No\b[.,!]?\s*/.test(says)) {
    const opts = NO[who];
    const t = opts?.[k(opts.length)];
    if (t) return `${t} ${says.replace(/^No\b[.,!]?\s*/, '')}`.trim();
  }
  return says;
}
