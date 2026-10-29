/**
 * Progressive disclosure: the leader's verbs appear when the mountain makes them matter, and a margin note teaches
 * each one as it appears (a hands-on tutorial on the first climb). Kept per season in the save. Reads the climb
 * state; never changes it.
 */

import { type ClimbState, canHear, forkOf, MOUNTAINS } from '../sim/climb.ts';
import { memberOf } from '../sim/party.ts';

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
      text: 'Someone refused or delayed your request, or offered another action. You can wait, offer rest, change your plan, or **insist**. Insisting can turn “not now” into an unwilling yes. It cannot change a firm refusal. It can damage their trust in you.',
    };
  if (s.climbNo === 1) {
    if (!seen('lead') && leaderInputs === 0)
      return {
        id: 'lead',
        lit: 'lead',
        text: 'Tap **Lead on** to start walking. You keep to their pace. They choose whether to come. Ask them to join you.',
      };
    if (!seen('ask') && sayInputs === 0 && s.members.some((x) => x.homeAt === null && canHear(s, x.id)))
      return {
        id: 'ask',
        lit: 'climb',
        text: 'Ask them to join you. You have selected **everyone**. Tap **Climb on**, then **ask**.',
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
        text: 'Each person answers for themselves. Their words tell you what they choose.',
      };
  }
  const fork = forkOf(m);
  if (!has(d, 'tell') && (s.known.length > 1 || (fork && s.leader.pos.place === fork)))
    return {
      id: 'tell',
      unlock: 'tell',
      lit: 'tell',
      text: 'Open **more actions**. Use **Scout** to inspect a path, or ask someone to **go ahead** and call down what they see. Use **tell** to share what you learned.',
    };
  if (!has(d, 'promise') && mod >= 10 * 60 + 30)
    return {
      id: 'promise',
      unlock: 'promise',
      lit: 'promise',
      text: 'The weather changes in the afternoon. Open **more actions** and **promise** a time to turn back. They expect you to keep your promise.',
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
      text: 'The ground is steeper now. Pick someone, open **more actions**, then **Rope up**. A partner may stop a fall if you slip.',
    };
  const fixable = s.leader.pos.place ? m.legs.some((l) => l.from === s.leader.pos.place && l.fixable) : false;
  if (!has(d, 'fix') && fixable && has(d, 'rope'))
    return {
      id: 'fix',
      unlock: 'fix',
      lit: 'fix',
      text: 'You can secure a rope to the route above. Open **more actions** and choose **Fix rope**. Securing the rope takes time. It makes the route safer for everyone who follows.',
    };
  const available =
    s.members.find((x) => x.homeAt === null && x.rations === 0) ??
    (leaderInputs > 0 ? s.members.find((x) => x.homeAt === null) : undefined);
  if (!has(d, 'pack') && available)
    return {
      id: 'pack',
      unlock: 'pack',
      text: `${available.rations === 0 ? `${memberOf(available.id).name} has no food left. ` : ''}Pick ${memberOf(available.id).name}, then open **more actions** to **take their pack** or **share food** from yours. They can refuse.`,
    };
  return null;
}

export function markSeen(d: Disclosure, n: Note): void {
  if (!d.seen.includes(n.id)) d.seen.push(n.id);
  if (n.unlock && !d.unlocked.includes(n.unlock)) d.unlocked.push(n.unlock);
  if (n.unlock === 'pack' && !d.unlocked.includes('share')) d.unlocked.push('share');
}
