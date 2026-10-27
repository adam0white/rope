import { fileEntry } from './continuity.ts';

export { fileEntry };

import { createLab } from '@adam0white/lab-client';

// Resolve the host policy before starting even the normal Lab runtime.
export const startupEntry = fileEntry(location.search);
export const lab = createLab({ game: 'rope' });
