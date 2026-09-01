/**
 * Profile repository — one profile row per user (profile id === user id).
 */
import { db } from "@/lib/db/dexie";
import { updateEntity } from "./baseRepository";
import { enqueue } from "@/lib/sync/syncQueue";
import { notifyLocalChange } from "@/lib/sync/syncEvents";
import { nowIso } from "@/lib/format";
import type { Profile } from "@/types";

/** Create the local profile row if this user doesn't have one yet. Idempotent. */
export async function ensureProfile(userId: string, displayName: string, businessName: string | null = null): Promise<Profile> {
  const existing = await db.profiles.get(userId);
  if (existing && !existing.deleted_at) return existing;

  const now = nowIso();
  const profile: Profile = {
    id: userId, // profile id === user id by design
    user_id: userId,
    display_name: displayName,
    business_name: businessName,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    sync_status: "pending",
    local_updated_at: Date.now(),
    server_updated_at: null,
    version: 1,
    sync_error: null,
  };
  await db.transaction("rw", db.profiles, db.syncQueue, async () => {
    await db.profiles.put(profile);
    await enqueue({
      entityType: "profile",
      entityId: profile.id,
      userId,
      operation: "create",
      payload: { ...profile },
    });
  });
  notifyLocalChange();
  return profile;
}

export async function updateProfile(patch: Pick<Partial<Profile>, "display_name" | "business_name">, userId: string): Promise<void> {
  await updateEntity("profile", userId, patch);
}

export async function getProfile(userId: string): Promise<Profile | undefined> {
  return db.profiles.get(userId);
}
