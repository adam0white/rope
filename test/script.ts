/** A simple scripted leader for tests: lead up, ask the party along, turn at `turnAt` (minute of day). */
import { type ClimbState, canHear, queueInput, step } from '../src/sim/climb.ts';

export interface ScriptOptions {
  turnAt?: number;
  force?: 'ask' | 'urge' | 'insist';
  via?: string;
  extra?: (s: ClimbState) => void;
  /** Rope up two pairs at the hut and fix a rope on every fixable leg before leading up it. */
  careful?: boolean;
  /** After turning, walk up to holdouts out of earshot and ask them in person (default true). */
  fetch?: boolean;
}

export function playScripted(s: ClimbState, o: ScriptOptions = {}): ClimbState {
  const turnAt = o.turnAt ?? 13 * 60;
  queueInput(s, { t: 'lead', dir: 'up' });
  queueInput(s, { t: 'say', to: 'all', act: 'climb', force: 'ask' });
  if (o.careful) {
    queueInput(s, { t: 'say', to: 'tamar', act: 'rope', force: 'ask', with: 'nell' });
    queueInput(s, { t: 'say', to: 'oskar', act: 'rope', force: 'ask', with: 'wren' });
  }
  const fixedAt = new Set<string>();
  while (!s.over) {
    step(s);
    o.extra?.(s);
    const L = s.leader;
    const mod = s.minute - s.day * 1440;
    if (L.turnedAt === null && mod >= turnAt && L.pos.place !== 'hut') {
      queueInput(s, { t: 'lead', dir: 'down' });
      queueInput(s, { t: 'say', to: 'all', act: 'descend', force: o.force ?? 'urge' });
      continue;
    }
    // An attentive leader repeats the call to turn to anyone still above who has not heard it.
    if (L.turnedAt !== null && mod % 15 === 0 && mod < turnAt + 180) {
      const up = s.members.filter((m) => m.homeAt === null && m.turnedAt === null && m.summitAt === null);
      for (const m of up)
        if (canHear(s, m.id)) queueInput(s, { t: 'say', to: m.id, act: 'descend', force: o.force ?? 'urge' });
      // A holdout out of earshot: walk up to them (once at a time), then ask them in person.
      const far = up.find((m) => !canHear(s, m.id));
      if (o.fetch !== false && far && !L.follow) queueInput(s, { t: 'lead', dir: 'with', who: far.id });
    }
    // Reached the holdout: ask in person, then lead down again.
    if (L.follow && L.follow !== 'party') {
      if (canHear(s, L.follow)) {
        queueInput(s, { t: 'say', to: L.follow, act: 'descend', force: o.force ?? 'urge' });
        queueInput(s, { t: 'lead', dir: 'down' });
      }
      continue;
    }
    if (L.move || L.fixing) continue;
    if (o.careful && L.turnedAt === null && L.pos.place && !fixedAt.has(L.pos.place)) {
      fixedAt.add(L.pos.place);
      queueInput(s, { t: 'fix' });
      continue;
    }
    if (L.turnedAt === null && mod < turnAt && L.pos.place !== 'summit') {
      queueInput(s, { t: 'lead', dir: 'up', ...(o.via ? { via: o.via } : {}) });
      queueInput(s, {
        t: 'say',
        to: 'all',
        act: 'climb',
        force: o.force ?? 'urge',
        ...(o.via ? { via: o.via } : {}),
      });
    } else if (L.pos.place !== 'hut') {
      if (L.turnedAt === null) queueInput(s, { t: 'say', to: 'all', act: 'descend', force: 'urge' });
      queueInput(s, { t: 'lead', dir: 'down' });
    }
  }
  return s;
}
