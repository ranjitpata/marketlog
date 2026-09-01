import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, PackageSearch, Pencil, PlusCircle, Trash2, HeartHandshake, Wrench } from "lucide-react";
import { useProduct } from "@/hooks/useProducts";
import { useProductDetail } from "@/hooks/useProductDetail";
import ProductForm from "@/features/products/ProductForm";
import EmptyState from "@/components/shared/EmptyState";
import StatCard from "@/components/shared/StatCard";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import StockAdjustDialog from "@/features/products/StockAdjustDialog";
import { Button } from "@/components/ui/button";
import { softDeleteProduct, recordAdjustment } from "@/lib/repositories/productRepository";
import { formatMoney, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { effectiveEventStatus } from "@/lib/db/inventory";

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const product = useProduct(id);
  const { movements, unitsSoldAllTime, revenueAllTime } = useProductDetail(id);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState<"restock" | "damaged" | "giveaway" | null>(null);

  if (!product) {
    return (
      <EmptyState
        icon={PackageSearch}
        title="Product not found"
        description="It may have been removed."
        action={<Button onClick={() => navigate("/products")}>Back to products</Button>}
      />
    );
  }

  if (editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edit product</h2>
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Done
          </Button>
        </div>
        <ProductForm product={product} />
      </div>
    );
  }

  const low = product.low_stock_threshold !== null && product.current_inventory <= product.low_stock_threshold;

  async function handleAdjust(reason: "restock" | "damaged" | "giveaway", quantityChange: number, note: string | null) {
    if (!product || quantityChange === 0) return;
    try {
      await recordAdjustment(product.id, { reason, quantityChange, note });
      toast.success("Stock count updated", { description: "Saved on this device." });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't record that change.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{product.name}</h2>
            <p className="text-sm text-muted-foreground">
              {product.category ? `${product.category} · ` : ""}
              {product.sku ?? ""}
            </p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Edit product" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-3 flex items-baseline gap-3">
          <span className="tabular text-2xl font-bold">{formatMoney(product.selling_price)}</span>
          <span className="text-xs text-muted-foreground">costs you {formatMoney(product.cost_price)} each</span>
        </div>
        {product.description && <p className="mt-2 text-sm text-muted-foreground">{product.description}</p>}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatCard
          label="In stock"
          value={String(product.current_inventory)}
          tone={product.current_inventory <= 0 ? "negative" : low ? "muted" : "default"}
          hint={low && product.current_inventory > 0 ? "Running low" : "Ready to bring"}
        />
        <StatCard label="Units sold" value={String(unitsSoldAllTime)} tone="muted" />
        <StatCard label="Revenue" value={formatMoney(revenueAllTime)} tone="positive" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <AdjustButton icon={PlusCircle} label="Restock" onClick={() => setAdjustOpen("restock")} />
        <AdjustButton icon={Wrench} label="Damaged" onClick={() => setAdjustOpen("damaged")} />
        <AdjustButton icon={HeartHandshake} label="Given away" onClick={() => setAdjustOpen("giveaway")} />
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Stock history</h3>
        <p className="text-xs text-muted-foreground">
          Every change is recorded — nothing quietly overwrites your count, even offline.
        </p>
        {movements.length === 0 ? (
          <EmptyState icon={ArrowUpRight} title="No stock changes yet" description="Restock or record a loss to see history here." className="py-6" />
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {movements
              .slice()
              .reverse()
              .map((m, i) => (
                <li key={i} className="flex items-center gap-3 px-3.5 py-2.5">
                  {m.delta > 0 ? (
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <ArrowDownLeft className="h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDateTime(m.at)}
                      {m.note ? ` · ${m.note}` : ""}
                    </p>
                  </div>
                  <span className={cn("tabular text-sm font-semibold", m.delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                    {m.delta > 0 ? "+" : ""}
                    {m.delta}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </section>

      <Button variant="ghost" className="w-full text-destructive" onClick={() => setConfirmDelete(true)}>
        <Trash2 className="h-4 w-4" /> Remove product
      </Button>

      <StockAdjustDialog
        open={adjustOpen !== null}
        onOpenChange={(o) => setAdjustOpen(o ? adjustOpen : null)}
        reason={adjustOpen ?? "restock"}
        productName={product.name}
        currentStock={product.current_inventory}
        onSubmit={(quantityChange, note) => {
          if (adjustOpen) void handleAdjust(adjustOpen, quantityChange, note);
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Remove ${product.name}?`}
        description="It will be removed from your lists. Past events keep their records so old results stay accurate."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (!product) return;
          await softDeleteProduct(product.id);
          setConfirmDelete(false);
          toast.success("Product removed");
          navigate("/products");
        }}
      />
    </div>
  );
}

function AdjustButton({ icon: Icon, label, onClick }: { icon: typeof PlusCircle; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-xl border bg-card p-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent/50 active:bg-accent"
    >
      <Icon className="h-5 w-5 text-primary" />
      {label}
    </button>
  );
}

// Keep the effective status helper exercised for completed events in history labels.
void effectiveEventStatus;
