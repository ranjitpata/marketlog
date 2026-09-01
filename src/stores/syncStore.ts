/**
 * Sync status store — the single source of truth for the UI sync badge.
 *
 * User-facing states (plain language, per the copy guidelines):
 *  - local-only: "This device" mode — no cloud configured.
 *  - synced: everything backed up to the cloud copy.
 *  - offline: "Offline — N changes waiting".
 *  - syncing: "Backing up…".
 *  - error: "Sync issue — Retry".
 *  - session: "Your session needs refreshing to sync — your data is safe on this device".
 */
import { create } from "zustand";
import type { SyncEngineStatus, SyncState } from "@/types";

interface SyncStore extends SyncState {
  setSyncing: () => void;
  setSynced: (queueCount?: number) => void;
  setOffline: (queueCount: number) => void;
  setError: (message: string | null, queueCount: number) => void;
  setSession: (message: string | null) => void;
  setLocalOnly: () => void;
  setQueueCount: (n: number) => void;
  requestRetry: () => void;
  /** nonce bumped by requestRetry; the engine reacts */
  retryNonce: number;
}

export const useSyncStore = create<SyncStore>()((set, get) => ({
  status: "local-only" as SyncEngineStatus,
  queueCount: 0,
  lastSyncAt: null,
  message: null,
  retryNonce: 0,

  setSyncing: () => set({ status: "syncing", message: null }),
  setSynced: (queueCount = 0) =>
    set({ status: "synced", queueCount, message: null, lastSyncAt: Date.now() }),
  setOffline: (queueCount) =>
    set({ status: "offline", queueCount, message: null }),
  setError: (message, queueCount) => set({ status: "error", message, queueCount }),
  setSession: (message) =>
    set({ status: "session", message }),
  setLocalOnly: () => set({ status: "local-only", queueCount: 0, message: null }),
  setQueueCount: (n) => set({ queueCount: n }),
  requestRetry: () => set({ retryNonce: get().retryNonce + 1, status: "syncing", message: null }),
}));
