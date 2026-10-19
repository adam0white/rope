/**
 * What the leader should hear about now, read from the climb (never changing it): a fresh hurt that wants the leader
 * there, why the leader has stopped on their own, and whether the day has nothing left for the player to decide.
 * Owner playtest 2026-10-18: Wren's fall at 14:31 passed as a margin line while the player pressed "lead on" ten
 * times without being told why the leader kept stopping, then watched three hours of a descent with nothing to do.
 * Covers only these three reads; the people's choices stay HF's and the host's.
 */
import { type ClimbState, canHear, distance, forkOf, MOUNTAINS, waitingFor } from '../sim/climb.ts';
import { legsUp } from '../sim/mountain.ts';
import { memberOf } from '../sim/party.ts';

/** A hurt is fresh for this long (game minutes), unless the leader reaches them first. */
export const HURT_CALL_MIN = 45;

export interface HurtCall {
  who: string;
  /** Where it happened, in the map's words. */
  where: string;
  near: boolean;
}

/** The most recent hurt (severity 0.15 or more) of someone still out, while the leader is not beside them. */
export function hurtCall(s: ClimbState): HurtCall | null {
  const m = MOUNTAINS[s.mountain];
  let best: { who: string; at: number; leg: string } | null = null;
  for (const x of s.members) {
    if (x.homeAt !== null || distance(s, x.pos, s.leader.pos) < 40) continue;
    for (const i of x.injuries)
      if (i.severity >= 0.15 && s.minute - i.at <= HURT_CALL_MIN && (!best || i.at > best.at))
        best = { who: x.id, at: i.at, leg: i.leg };
  }
  if (!best) return null;
  const where = m?.legs.find((l) => l.id === best.leg)?.name ?? 'the hill';
  return { who: best.who, where, near: canHear(s, best.who) };
}

/** Why the leader is standing still, when it was not the player's own "stop". Null while walking or at the hut. */
export function haltReason(s: ClimbState): string | null {
  const m = MOUNTAINS[s.mountain];
  const L = s.leader;
  if (!m || s.over) return null;
  const waiting = waitingFor(s);
  if (waiting.length > 0) return `You are waiting for ${names(waiting)} to catch up.`;
  if (L.move || L.follow || L.fixing || L.scouting || !L.pos.place) return null;
  if (L.pos.place === m.hut && L.path.length === 0) return null;
  const last = [...s.inputs].reverse().find((i) => i.t === 'lead');
  if (last?.t === 'lead' && last.dir === 'stop') return null;
  if (L.pos.place === m.summit) return 'You are on the top. Lead them down when you are ready.';
  if (L.turnedAt !== null) return null;
  const ups = legsUp(m, L.pos.place);
  if (forkOf(m) === L.pos.place && ups.length > 1) return 'The way forks here. Lead on to choose a line.';
  const fixable = ups.find((l) => l.fixable && !s.fixed.includes(l.id));
  if (fixable) return `You stopped below ${fixable.name}: it could take a fixed rope. Fix it, or lead on.`;
  const out = s.members.filter((x) => x.homeAt === null);
  if (out.length > 0 && !out.some((x) => canHear(s, x.id))) {
    return `You stopped: nobody is in earshot (${names(out.map((x) => x.id))}).`;
  }
  return null;
}

/**
 * Nothing left to decide: the leader and everyone still out have turned for home, and nobody is asking for company
 * or freshly hurt. The player may then walk the rest of the day quickly.
 */
export function onlyWalkingLeft(s: ClimbState): boolean {
  if (s.over || s.leader.turnedAt === null || s.leader.follow) return false;
  if (s.leader.move && s.leader.move.dir !== 'down') return false;
  if (s.members.some((x) => x.homeAt === null && x.turnedAt === null)) return false;
  if (s.members.some((x) => x.asks && x.homeAt === null)) return false;
  return hurtCall(s) === null;
}

const names = (ids: string[]): string => {
  const n = ids.map((id) => memberOf(id).name);
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}` : (n[0] ?? '');
};
