import { displayRouteLabels, SEASON } from '../sim/mountain.ts';

/** Display only. These labels come from the pinned HF cast and remain unchanged in saved records. */
const castPromises: ReadonlyArray<readonly [string, string]> = [
  ['I promised: down before dark, as I told Mum.', 'I promised Mum I would be back before dark.'],
  ['I promised: leave the tin on the top.', 'I promised to leave the tin on the summit.'],
];

// HF retains these exact action labels in memory. Only the displayed sentence changes.
const rememberedClimbs = [...new Set(SEASON.flatMap((m) => m.legs.map((leg) => leg.name)))].map(
  (name) =>
    [
      `I remember what happened last time: I could not complete this action: climb ${name}.`,
      `Last time, I could not climb ${name}.`,
    ] as const,
);

export function displayText(text: string): string {
  let result = text;
  for (const [before, after] of castPromises) result = result.replaceAll(before, after);
  for (const [before, after] of rememberedClimbs) result = result.replaceAll(before, after);
  return displayRouteLabels(result);
}
