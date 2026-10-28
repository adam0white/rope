import { createLab } from '@adam0white/lab-client';
import { fileEntry } from './continuity.ts';

export { fileEntry };

// The entry path alone selects preservation. Legacy URLs redirect before this module loads.
export const startupEntry = fileEntry(location.pathname);
export const lab = createLab({
  game: 'rope',
  ...(startupEntry === 'file' ? { preservation: 'preserve' as const } : {}),
});
// No standard fallback and no replacement identity. Memory play remains available.
if (startupEntry === 'file' && lab?.preservationStatus !== 'existing-local') lab?.dispose();
