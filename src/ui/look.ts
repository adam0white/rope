/**
 * How a person looks, from their HF state: the drawing's only access to inner state. Every field is a drawing
 * parameter (stride, lean, gaze), never a number for the player. Read-only; consumes no randomness.
 */
import { emotionLevel, type Person, readPerson, voiceOf } from '@adam0white/human-framework';
import { LEADER } from '../sim/party.ts';

export interface Look {
  /** Step length, 0.3 (dragging) .. 1 (fresh). */
  stride: number;
  /** Forward lean in radians: tiredness bends the back. */
  lean: number;
  /** Hunch 0..1: fear pulls the shoulders up and the head down. */
  hunch: number;
  /** Limp 0..1: pain and injury break the rhythm. */
  limp: number;
  /** -1 looks away from the leader, 1 looks to the leader: trust. */
  gaze: number;
  /** Bowed head: low mood or grief. */
  bowed: number;
  /** An ink blot for an injury, 0 none. */
  blot: number;
  downed: boolean;
  protest: boolean;
}

export function lookOf(p: Person): Look {
  const r = readPerson(p);
  const fatigue = r.body.fatigue;
  const pain = r.body.perceived.pain;
  const fear = emotionLevel(p, 'fear');
  const sad = Math.max(emotionLevel(p, 'distress'), emotionLevel(p, 'grief'));
  const trust = voiceOf(p, LEADER)?.trust ?? 0.5;
  const worst = p.body.injuries.reduce((a, b) => Math.max(a, b.severity), 0);
  return {
    stride: Math.max(0.3, 1 - 0.7 * fatigue),
    lean: 0.08 + 0.45 * fatigue,
    hunch: Math.min(1, fear * 1.4),
    limp: Math.min(1, pain * 0.8 + worst),
    gaze: Math.max(-1, Math.min(1, (trust - 0.45) * 3)),
    bowed: Math.min(1, sad * 1.2),
    blot: worst,
    downed: p.body.downed !== undefined,
    protest: p.activity?.protest === true,
  };
}
