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
    // Exaggerated on purpose: on a phone a figure is 20 px tall, and the state must read at a glance.
    stride: Math.max(0.25, 1 - 0.85 * fatigue),
    lean: 0.06 + 0.75 * fatigue,
    hunch: Math.min(1, fear * 2),
    limp: Math.min(1, pain * 0.8 + worst),
    gaze: Math.max(-1, Math.min(1, (trust - 0.45) * 3)),
    bowed: Math.min(1, sad * 1.2),
    blot: worst,
    downed: p.body.downed !== undefined,
    protest: p.activity?.protest === true,
  };
}

/**
 * One word for the chip, the strongest of what shows: a reading of the figure, not a measurement. Empty when
 * nothing stands out. `cold` is the scene's cold at their spot, 0..1.
 */
export function moodWord(p: Person, cold: number): string {
  const r = readPerson(p);
  if (p.body.downed !== undefined) return 'down hurt';
  const fatigue = r.body.fatigue;
  const fear = emotionLevel(p, 'fear');
  const sad = Math.max(emotionLevel(p, 'distress'), emotionLevel(p, 'grief'));
  const pain = r.body.perceived.pain;
  const cands: [number, string][] = [
    [fatigue > 0.8 ? fatigue + 0.2 : fatigue - 0.12, fatigue > 0.8 ? 'spent' : 'tired'],
    [fear * 1.3, 'scared'],
    [cold * 0.8, 'cold'],
    [pain * 1.2, 'hurting'],
    [sad * 1.1, 'low'],
  ];
  cands.sort((a, b) => b[0] - a[0]);
  const top = cands[0];
  if (top && top[0] > 0.45) return top[1];
  const trust = voiceOf(p, LEADER)?.trust ?? 0.5;
  return fatigue < 0.25 && trust > 0.6 ? 'keen' : '';
}
