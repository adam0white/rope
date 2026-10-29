/** Full native HF archives exceed localStorage. Store the exact save string in IndexedDB. */
const DB = 'rope';
const STORE = 'pages';
const KEY = 'rope.save.cast.v1';
type Guard = () => boolean;
function legacy(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(Error('Native save database is blocked.'));
    };
  });
}
export async function load(): Promise<string | null> {
  if (typeof indexedDB === 'undefined') return legacy();
  let db: IDBDatabase | undefined;
  try {
    db = await open();
    const value = await new Promise<unknown>((resolve, reject) => {
      const tx = db!.transaction(STORE, 'readonly'),
        request = tx.objectStore(STORE).get(KEY);
      let result: unknown;
      request.onsuccess = () => {
        result = request.result;
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return typeof value === 'string' ? value : value === undefined ? legacy() : null;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}
let pending: Promise<unknown> = Promise.resolve();
function ordered(operation: () => Promise<boolean>): Promise<boolean> {
  const result = pending.then(operation);
  pending = result.catch(() => false);
  return result;
}
export function save(text: string, expected?: string | null, current: Guard = () => true): Promise<boolean> {
  return ordered(() => mutate(text, expected, current));
}
export function remove(expected?: string | null, current: Guard = () => true): Promise<boolean> {
  return ordered(() => mutate(null, expected, current));
}
async function mutate(
  text: string | null,
  expected: string | null | undefined,
  current: Guard,
): Promise<boolean> {
  if (!current()) return false;
  if (typeof indexedDB === 'undefined') {
    try {
      if ((expected !== undefined && legacy() !== expected) || !current()) return false;
      if (text === null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, text);
      return true;
    } catch {
      return false;
    }
  }
  let db: IDBDatabase | undefined;
  try {
    db = await open();
    if (!current()) return false;
    const result = await new Promise<{ applied: boolean; legacyBefore: string | null }>((resolve, reject) => {
      const tx = db!.transaction(STORE, 'readwrite'),
        store = tx.objectStore(STORE),
        request = store.get(KEY);
      let applied = false,
        legacyBefore: string | null = null;
      request.onsuccess = () => {
        legacyBefore = legacy();
        const value: unknown = request.result;
        if (value !== undefined && typeof value !== 'string') return;
        const previous = typeof value === 'string' ? value : legacyBefore;
        // This compare and the write share one transaction, including across browser tabs.
        if ((expected !== undefined && previous !== expected) || !current()) return;
        if (text === null) store.delete(KEY);
        else store.put(text, KEY);
        applied = true;
      };
      tx.oncomplete = () => resolve({ applied, legacyBefore });
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    if (result.applied && result.legacyBefore !== null && legacy() === result.legacyBefore) {
      try {
        localStorage.removeItem(KEY);
      } catch {}
    }
    return result.applied;
  } catch {
    return false;
  } finally {
    db?.close();
  }
}
