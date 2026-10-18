/// <reference lib="webworker" />
/** Runs the counterfactual replays off the main thread. */
import type { ClimbState } from '../sim/climb.ts';
import { debrief } from '../sim/debrief.ts';

self.onmessage = (e: MessageEvent<{ start: string; played: string }>) => {
  const played = JSON.parse(e.data.played) as ClimbState;
  const branch = debrief(e.data.start, played, 20);
  (self as unknown as Worker).postMessage({ branch });
};
