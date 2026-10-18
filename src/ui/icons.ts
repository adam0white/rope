/** Monoline, hand-inked icons (24px viewBox, 1.6 stroke). */
const P: Record<string, string> = {
  up: 'M4 19 L10 9 L13 13 L16 6 L20 19 M16 6 L16 2 M16 2 L19 3.5 L16 5',
  down: 'M12 4 L12 18 M7 13 L12 18 L17 13',
  rest: 'M4 17 C8 15 16 15 20 17 M7 14 C7 10 10 9 12 9 C14 9 17 10 17 14 M12 6 L12 4',
  eat: 'M7 3 L7 21 M5 3 L5 8 C5 10 9 10 9 8 L9 3 M15 21 L15 3 C19 6 19 11 15 13',
  wait: 'M12 3 A9 9 0 1 0 12.01 3 M12 7 L12 12 L15.5 14',
  rope: 'M5 19 C9 15 6 11 10 9 C14 7 12 4 16 4 C19 4 20 7 18 9 C16 11 18 15 20 18',
  pack: 'M7 8 C7 5 17 5 17 8 L18 20 L6 20 Z M9 12 L15 12 M10 8 L10 5.5 M14 8 L14 5.5',
  tell: 'M4 6 C4 4 6 4 8 4 L18 4 C20 4 20 6 20 8 L20 12 C20 14 18 14 16 14 L10 14 L6 18 L7 14 C5 14 4 13 4 11 Z',
  promise: 'M12 3 A9 9 0 1 0 12.01 3 M12 12 L12 6 M12 12 L8 15',
  fix: 'M6 20 L6 4 M6 6 C10 8 14 4 18 6 M6 11 C10 13 14 9 18 11 M18 6 L18 11',
  share:
    'M4 13 L9 13 L13 16 L20 12 M9 13 L9 18 M12 9 C12 6 16 6 16 9 C16 11 12 12 12 12 C12 12 8 11 8 9 C8 6 12 6 12 9',
  stop: 'M6 6 L6 18 M18 6 L18 18',
  all: 'M5 20 L5 15 M5 12 A2 2 0 1 0 5.01 12 M12 20 L12 13 M12 10 A2 2 0 1 0 12.01 10 M19 20 L19 15 M19 12 A2 2 0 1 0 19.01 12',
  person: 'M12 21 L12 12 M12 9 A2.5 2.5 0 1 0 12.01 9 M8 21 L12 16 L16 21',
  journal: 'M6 3 L18 3 L18 21 L6 21 Z M9 8 L15 8 M9 12 L15 12 M9 16 L13 16',
};

export function icon(name: keyof typeof P | string): string {
  const d = P[name] ?? P.person;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}
