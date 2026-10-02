import { useEffect, useState } from 'preact/hooks';
import { defaultLists, sanitizeLists, type Shortlist } from './shortlists';

/**
 * Per-visitor state kept in localStorage and shared between the islands on a
 * page (and other tabs). Storage can be unavailable or throw, so every access
 * is guarded and the page keeps working from in-memory state.
 */

interface Store<T> {
  get(): T;
  set(value: T): void;
  subscribe(listener: () => void): () => void;
}

function createStore<T>(key: string, fallback: () => T, sanitize: (value: unknown) => T): Store<T> {
  let cached: T | null = null;
  const listeners = new Set<() => void>();

  const read = (): T => {
    try {
      const stored = globalThis.localStorage?.getItem(key);
      return stored === null || stored === undefined ? fallback() : sanitize(JSON.parse(stored));
    } catch {
      return fallback();
    }
  };
  const notify = () => listeners.forEach((listener) => listener());

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key !== key) return;
      cached = read();
      notify();
    });
  }

  return {
    get() {
      cached ??= read();
      return cached;
    },
    set(value) {
      cached = value;
      try {
        globalThis.localStorage?.setItem(key, JSON.stringify(value));
      } catch {
        // Private mode or a full quota: keep the change for this page view only.
      }
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Subscribes a component to a store. The first render uses the fallback so it
 * matches the server-rendered HTML; the stored value arrives right after.
 */
function useStore<T>(store: Store<T>, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    setValue(store.get());
    return store.subscribe(() => setValue(store.get()));
  }, [store]);
  return [value, store.set];
}

export const MAX_COMPARE = 4;

function sanitizeIds(value: unknown): number[] {
  const ids = Array.isArray(value) ? value.filter((id) => Number.isInteger(id) && id > 0) : [];
  return [...new Set(ids as number[])].slice(0, MAX_COMPARE);
}

const listsStore = createStore<Shortlist[]>('agr:lists:v1', defaultLists, sanitizeLists);
const compareStore = createStore<number[]>('agr:compare:v1', () => [], sanitizeIds);
const EMPTY_LISTS = defaultLists();
const EMPTY_IDS: number[] = [];

export function useShortlists(): [Shortlist[], (lists: Shortlist[]) => void] {
  return useStore(listsStore, EMPTY_LISTS);
}

/** Repository ids queued for comparison, at most `MAX_COMPARE`. */
export function useCompare(): [number[], (ids: number[]) => void] {
  const [ids, set] = useStore(compareStore, EMPTY_IDS);
  return [ids, (next) => set(sanitizeIds(next))];
}

/** A plain remembered preference, such as the list/card view. */
export function readPreference(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(`agr:${key}`) ?? null;
  } catch {
    return null;
  }
}

export function writePreference(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(`agr:${key}`, value);
  } catch {
    // Not persisted; nothing else depends on it.
  }
}
