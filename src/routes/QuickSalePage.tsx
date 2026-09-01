import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Banknote, CreditCard, Check, Minus, Plus, Receipt, ShoppingCart, Store, Wallet, X } from "lucide-react";
import { useEvents, sellableEvents, pickCurrentEvent } from "@/hooks/useEvents";
import { useAuthStore } from "@/stores/authStore";
import { useSyncStore } from "@/stores/syncStore";
import { useLiveQuery } from "dexie-react-hooks";
import { computeEventInventoryStatus } from "@/lib/db/inventory";
import EmptyState from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { recordSale, OversellError } from "@/lib/repositories/salesRepository";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EventInventoryStatus } from "@/lib/db/inventory";
import type { PaymentMethod } from "@/types";

export default function QuickSalePage() {
  const [params, setParams] = useSearchParams();
  const events = useEvents();
  const sellable = useMemo(() => sellableEvents(events), [events]);
  const defaultEvent = useMemo(() => pickCurrentEvent(events), [events]);

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const activeEventId = selectedEventId ?? params.get("event") ?? defaultEvent?.id ?? null;
  const [cart, setCart] = useState<Record<string, number>>({});
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [completing, setCompleting] = useState(false);

  const userId = useAuthStore((s) => s.userId);
  const syncStatus = useSyncStore((s) => s.status);

  const inventory: EventInventoryStatus[] =
    useLiveQuery(
      async () => (activeEventId && userId ? computeEventInventoryStatus(activeEventId, userId) : []),
      [activeEventId, userId],
      [],
    ) ?? [];

  const activeEvent = events.find((e) => e.id === activeEventId);

  // Keep URL in sync so back/refresh keeps the event choice.
  useEffect(() => {
    if (activeEventId && params.get("event") !== activeEventId) {
      setParams({ event: activeEventId }, { replace: true });
    }
  }, [activeEventId, params, setParams]);

  const cartLines = useMemo(() => {
    const lines: Array<{ row: EventInventoryStatus; qty: number }> = [];
    for (const row of inventory) {
      const qty = cart[row.inventory.product_id] ?? 0;
      if (qty > 0) lines.push({ row, qty });
    }
    return lines;
  }, [inventory, cart]);

  const cartTotal = cartLines.reduce((sum, l) => sum + l.qty * l.row.inventory.selling_price, 0);
  const cartCount = cartLines.reduce((sum, l) => sum + l.qty, 0);

  function bump(productId: string, delta: number, max: number) {
    setCart((prev) => {
      const current = prev[productId] ?? 0;
      const next = Math.min(max, Math.max(0, current + delta));
      return { ...prev, [productId]: next };
    });
  }

  async function handleComplete() {
    if (!activeEventId || cartLines.length === 0) return;
    setCompleting(true);
    try {
      const sale = await recordSale({
        eventId: activeEventId,
        paymentMethod: payment,
        lines: cartLines.map((l) => ({ productId: l.row.inventory.product_id, quantity: l.qty })),
      });
      setCart({});
      setSheetOpen(false);
      const offline = syncStatus === "offline";
      toast.success(`Sale saved · ${formatMoney(sale.total_amount)}`, {
        description: offline
          ? "You're offline — it's saved on this device and will sync later."
          : "Inventory and totals updated instantly.",
        duration: 3500,
      });
    } catch (err) {
      if (err instanceof OversellError) {
        toast.error(err.message, { description: "The stock count just changed — check the amounts." });
      } else {
        toast.error("Couldn't save that sale. Nothing was lost — try again.");
      }
    } finally {
      setCompleting(false);
    }
  }

  if (sellable.length === 0) {
    return (
      <EmptyState
        icon={Store}
        title="Nothing to sell at yet"
        description={
          events.length > 0
            ? "Your events are all finished. Create a new one to start selling."
            : "Create an event first — then bring your products and sell from here."
        }
        action={
          <Button asChild>
            <Link to="/events/new">Create an event</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Event picker */}
      <div className="flex items-center gap-2">
        <Select value={activeEventId ?? undefined} onValueChange={(v) => { setSelectedEventId(v); setCart({}); }}>
          <SelectTrigger aria-label="Choose event" className="flex-1">
            <SelectValue placeholder="Choose event" />
          </SelectTrigger>
          <SelectContent>
            {sellable.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
                {e.effective === "ongoing" ? " · today" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {activeEvent?.effective === "ongoing" && (
          <span className="shrink-0 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold text-primary-foreground">LIVE</span>
        )}
      </div>

      {inventory.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="No stock at this event yet"
          description="Prep your inventory first — pick what you're bringing and how many."
          action={
            <Button asChild variant="outline">
              <Link to={activeEventId ? `/events/${activeEventId}?tab=inventory` : "/events"}>Prep inventory</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {inventory.map((row) => {
            const inCart = cart[row.inventory.product_id] ?? 0;
            const remaining = row.remaining;
            const disabled = remaining <= 0 && inCart === 0;
            return (
              <li key={row.inventory.id}>
                <button
                  onClick={() => !disabled && bump(row.inventory.product_id, 1, remaining)}
                  disabled={disabled}
                  className={cn(
                    "relative flex h-full w-full flex-col rounded-xl border bg-card p-3.5 text-left shadow-sm transition-all active:scale-[0.98]",
                    inCart > 0 ? "border-primary ring-2 ring-primary/25" : "hover:border-primary/40",
                    disabled && "opacity-45",
                  )}
                >
                  {inCart > 0 && (
                    <span className="tabular absolute -right-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground shadow">
                      {inCart}
                    </span>
                  )}
                  <p className="line-clamp-2 min-h-10 text-sm font-semibold leading-tight">{row.inventory.product_name}</p>
                  <div className="mt-auto flex items-end justify-between pt-2">
                    <span className="tabular text-base font-bold">{formatMoney(row.inventory.selling_price)}</span>
                    <span
                      className={cn(
                        "tabular rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        remaining <= 0
                          ? "bg-destructive/10 text-destructive"
                          : remaining <= 2
                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      {remaining <= 0 ? "sold out" : `${remaining} left`}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Cart bar (sticky above bottom nav) */}
      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-[76px] z-20 px-4">
          <button
            onClick={() => setSheetOpen(true)}
            className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 rounded-2xl bg-primary px-5 py-3.5 text-primary-foreground shadow-xl shadow-primary/30 transition-transform active:scale-[0.99]"
          >
            <span className="flex items-center gap-2.5">
              <ShoppingCart className="h-5 w-5" />
              <span className="tabular text-sm font-semibold">
                {cartCount} {cartCount === 1 ? "item" : "items"}
              </span>
            </span>
            <span className="tabular text-lg font-bold">{formatMoney(cartTotal)}</span>
            <span className="rounded-full bg-primary-foreground/20 px-3 py-1 text-xs font-semibold">Review →</span>
          </button>
        </div>
      )}

      {/* Cart sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="mx-auto max-h-[85dvh] max-w-2xl rounded-t-2xl pb-safe">
          <SheetHeader className="pb-0">
            <SheetTitle className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2">
                <Receipt className="h-4 w-4" /> Current sale
              </span>
              <button
                onClick={() => setSheetOpen(false)}
                aria-label="Close"
                className="rounded-full p-1.5 text-muted-foreground hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </SheetTitle>
          </SheetHeader>

          <div className="max-h-[45dvh] space-y-2 overflow-y-auto px-4 pb-2 pt-1">
            {cartLines.map(({ row, qty }) => (
              <div key={row.inventory.product_id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{row.inventory.product_name}</p>
                  <p className="tabular text-xs text-muted-foreground">
                    {formatMoney(row.inventory.selling_price)} each · {row.remaining} left
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => bump(row.inventory.product_id, -1, row.remaining)}
                    className="flex h-9 w-9 items-center justify-center rounded-full border active:scale-90"
                    aria-label={`Remove one ${row.inventory.product_name}`}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="tabular w-6 text-center text-base font-bold">{qty}</span>
                  <button
                    onClick={() => bump(row.inventory.product_id, 1, row.remaining)}
                    disabled={qty >= row.remaining}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40 active:scale-90"
                    aria-label={`Add one ${row.inventory.product_name}`}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-4 px-4 pb-4 pt-1">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Payment</p>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { key: "cash", label: "Cash", icon: Banknote },
                    { key: "card", label: "Card", icon: CreditCard },
                    { key: "other", label: "Other", icon: Wallet },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setPayment(m.key)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs font-semibold transition-colors",
                      payment === m.key ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground",
                    )}
                  >
                    <m.icon className="h-4.5 w-4.5" />
                    {m.label}
                    {payment === m.key && <Check className="h-3 w-3" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-sm font-medium">Total</span>
              <span className="tabular text-2xl font-bold">{formatMoney(cartTotal)}</span>
            </div>

            <Button size="lg" className="h-14 w-full text-base font-bold" disabled={completing} onClick={handleComplete}>
              <Check className="mr-1 h-5 w-5" />
              {completing ? "Saving…" : "Complete Sale"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              {syncStatus === "offline"
                ? "You're offline — sales are saved on this device and sync later."
                : "Works instantly, even without internet."}
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
