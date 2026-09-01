/* Vitest setup: fake IndexedDB + localStorage shims for node environment. */
import "fake-indexeddb/auto";

if (typeof (globalThis as { window?: unknown }).window === "undefined") {
  (globalThis as Record<string, unknown>).window = globalThis;
}

if (!(globalThis as { localStorage?: unknown }).localStorage) {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
}
