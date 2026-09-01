/**
 * Tiny event bus that lets the repository layer wake the sync engine after a
 * local write, without either module importing the other (breaks the cycle:
 * repositories → events ← syncEngine).
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function onLocalChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Called after every committed local mutation. Never awaited by callers. */
export function notifyLocalChange(): void {
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* listener errors must never affect the write path */
    }
  }
}
