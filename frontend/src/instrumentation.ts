export async function register() {
  // Node.js v22+ introduces a partial `localStorage` global that exists but has
  // non-functional methods (getItem is not a function) when --localstorage-file
  // is not configured. This breaks SSR for any component that references localStorage.
  // We patch it here with a no-op in-memory implementation so SSR never crashes.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (
      typeof globalThis.localStorage === 'undefined' ||
      typeof (globalThis.localStorage as any).getItem !== 'function'
    ) {
      const store: Record<string, string> = {};
      (globalThis as any).localStorage = {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => { store[key] = String(value); },
        removeItem: (key: string) => { delete store[key]; },
        clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
        get length() { return Object.keys(store).length; },
        key: (index: number) => Object.keys(store)[index] ?? null,
      };
    }
  }
}
