/** Trail routes for explicit short approaches. Existing pursuit does not use these rules. */
import type { Move, Pos } from './climb.ts';
import { DESCENT_FACTOR, type Mountain } from './mountain.ts';

export interface Segment {
  leg: string;
  fromT: number;
  toT: number;
  minutes: number;
}
export interface GatherPlan {
  with: string;
  point: Pos;
  segments: Segment[];
  started: number;
  until: number;
}

/** Split legs at both positions, then find the shortest directed walking-time route. */
export function trailRoute(m: Mountain, from: Pos, to: Pos): Segment[] {
  const node = (p: Pos) => p.place ?? `${p.leg}@${p.t}`;
  const graph = new Map<string, { to: string; segment: Segment }[]>();
  for (const leg of m.legs) {
    const stops = [
      { t: 0, id: leg.from },
      { t: 1, id: leg.to },
    ];
    for (const p of [from, to]) if (p.leg === leg.id) stops.push({ t: p.t, id: node(p) });
    stops.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1];
      const b = stops[i];
      if (!a || !b) continue;
      for (const [start, end] of [
        [a, b],
        [b, a],
      ]) {
        if (!start || !end) continue;
        const segment = {
          leg: leg.id,
          fromT: start.t,
          toT: end.t,
          minutes: leg.minutes * Math.abs(end.t - start.t) * (end.t < start.t ? DESCENT_FACTOR : 1),
        };
        const edges = graph.get(start.id) ?? [];
        edges.push({ to: end.id, segment });
        graph.set(start.id, edges);
      }
    }
  }
  const costs = new Map([[node(from), 0]]);
  const previous = new Map<string, { from: string; segment: Segment }>();
  const done = new Set<string>();
  while (true) {
    const next = [...costs].filter(([id]) => !done.has(id)).sort((a, b) => a[1] - b[1])[0];
    if (!next || next[0] === node(to)) break;
    done.add(next[0]);
    for (const edge of graph.get(next[0]) ?? []) {
      const cost = next[1] + edge.segment.minutes;
      if (cost < (costs.get(edge.to) ?? Infinity)) {
        costs.set(edge.to, cost);
        previous.set(edge.to, { from: next[0], segment: edge.segment });
      }
    }
  }
  const result: Segment[] = [];
  let id = node(to);
  while (id !== node(from)) {
    const prev = previous.get(id);
    if (!prev) return [];
    if (prev.segment.minutes > 0) result.unshift(prev.segment);
    id = prev.from;
  }
  return result;
}

export function segmentMove(segment: Segment, start: number): Move {
  return {
    leg: segment.leg,
    dir: segment.toT > segment.fromT ? 'up' : 'down',
    fromT: segment.fromT,
    toT: segment.toT,
    start,
    end: start + segment.minutes,
  };
}
