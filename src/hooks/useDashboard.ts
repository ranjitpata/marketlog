import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/dexie";
import { useAuthStore } from "@/stores/authStore";
import { useEvents, pickCurrentEvent, type EventWithStatus } from "./useEvents";
import { bestSellers, inMonth, summarizeMonth, type BestSellerRow } from "@/lib/calculations/analytics";
import { calcProfit } from "@/lib/calculations/profit";
import type { Sale, SaleItem } from "@/types";

export interface DashboardData {
  currentEvent: EventWithStatus | null;
  currentEventRevenue: number;
  monthRevenue: number;
  monthGrossProfit: number;
  monthExpenses: number;
  monthProfit: number;
  monthSaleCount: number;
  topProducts: BestSellerRow[];
  recentEvents: Array<EventWithStatus & { revenue: number }>;
  hasAnyData: boolean;
}

export function useDashboard(): DashboardData {
  const userId = useAuthStore((s) => s.userId);
  const events = useEvents();

  const allSales = useLiveQuery(
    async () => {
      if (!userId) return [] as Sale[];
      return db.sales.where("user_id").equals(userId).filter((s) => !s.deleted_at).toArray();
    },
    [userId],
    [],
  ) ?? [];

  const allItems = useLiveQuery(
    async () => {
      if (!userId) return [] as SaleItem[];
      return db.saleItems.where("user_id").equals(userId).filter((si) => !si.deleted_at).toArray();
    },
    [userId],
    [],
  ) ?? [];

  const allExpenses = useLiveQuery(
    async () => {
      if (!userId) return [] as import("@/types").EventExpense[];
      return db.eventExpenses.where("user_id").equals(userId).filter((e) => !e.deleted_at).toArray();
    },
    [userId],
    [],
  ) ?? [];

  const currentEvent = useMemo(() => pickCurrentEvent(events), [events]);

  return useMemo(() => {
    const monthKey = new Date().toISOString().slice(0, 7);

    const monthSales = allSales.filter((s) => inMonth(s.sold_at, monthKey));
    const monthSummary = summarizeMonth(monthSales);

    const monthExpenseRows = allExpenses.filter((e) => inMonth(e.expense_date, monthKey));
    const monthBoothFees = events
      .filter((e) => inMonth(e.start_date, monthKey))
      .reduce((sum, e) => sum + e.booth_fee, 0);
    const monthExpenses = monthExpenseRows.reduce((sum, e) => sum + e.amount, 0) + monthBoothFees;
    const monthProfit = calcProfit(monthSummary.revenue, monthSummary.cogs, monthExpenses);

    // Top products over the last 30 days.
    const cutoff = Date.now() - 30 * 86_400_000;
    const recentSaleIds = new Set(allSales.filter((s) => new Date(s.sold_at).getTime() >= cutoff).map((s) => s.id));
    const recentItems = allItems.filter((i) => recentSaleIds.has(i.sale_id));
    const topProducts = bestSellers(recentItems, { limit: 5 });

    const currentEventRevenue = currentEvent
      ? allSales.filter((s) => s.event_id === currentEvent.id).reduce((sum, s) => sum + s.total_amount, 0)
      : 0;

    const recentEvents = events.slice(0, 3).map((e) => ({
      ...e,
      revenue: allSales.filter((s) => s.event_id === e.id).reduce((sum, s) => sum + s.total_amount, 0),
    }));

    return {
      currentEvent,
      currentEventRevenue,
      monthRevenue: monthSummary.revenue,
      monthGrossProfit: monthSummary.grossProfit,
      monthExpenses,
      monthProfit,
      monthSaleCount: monthSummary.saleCount,
      topProducts,
      recentEvents,
      hasAnyData: events.length > 0 || allSales.length > 0,
    };
  }, [events, allSales, allItems, allExpenses, currentEvent]);
}
