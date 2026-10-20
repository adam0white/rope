/**
 * Progressive disclosure: the leader's verbs appear when the mountain makes them matter, and a margin note teaches
 * each one as it appears (a hands-on tutorial on the first climb). Kept per season in the save. Reads the climb
 * state; never changes it.
 */

import { readPerson } from '@adam0white/human-framework';
import { type ClimbState, canHear, forkOf, MOUNTAINS, personOf } from '../sim/climb.ts';

export type Feature = 'insist' | 'tell' | 'promise' | 'rope' | 'fix' | 'pack' | 'share';

export interface Disclosure {
  unlocked: Feature[];
  /** Notes already shown. */
  seen: string[];
}

export interface Note {
  id: string;
  /** Margin note in the narrator's voice; **x** marks a control name. */
  text: string;
  /** Control to highlight. */
  lit?: string;
  /** Unlocks this feature when shown. */
  unlock?: Feature;
}

export const newDisclosure = (): Disclosure => ({ unlocked: [], seen: [] });

export const has = (d: Disclosure, f: Feature): boolean => d.unlocked.includes(f);

/** The next note due now, if any. `lastLines` are the lines since the climb began. */
export function nextNote(d: Disclosure, s: ClimbState): Note | null {
  const m = MOUNTAINS[s.mountain];
  if (!m) return null;
  const seen = (id: string) => d.seen.includes(id);
  const mod = s.minute - s.day * 1440;
  const leaderInputs = s.inputs.filter((i) => i.t === 'lead').length;
  const sayInputs = s.inputs.filter((i) => i.t === 'say').length;
  const refusal = s.lines.find(
    (l) => l.verdict === 'refused' || l.verdict === 'deferred' || l.verdict === 'modified',
  );
  if (!has(d, 'insist') && refusal)
    return {
      id: 'insist',
      unlock: 'insist',
      text: 'Someone said no. You can wait, offer rest, change your plan, or **insist**. Insisting turns a “not now” into a grudging yes, never a “won’t”, and it costs trust.',
    };
  if (s.climbNo === 1) {
    if (!seen('lead') && leaderInputs === 0)
      return {
        id: 'lead',
        lit: 'lead',
        text: 'You lead. Tap **Lead on** to start the party up the path. You keep to their pace and wait for the last of them; they come if they want to.',
      };
    if (!seen('ask') && sayInputs === 0 && s.members.some((x) => x.homeAt === null && canHear(s, x.id)))
      return {
        id: 'ask',
        lit: 'climb',
        text: 'Now ask them along: **everyone** is picked. Tap **Climb on**, then **ask**.',
      };
    const apart =
      leaderInputs > 0 &&
      s.members.some((x) => x.homeAt === null) &&
      !s.members.some((x) => x.homeAt === null && canHear(s, x.id));
    if (!seen('with') && apart)
      return {
        id: 'with',
        lit: 'with',
        text: 'Nobody can hear you from here. Tap **Stay with them** to walk back to the party, or pick someone first and walk to them.',
      };
    if (!seen('watch') && s.lines.length > 0)
      return {
        id: 'watch',
        text: 'Each answers for themself. Watch how they walk: short steps and a bent back mean tired; a bowed head, low spirits.',
      };
  }
  const fork = forkOf(m);
  if (!has(d, 'tell') && (s.known.length > 1 || (fork && s.leader.pos.place === fork)))
    return {
      id: 'tell',
      unlock: 'tell',
      lit: 'tell',
      text: 'You can see things they cannot. **Scout** a way up, or send someone to **go ahead** and call down; then **tell** them: what they know changes what they want.',
    };
  if (!has(d, 'promise') && mod >= 10 * 60 + 30)
    return {
      id: 'promise',
      unlock: 'promise',
      lit: 'promise',
      text: 'The afternoon brings weather. You can **promise** a time to turn back. They will hold you to it.',
    };
  const exposed = s.members.some((x) => {
    const leg = x.pos.leg ? m.legs.find((l) => l.id === x.pos.leg) : null;
    return leg && (leg.kind === 'snow' || leg.kind === 'ridge' || leg.kind === 'gully');
  });
  if (!has(d, 'rope') && (exposed || s.members.some((x) => x.injuries.length > 0)))
    return {
      id: 'rope',
      unlock: 'rope',
      lit: 'rope',
      text: 'The ground is steeper now. Pick someone and **Rope up** to tie them to a partner; a partner can hold a slip.',
    };
  const fixable = s.leader.pos.place ? m.legs.some((l) => l.from === s.leader.pos.place && l.fixable) : false;
  if (!has(d, 'fix') && fixable && has(d, 'rope'))
    return {
      id: 'fix',
      unlock: 'fix',
      lit: 'fix',
      text: 'The leg above can take a fixed rope. **Fix rope** costs you time but makes it safer for everyone after.',
    };
  const tired = s.members.some((x) => readPerson(personOf(s, x.id)).body.fatigue > 0.45 || x.rations === 0);
  if (!has(d, 'pack') && tired)
    return {
      id: 'pack',
      unlock: 'pack',
      text: 'Someone is flagging. Pick them: you can **take their pack**, or **share food** from yours.',
    };
  return null;
}

export function markSeen(d: Disclosure, n: Note): void {
  if (!d.seen.includes(n.id)) d.seen.push(n.id);
  if (n.unlock && !d.unlocked.includes(n.unlock)) d.unlocked.push(n.unlock);
  if (n.unlock === 'pack' && !d.unlocked.includes('share')) d.unlocked.push('share');
}
