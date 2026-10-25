/** Display only. These labels come from the pinned HF cast and remain unchanged in saved records. */
const castPromises: ReadonlyArray<readonly [string, string]> = [
  ['I promised: down before dark, as I told Mum.', 'I promised Mum I would be back before dark.'],
  ['I promised: leave the tin on the top.', 'I promised to leave the tin on the summit.'],
];

export function displayText(text: string): string {
  let result = text;
  for (const [before, after] of castPromises) result = result.replaceAll(before, after);
  return result;
}
