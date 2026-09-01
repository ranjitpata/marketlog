import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/dexie";
import { useAuthStore } from "@/stores/authStore";
import { effectiveEventStatus } from "@/lib/db/inventory";
import { todayStr } from "@/lib/format";
import type { MarketEvent } from "@/types";

export interface EventWithStatus extends MarketEvent {
  effective: "upcoming" | "ongoing" | "completed";
}

export function useEvents(): EventWithStatus[] {
  const userId = useAuthStore((s) => s.userId);
  const events =
    useLiveQuery(
      async () => {
        if (!userId) return [];
        return db.events
          .where("user_id")
          .equals(userId)
          .filter((e) => !e.deleted_at)
          .toArray();
      },
      [userId],
      [],
    ) ?? [];
  const today = todayStr();
  return events
    .map((e) => ({ ...e, effective: effectiveEventStatus(e, today) }))
    .sort((a, b) => b.start_date.localeCompare(a.start_date));
}

/**
 * The event Quick Sale / Dashboard should focus on: the event happening today,
 * else the next upcoming one, else the most recent one.
 */
export function pickCurrentEvent(events: EventWithStatus[]): EventWithStatus | null {
  const ongoing = events
    .filter((e) => e.effective === "ongoing")
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  if (ongoing.length > 0) return ongoing[0];
  const upcoming = events
    .filter((e) => e.effective === "upcoming")
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  if (upcoming.length > 0) return upcoming[0];
  return events[0] ?? null;
}

/** Sellable events for the Quick Sale selector (not completed). */
export function sellableEvents(events: EventWithStatus[]): EventWithStatus[] {
  return events.filter((e) => e.effective !== "completed");
}
