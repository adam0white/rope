import { createLab } from '@adam0white/lab-client';
import { fileEntry } from './continuity.ts';

export { fileEntry };

// Canonicalize before the SDK can resolve attribution, identity, storage or recording.
export const startupEntry = fileEntry(location.search, location.pathname);
if (startupEntry === 'file') {
  const canonical = new URL(location.href);
  canonical.pathname = '/file/';
  canonical.searchParams.delete('file');
  history.replaceState(history.state, '', canonical.href);
}
export const lab =
  startupEntry === 'invalid'
    ? null
    : createLab({ game: 'rope', ...(startupEntry === 'file' ? { preservation: 'preserve' as const } : {}) });
// No standard fallback and no replacement identity. Memory play remains available.
if (startupEntry === 'file' && lab?.preservationStatus !== 'existing-local') lab?.dispose();
