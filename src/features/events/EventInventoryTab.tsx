import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { HeartHandshake, Info, PackagePlus, Search, ShoppingCart, Trash2, Wrench } from "lucide-react";
import { useEventData } from "@/hooks/useEventData";
import { useProducts } from "@/hooks/useProducts";
import { useAuthStore } from "@/stores/authStore";
import EmptyState from "@/components/shared/EmptyState";
import QuantityStepper from "@/components/shared/QuantityStepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { setBroughtQuantity, removeEventInventory } from "@/lib/repositories/eventInventoryRepository";
import { recordAdjustment } from "@/lib/repositories/productRepository";
import { computeEventInventoryStatus } from "@/lib/db/inventory";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Product } from "@/types";

export default function EventInventoryTab({ eventId, completed }: { eventId: string; completed: boolean }) {
  const { inventory } = useEventData(eventId);
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return inventory;
    return inventory.filter((i) => i.inventory.product_name.toLowerCase().includes(q));
  }, [inventory, query]);

  const totalBrought = inventory.reduce((s, i) => s + i.inventory.quantity_brought, 0);
  const totalSold = inventory.reduce((s, i) => s + i.sold, 0);
  const totalRemaining = inventory.reduce((s, i) => s + i.remaining, 0);

  return (
    <div className="space-y-4">
      {!completed && (
        <div className="flex items-start gap-2 rounded-xl bg-primary/5 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>
            Set how many of each item you're bringing. Prices are locked in for this event — changing a product later
            won't rewrite these numbers. When you mark the event completed, anything unsold returns to your stock.
          </p>
        </div>
      )}

      {inventory.length > 0 && (
        <div className="grid grid-cols-3 gap-2 rounded-xl border bg-card p-3 text-center">
          <div>
            <p className="text-[10px] font-medium uppercase text-muted-foreground">Brought</p>
            <p className="tabular text-lg font-bold">{totalBrought}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase text-muted-foreground">Sold</p>
            <p className="tabular text-lg font-bold text-emerald-600 dark:text-emerald-400">{totalSold}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase text-muted-foreground">Left</p>
            <p className="tabular text-lg font-bold">{totalRemaining}</p>
          </div>
        </div>
      )}

      {inventory.length === 0 ? (
        <EmptyState
          icon={PackagePlus}
          title="Nothing brought yet"
          description="Pick the products you're bringing and how many of each."
          action={
            !completed && (
              <Button onClick={() => setAddOpen(true)}>
                <PackagePlus className="h-4 w-4" /> Choose products
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search this event's stock…" className="pl-9" />
          </div>
          <ul className="space-y-2">
            {filtered.map((row) => (
              <InventoryRow key={row.inventory.id} row={row} completed={completed} eventId={eventId} />
            ))}
          </ul>
          {!completed && (
            <Button variant="outline" className="w-full" onClick={() => setAddOpen(true)}>
              <PackagePlus className="h-4 w-4" /> Add more products
            </Button>
          )}
        </>
      )}

      <AddProductsDialog open={addOpen} onOpenChange={setAddOpen} eventId={eventId} existing={inventory.map((i) => i.inventory.product_id)} />
    </div>
  );
}

function InventoryRow({
  row,
  completed,
  eventId,
}: {
  row: NonNullable<ReturnType<typeof useEventData>["inventory"][number]>;
  completed: boolean;
  eventId: string;
}) {
  const navigate = useNavigate();
  const inv = row.inventory;
  const soldOut = row.remaining <= 0;

  async function handleBrought(next: number) {
    try {
      await setBroughtQuantity(eventId, inv.product_id, next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update that quantity.");
    }
  }

  return (
    <li className="rounded-xl border bg-card p-3.5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn("truncate font-semibold", soldOut && "text-muted-foreground")}>{inv.product_name}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="tabular">{formatMoney(inv.selling_price)}</span>
            <span>· sold {row.sold}</span>
            <span className={cn(soldOut ? "font-semibold text-destructive" : "font-semibold text-foreground")}>
              · {soldOut ? "sold out" : `${row.remaining} left`}
            </span>
          </div>
        </div>
        {completed ? (
          <span className="tabular rounded-full bg-muted px-3 py-1.5 text-sm font-semibold text-muted-foreground">
            {row.sold}/{inv.quantity_brought}
          </span>
        ) : (
          <QuantityStepper value={inv.quantity_brought} onChange={handleBrought} min={0} max={9999} ariaLabel={`Bring ${inv.product_name}`} />
        )}
      </div>
      {!completed && (
        <div className="mt-2.5 flex items-center gap-2 border-t pt-2.5">
          <button
            onClick={() => navigate(`/sale?event=${eventId}`)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
          >
            <ShoppingCart className="h-3.5 w-3.5" /> Sell
          </button>
          <button
            onClick={() => void handleEventAdjust(eventId, inv.product_id, inv.product_name, "damaged")}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
          >
            <Wrench className="h-3.5 w-3.5" /> Damaged
          </button>
          <button
            onClick={() => void handleEventAdjust(eventId, inv.product_id, inv.product_name, "giveaway")}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
          >
            <HeartHandshake className="h-3.5 w-3.5" /> Given away
          </button>
          <button
            onClick={() => void removeEventInventory(inv.id).then(() => toast.success("Removed from this event"))}
            className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
            aria-label={`Remove ${inv.product_name} from event`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {row.eventAdjustmentTotal !== 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {row.eventAdjustmentTotal < 0 ? "Removed" : "Added"} {Math.abs(row.eventAdjustmentTotal)} here (damage / gifts)
        </p>
      )}
    </li>
  );
}

async function handleEventAdjust(eventId: string, productId: string, productName: string, reason: "damaged" | "giveaway") {
  const qty = window.prompt(
    reason === "damaged"
      ? `How many ${productName} were damaged at this event?`
      : `How many ${productName} did you give away at this event?`,
    "1",
  );
  if (qty === null) return;
  const n = Number(qty);
  if (!Number.isFinite(n) || n <= 0) {
    toast.error("Enter a number greater than zero.");
    return;
  }
  try {
    await recordAdjustment(productId, {
      reason,
      quantityChange: -n,
      note: reason === "damaged" ? "Damaged at event" : "Given away at event",
      eventId,
    });
    toast.success(reason === "damaged" ? "Recorded damaged items" : "Recorded given-away items");
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Couldn't record that change.");
  }
}

function AddProductsDialog({
  open,
  onOpenChange,
  eventId,
  existing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  eventId: string;
  existing: string[];
}) {
  const products = useProducts();
  const userId = useAuthStore((s) => s.userId);
  const [localQty, setLocalQty] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => !existing.includes(p.id) && (!q || p.name.toLowerCase().includes(q)));
  }, [products, existing, query]);

  async function handleConfirm() {
    const entries = Object.entries(localQty).filter(([, qty]) => qty > 0);
    if (entries.length === 0) {
      onOpenChange(false);
      return;
    }
    let failures = 0;
    for (const [productId, qty] of entries) {
      try {
        await setBroughtQuantity(eventId, productId, qty);
      } catch (err) {
        failures += 1;
        toast.error(err instanceof Error ? err.message : "Couldn't add one of the products.");
      }
    }
    setLocalQty({});
    setQuery("");
    onOpenChange(false);
    if (failures === 0) {
      toast.success(`Added ${entries.length} ${entries.length === 1 ? "product" : "products"} to this event`);
    }
    // Refresh remaining counts (useEventData liveQuery handles it automatically).
    if (userId) void computeEventInventoryStatus(eventId, userId);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bring products to this event</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your products…" className="pl-9" />
        </div>
        <div className="max-h-96 space-y-2 overflow-y-auto p-1">
          {candidates.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No other products to add. Create them under Products first.
            </p>
          )}
          {candidates.map((p: Product) => (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="tabular">{formatMoney(p.selling_price)}</span> · {p.current_inventory} available to bring
                </p>
              </div>
              <QuantityStepper
                value={localQty[p.id] ?? 0}
                onChange={(n) => setLocalQty((prev) => ({ ...prev, [p.id]: n }))}
                min={0}
                max={Math.max(0, p.current_inventory)}
                size="sm"
                ariaLabel={`Bring ${p.name}`}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Add to event</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
