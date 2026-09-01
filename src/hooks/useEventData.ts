import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/dexie";
import { useAuthStore } from "@/stores/authStore";
import { computeEventInventoryStatus, type EventInventoryStatus } from "@/lib/db/inventory";
import { calcEventSummary, type EventProfitSummary } from "@/lib/calculations/profit";
import type { EventExpense, MarketEvent, Sale, SaleItem } from "@/types";

export interface EventData {
  event: MarketEvent | undefined;
  inventory: EventInventoryStatus[];
  sales: Sale[];
  saleItems: SaleItem[];
  expenses: EventExpense[];
  summary: EventProfitSummary;
  totalBrought: number;
  totalSold: number;
  sellThrough: number | null;
  loading: boolean;
}

/** Everything the Event Detail screen needs — all from IndexedDB, reactive. */
export function useEventData(eventId: string | undefined): EventData {
  const userId = useAuthStore((s) => s.userId);

  const event = useLiveQuery(async () => (eventId ? db.events.get(eventId) : undefined), [eventId]);
  const inventory = useLiveQuery(
    async () => (eventId && userId ? computeEventInventoryStatus(eventId, userId) : []),
    [eventId, userId],
    [],
  );
  const sales = useLiveQuery(
    async () => {
      if (!eventId || !userId) return [];
      return db.sales
        .where("event_id")
        .equals(eventId)
        .filter((s) => s.user_id === userId && !s.deleted_at)
        .reverse()
        .sortBy("sold_at");
    },
    [eventId, userId],
    [],
  );
  const saleItems = useLiveQuery(
    async () => {
      if (!eventId || !userId) return [];
      return db.saleItems
        .where("event_id")
        .equals(eventId)
        .filter((si) => si.user_id === userId && !si.deleted_at)
        .toArray();
    },
    [eventId, userId],
    [],
  );
  const expenses = useLiveQuery(
    async () => {
      if (!eventId || !userId) return [];
      return db.eventExpenses
        .where("event_id")
        .equals(eventId)
        .filter((e) => e.user_id === userId && !e.deleted_at)
        .toArray();
    },
    [eventId, userId],
    [],
  );

  const summary = useMemo(
    () => calcEventSummary(event ?? { booth_fee: 0 }, saleItems, expenses),
    [event, saleItems, expenses],
  );

  const totalBrought = useMemo(() => inventory.reduce((sum, i) => sum + i.inventory.quantity_brought, 0), [inventory]);
  const totalSold = useMemo(() => inventory.reduce((sum, i) => sum + i.sold, 0), [inventory]);
  const sellThrough = totalBrought > 0 ? (totalSold / totalBrought) * 100 : null;

  return {
    event,
    inventory,
    sales,
    saleItems,
    expenses,
    summary,
    totalBrought,
    totalSold,
    sellThrough,
    loading: event === undefined,
  };
}
