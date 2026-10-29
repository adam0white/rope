/** Host-authored evidence and requests. Every faculty change goes through public step. */

import { preview } from '@adam0white/human-framework';
import type { ClimbState } from './climb.ts';
import {
  type Affordance,
  enqueue,
  hfRunOf,
  MINUTE,
  need,
  type Percept,
  type Person,
  perceptFor,
} from './hf4.ts';
export function receive(s: ClimbState, p: Person, percepts: Percept[]) {
  enqueue(s, 'observation.received', {
    person: p.id,
    evidenceId: `rope-evidence:${s.minute}:${p.id}:${s.hfQueue.length}`,
    percepts: percepts.map((v, i) =>
      perceptFor(v, `rope-percept:${s.minute}:${p.id}:${s.hfQueue.length}:${i}`, s),
    ),
  });
}
export function setGoal(
  s: ClimbState,
  p: Person,
  data: {
    id?: string;
    label: string;
    serves: ('safety' | 'security' | 'tradition' | 'benevolence' | 'achievement' | 'competence')[];
    advancedBy: { action: string; amount: number }[];
    importance: number;
    temporal?: { halfLifeMinutes: number };
    deadline?: number;
  },
) {
  enqueue(s, 'agenda.requested', {
    person: p.id,
    request: {
      type: 'goal',
      goal: {
        id: data.id ?? `goal:${p.id}:${s.minute}:${s.hfQueue.length}`,
        label: data.label,
        serves: data.serves,
        advancedBy: data.advancedBy,
        importance: data.importance,
        baseImportance: data.importance,
        progress: 0,
        completionHalfLifeMs: (data.temporal?.halfLifeMinutes ?? 240) * MINUTE,
        ...(data.deadline === undefined ? {} : { deadline: data.deadline * MINUTE }),
      },
    },
  });
}
export function endGoal(s: ClimbState, p: Person, id: string) {
  enqueue(s, 'agenda.requested', { person: p.id, request: { type: 'abandon-goal', goalId: id } });
}
export function commit(
  s: ClimbState,
  p: Person,
  data: {
    kind: 'promise' | 'duty';
    toId?: string;
    actions: string[];
    from: number;
    until: number;
    importance: number;
    label: string;
  },
) {
  enqueue(s, 'agenda.requested', {
    person: p.id,
    request: {
      type: 'commit',
      commitment: {
        ...data,
        id: `commitment:${p.id}:${s.minute}:${s.hfQueue.length}`,
        from: Math.round(data.from * MINUTE),
        until: Math.round(data.until * MINUTE),
      },
    },
  });
}
export function interruptActivity(s: ClimbState, p: Person, reason: string) {
  if (!p.activity) return;
  const activityId = p.activity.id;
  if (
    s.hfQueue.some(
      (i) =>
        i.kind === 'activity.interrupted' && i.payload.person === p.id && i.payload.activityId === activityId,
    )
  )
    return;
  enqueue(s, 'activity.interrupted', { person: p.id, activityId, reason });
}
export function forecast(s: ClimbState, p: Person, offer: Affordance) {
  const current = Math.round(p.now * MINUTE);
  const result = need(
    preview(hfRunOf(s), {
      perspective: { kind: 'person', observer: p.id },
      person: p.id,
      until: current + Math.round(offer.duration * MINUTE),
      inputs: [],
      bodyForecast: [
        {
          label: offer.label,
          durationMs: Math.round(offer.duration * MINUTE),
          load: { effort: offer.effort, focus: offer.focus ?? 0, mode: offer.mode ?? 'awake' },
        },
      ],
    }),
  );
  // Preview's conditional basis stays hypothetical. It is never a live verdict or physical outcome.
  return {
    line: result.bodyForecast
      ? 'This considers only the stated work; conditions and the way back may change.'
      : '',
  };
}
