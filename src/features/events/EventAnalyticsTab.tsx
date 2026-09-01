import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { useEventData } from "@/hooks/useEventData";
import EmptyState from "@/components/shared/EmptyState";
import { formatMoney } from "@/lib/format";
import { formatRate } from "@/lib/calculations/sellThrough";
import { revenueByPaymentMethod, salesByHour, bestSellers } from "@/lib/calculations/analytics";
import { calcSellThrough } from "@/lib/calculations/sellThrough";
import { cn } from "@/lib/utils";

export default function EventAnalyticsTab({ eventId }: { eventId: string }) {
  const { sales, saleItems, inventory, summary } = useEventData(eventId);

  const hourly = useMemo(() => salesByHour(sales), [sales]);
  const mix = useMemo(() => revenueByPaymentMethod(sales), [sales]);
  const rows = useMemo(() => bestSellers(saleItems, { limit: 10 }), [saleItems]);

  const maxRevenue = Math.max(1, ...hourly.map((h) => h.revenue));
  const mixTotal = mix.cash + mix.card + mix.other;

  if (sales.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No stats yet"
        description="Record a few sales and this page fills itself in — even while offline."
      />
    );
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Sales by hour</h3>
        <p className="text-xs text-muted-foreground">When the crowds showed up.</p>
        <div className="rounded-xl border bg-card p-3.5">
          <div className="flex h-28 items-end gap-1">
            {hourly.map((h) => (
              <div key={h.hour} className="group flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="tabular text-[9px] font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                  {formatMoney(h.revenue)}
                </span>
                <div
                  className="w-full rounded-t bg-primary/80 transition-all group-hover:bg-primary"
                  style={{ height: `${Math.max(4, (h.revenue / maxRevenue) * 100)}%` }}
                  role="img"
                  aria-label={`${h.hour}:00 — ${formatMoney(h.revenue)}, ${h.count} sales`}
                />
                <span className="tabular text-[9px] text-muted-foreground">{h.hour}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">How people paid</h3>
        <div className="rounded-xl border bg-card p-3.5">
          <div className="flex h-3 overflow-hidden rounded-full">
            {mixTotal > 0 && (
              <>
                <div className="bg-emerald-600 dark:bg-emerald-500" style={{ width: `${(mix.cash / mixTotal) * 100}%` }} />
                <div className="bg-sky-600 dark:bg-sky-500" style={{ width: `${(mix.card / mixTotal) * 100}%` }} />
                <div className="bg-muted-foreground/40" style={{ width: `${(mix.other / mixTotal) * 100}%` }} />
              </>
            )}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <PayStat label="Cash" amount={mix.cash} total={mixTotal} dot="bg-emerald-600 dark:bg-emerald-500" />
            <PayStat label="Card" amount={mix.card} total={mixTotal} dot="bg-sky-600 dark:bg-sky-500" />
            <PayStat label="Other" amount={mix.other} total={mixTotal} dot="bg-muted-foreground/40" />
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Sell-through by product</h3>
        <ul className="divide-y rounded-xl border bg-card">
          {inventory
            .slice()
            .sort((a, b) => b.sold - a.sold)
            .map((row) => {
              const rate = calcSellThrough(row.sold, row.inventory.quantity_brought);
              return (
                <li key={row.inventory.id} className="px-3.5 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{row.inventory.product_name}</p>
                    <span className="tabular text-sm font-semibold">{formatRate(rate)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        rate !== null && rate >= 75 ? "bg-emerald-600 dark:bg-emerald-500" : "bg-primary/70",
                      )}
                      style={{ width: `${rate === null ? 0 : Math.min(100, Math.max(rate, 3))}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.sold} sold of {row.inventory.quantity_brought} brought · {formatMoney(row.sold * row.inventory.selling_price)} revenue
                  </p>
                </li>
              );
            })}
          {inventory.length === 0 && (
            <li className="px-3.5 py-4 text-center text-sm text-muted-foreground">No stock was prepared for this event.</li>
          )}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Product ranking</h3>
        <ol className="divide-y rounded-xl border bg-card">
          {rows.map((r, i) => (
            <li key={r.productId} className="flex items-center gap-3 px-3.5 py-2.5">
              <span className="tabular w-5 text-right text-xs font-bold text-muted-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">{r.units} units · {formatMoney(r.profit)} profit</p>
              </div>
              <span className="tabular text-sm font-semibold">{formatMoney(r.revenue)}</span>
            </li>
          ))}
        </ol>
      </section>

      <p className="text-center text-xs text-muted-foreground">
        Margin {summary.margin !== null ? `${summary.margin.toFixed(1)}%` : "—"} · all numbers from this device.
      </p>
    </div>
  );
}

function PayStat({ label, amount, total, dot }: { label: string; amount: number; total: number; dot: string }) {
  return (
    <div>
      <div className="flex items-center justify-center gap-1.5">
        <span className={cn("h-2 w-2 rounded-full", dot)} />
        <span className="text-[10px] font-medium uppercase text-muted-foreground">{label}</span>
      </div>
      <p className="tabular text-sm font-bold">{formatMoney(amount)}</p>
      <p className="text-[10px] text-muted-foreground">{total > 0 ? Math.round((amount / total) * 100) : 0}%</p>
    </div>
  );
}
