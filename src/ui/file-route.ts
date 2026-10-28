/** Old file links migrate to the protected route before any SDK initialization. */
export function legacyFileDestination(address: string): string | null {
  const url = new URL(address);
  if (!url.searchParams.has('file')) return null;
  url.pathname = '/file/';
  url.searchParams.delete('file');
  return url.href;
}

/** Do not load the game or SDK in the document being redirected. */
export function startAtAddress(
  address: string,
  redirect: (destination: string) => void,
  boot: () => void,
): void {
  const destination = legacyFileDestination(address);
  if (destination) redirect(destination);
  else boot();
}
