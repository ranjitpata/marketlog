/**
 * Conflict resolution — pure, unit-testable decision functions.
 *
 * Strategy (per the architecture):
 *  • sales, saleItems, inventoryAdjustments are APPEND-ONLY: if the row exists
 *    locally it is always kept (content is immutable; ids are client UUIDs, so
 *    a matching server row is the same append). Nothing is ever deleted.
 *  • Simple tables (profiles, products, events, eventInventory, expenses) use
 *    Last-Write-Wins by updated_at — but a local row with UNSYNCED changes
 *    always wins (it will be pushed later), and a "delete" is only ever a
 *    soft-delete applied from the server when the local copy is clean.
 *
 * The resolver NEVER returns a "delete local row" outcome — hard deletes don't
 * exist in this system; server soft-deletes are applied as data, and only when
 * there is no pending local change.
 */

export interface LocalRowLike {
  id: string;
  updated_at: string;
  deleted_at: string | null;
}

export type MergeDecision = "keep-local" | "take-server" | "skip";

export function resolveRow(
  local: LocalRowLike | undefined,
  serverUpdatedIsNewer: boolean,
  hasPendingLocalChanges: boolean,
  appendOnly: boolean,
): MergeDecision {
  // Row unknown on this device → adopt the server copy (e.g. new device).
  if (!local) return "take-server";

  // Append-only rows are immutable: local copy stands.
  if (appendOnly) return "keep-local";

  // Unsynced local edits always win; they'll be pushed on the next cycle.
  if (hasPendingLocalChanges) return "keep-local";

  // Clean local copy → Last-Write-Wins by updated_at.
  if (serverUpdatedIsNewer) return "take-server";
  return "skip";
}

/** Compare timestamps without timezone parsing surprises (ISO strings compare lexicographically). */
export function serverIsNewer(serverUpdatedAt: string, localUpdatedAt: string): boolean {
  return serverUpdatedAt > localUpdatedAt;
}
