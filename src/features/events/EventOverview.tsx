import { Link } from "react-router-dom";
import { Boxes, Sparkles, TrendingUp } from "lucide-react";
import type { EventData } from "@/hooks/useEventData";
import StatCard from "@/components/shared/StatCard";
import { bestSellers } from "@/lib/calculations/analytics";
import { formatRate } from "@/lib/calculations/sellThrough";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";

interface Props {
  eventId: string;
  completed: boolean;
  boothFee: number;
  data: Pick<EventData, "inventory" | "saleItems" | "expenses" | "summary" | "totalBrought" | "totalSold" | "sellThrough">;
}

export default function EventOverview({ eventId, completed, boothFee, data }: Props) {
  const { inventory, saleItems, expenses, summary, totalBrought, totalSold, sellThrough } = data;
  const best = bestSellers(saleItems, { limit: 5 });
  const hasInventory = inventory.length > 0;
  const otherExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Revenue" value={formatMoney(summary.revenue)} tone="positive" icon={<TrendingUp className="h-3.5 w-3.5" />} />
        <StatCard
          label="Profit"
          value={formatMoney(summary.profit)}
          tone={summary.profit > 0 ? "positive" : summary.profit < 0 ? "negative" : "muted"}
          hint={summary.margin !== null ? `${summary.margin.toFixed(0)}% margin` : "No sales yet"}
        />
        <StatCard
          label="Costs"
          value={formatMoney(summary.expenses)}
          tone="muted"
          hint={`Booth ${formatMoney(boothFee)} + other ${formatMoney(otherExpenses)}`}
        />
        <StatCard label="Sell-through" value={formatRate(sellThrough)} tone="muted" hint={`${totalSold} of ${totalBrought} brought`} />
      </div>

      <StatCard
        label="Cost of goods sold"
        value={formatMoney(summary.cogs)}
        tone="muted"
        hint={`Selling ${formatMoney(summary.revenue)} cost you ${formatMoney(summary.cogs)} in materials`}
      />

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Best sellers</h3>
        {best.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            {hasInventory ? "No sales yet — they'll appear here." : "Add stock to this event, then start selling."}
          </p>
        ) : (
          <ol className="divide-y rounded-xl border bg-card">
            {best.map((b, i) => (
              <li key={b.productId} className="flex items-center gap-3 px-3.5 py-2.5">
                <span className="tabular flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{b.name}</p>
                  <p className="text-xs text-muted-foreground">{b.units} sold</p>
                </div>
                <span className="tabular text-sm font-semibold">{formatMoney(b.revenue)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {!completed && !hasInventory && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center">
          <Boxes className="h-8 w-8 text-primary" />
          <p className="font-semibold">Prep your stock</p>
          <p className="max-w-64 text-sm text-muted-foreground">
            Choose how many of each product you're bringing — prices are locked in for this event.
          </p>
          <Button asChild variant="outline">
            <Link to={`/events/${eventId}?tab=inventory`}>
              <Sparkles className="h-4 w-4" /> Prep inventory
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
