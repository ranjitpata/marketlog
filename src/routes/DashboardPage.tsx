import { Link } from "react-router-dom";
import { ArrowRight, CalendarPlus, ChevronRight, MapPin, Package, ReceiptText, ShoppingCart, Sparkles, TrendingUp, Wallet } from "lucide-react";
import { useDashboard } from "@/hooks/useDashboard";
import { useAuthStore } from "@/stores/authStore";
import { useProducts } from "@/hooks/useProducts";
import EmptyState from "@/components/shared/EmptyState";
import StatCard from "@/components/shared/StatCard";
import InstallBanner from "@/features/pwa/InstallBanner";
import { Button } from "@/components/ui/button";
import { formatDateMedium, formatMoney, relativeDay } from "@/lib/format";
import { cn } from "@/lib/utils";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const { currentEvent, currentEventRevenue, monthRevenue, monthProfit, monthExpenses, monthSaleCount, topProducts, recentEvents, hasAnyData } =
    useDashboard();
  const profile = useAuthStore((s) => s.email);
  const products = useProducts();
  void profile;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">{greeting()}</p>
        <h2 className="text-xl font-bold tracking-tight">
          {relativeDay(new Date().toISOString().slice(0, 10))} at your stall
        </h2>
      </div>

      <InstallBanner />

      {!hasAnyData && products.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Welcome to MarketLog"
          description="Track what you sell at craft fairs and markets — even with no signal at the venue. Start by adding a product."
          action={
            <Button asChild>
              <Link to="/products/new">
                <Package className="h-4 w-4" /> Add your first product
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          {/* Current / next event */}
          {currentEvent ? (
            <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <div
                className={cn(
                  "flex items-center justify-between gap-2 px-4 py-2.5",
                  currentEvent.effective === "ongoing" ? "bg-primary text-primary-foreground" : "bg-muted/60",
                )}
              >
                <p className="text-xs font-semibold uppercase tracking-wide">
                  {currentEvent.effective === "ongoing" ? "Happening now" : "Next up"}
                </p>
                <Link
                  to={`/events/${currentEvent.id}`}
                  className={cn(
                    "inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline",
                    currentEvent.effective === "ongoing" ? "text-primary-foreground" : "text-primary",
                  )}
                >
                  Details <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-semibold">{currentEvent.name}</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {currentEvent.start_date === currentEvent.end_date
                        ? formatDateMedium(currentEvent.start_date)
                        : `${formatDateMedium(currentEvent.start_date)} – ${formatDateMedium(currentEvent.end_date)}`}
                      {" · "}
                      {relativeDay(currentEvent.start_date)}
                    </p>
                    {currentEvent.location && (
                      <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" /> {currentEvent.location}
                      </p>
                    )}
                  </div>
                  {currentEvent.effective === "ongoing" && currentEventRevenue > 0 && (
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] font-medium uppercase text-muted-foreground">Event revenue</p>
                      <p className="tabular text-lg font-bold text-emerald-600 dark:text-emerald-400">
                        {formatMoney(currentEventRevenue)}
                      </p>
                    </div>
                  )}
                </div>
                {currentEvent.effective !== "completed" && (
                  <div className="mt-3.5 grid grid-cols-2 gap-2">
                    <Button asChild size="lg" className="h-12">
                      <Link to={`/sale?event=${currentEvent.id}`}>
                        <ShoppingCart className="h-4 w-4" /> Record a sale
                      </Link>
                    </Button>
                    <Button asChild size="lg" variant="outline" className="h-12">
                      <Link to={`/events/${currentEvent.id}?tab=inventory`}>
                        <Package className="h-4 w-4" /> Prep stock
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            </section>
          ) : (
            <EmptyState
              icon={CalendarPlus}
              title="No events yet"
              description="Add your next market or fair — MarketLog will track what sells and what you earn."
              action={
                <Button asChild>
                  <Link to="/events/new">
                    <CalendarPlus className="h-4 w-4" /> Create an event
                  </Link>
                </Button>
              }
            />
          )}

          {/* Month snapshot */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">
              {new Intl.DateTimeFormat(undefined, { month: "long" }).format(new Date())} so far
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <StatCard
                label="Revenue"
                value={formatMoney(monthRevenue)}
                tone="positive"
                hint={`${monthSaleCount} ${monthSaleCount === 1 ? "sale" : "sales"}`}
                icon={<TrendingUp className="h-3.5 w-3.5" />}
              />
              <StatCard
                label="Profit"
                value={formatMoney(monthProfit)}
                tone={monthProfit > 0 ? "positive" : monthProfit < 0 ? "negative" : "muted"}
                hint={`after ${formatMoney(monthExpenses)} costs`}
                icon={<Wallet className="h-3.5 w-3.5" />}
              />
            </div>
          </section>

          {/* Top products */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Top products · last 30 days</h3>
              <Link to="/products" className="text-xs font-medium text-primary hover:underline">
                All products
              </Link>
            </div>
            {topProducts.length === 0 ? (
              <p className="rounded-xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">
                No sales in the last 30 days yet.
              </p>
            ) : (
              <ol className="divide-y rounded-xl border bg-card">
                {topProducts.slice(0, 3).map((b, i) => (
                  <li key={b.productId}>
                    <Link to={`/products/${b.productId}`} className="flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-accent/50">
                      <span className="tabular flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{b.name}</p>
                        <p className="text-xs text-muted-foreground">{b.units} sold</p>
                      </div>
                      <span className="tabular text-sm font-semibold">{formatMoney(b.revenue)}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Recent events */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Recent events</h3>
              <Link to="/events" className="text-xs font-medium text-primary hover:underline">
                All events
              </Link>
            </div>
            <ul className="divide-y rounded-xl border bg-card">
              {recentEvents.map((e) => (
                <li key={e.id}>
                  <Link to={`/events/${e.id}`} className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-accent/50">
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                        e.effective === "completed" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
                      )}
                    >
                      <ReceiptText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.name}</p>
                      <p className="text-xs text-muted-foreground">{formatDateMedium(e.start_date)}</p>
                    </div>
                    <span className="tabular text-sm font-semibold">
                      {e.revenue > 0 ? formatMoney(e.revenue) : "—"}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
