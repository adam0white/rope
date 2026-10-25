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

const NO: Record<string, Pick> = {
  tamar: ['No.', 'No. I’ve thought about it.', 'I won’t.'],
  oskar: ['I will not do that.', 'No.', 'I will not agree to that.'],
  nell: ['I’m sorry, no.', 'I don’t think I can.', 'No, sorry.'],
  bilal: ['Ah, no.', 'I will not do that this time.', 'No, friend.'],
  wren: ['No.', 'Why would I?', 'Forget it.'],
};

const cap = (t: string) => t.replace(/^./, (c) => c.toUpperCase());

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
// HF's generic yeses: a voice replaces only these, so a yes that carries a reason ("I trust you") keeps it.
const PLAIN_YES = /^(Good idea\. On it\.|Fine\.|Alright, I'll do it\.|OK\.|Okay\.|Sure\.)\s*/;

export function voiced(
  seed: number,
  who: string,
  minute: number,
  verdict: string,
  says: string,
  reason = '',
  plainEnglish = false,
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
  // Plain HF already supplies a full deferral. Keep its complete sentence.
  const m = plainEnglish ? null : says.match(/After I ([^,.]+)[,.]/);
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
