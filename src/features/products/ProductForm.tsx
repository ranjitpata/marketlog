import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import MoneyInput from "@/components/shared/MoneyInput";
import QuantityStepper from "@/components/shared/QuantityStepper";
import { createProduct, updateProduct } from "@/lib/repositories/productRepository";
import { todayStr } from "@/lib/format";
import type { Product } from "@/types";

interface Props {
  product?: Product;
}

export default function ProductForm({ product }: Props) {
  const navigate = useNavigate();
  const editing = Boolean(product);

  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [cost, setCost] = useState(product?.cost_price ?? 0);
  const [price, setPrice] = useState(product?.selling_price ?? 0);
  const [threshold, setThreshold] = useState(product?.low_stock_threshold ?? 5);
  const [description, setDescription] = useState(product?.description ?? "");
  const [initialStock, setInitialStock] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give your product a name.");
      return;
    }
    if (price < 0 || cost < 0) {
      setError("Prices can't be negative.");
      return;
    }
    setSaving(true);
    try {
      if (editing && product) {
        await updateProduct(product.id, {
          name: trimmed,
          category: category.trim() || null,
          sku: sku.trim() || null,
          cost_price: cost,
          selling_price: price,
          low_stock_threshold: threshold > 0 ? threshold : null,
          description: description.trim() || null,
        });
        toast.success("Product updated", {
          description: "Saved on this device. Existing events keep their original prices.",
        });
      } else {
        await createProduct(
          {
            name: trimmed,
            category: category.trim() || null,
            sku: sku.trim() || null,
            description: description.trim() || null,
            cost_price: cost,
            selling_price: price,
            low_stock_threshold: threshold > 0 ? threshold : null,
          },
          initialStock,
        );
        toast.success("Product added", {
          description: "Saved on this device and ready for your next event.",
        });
      }
      navigate("/products");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong saving the product.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="p-name">Product name</Label>
        <Input
          id="p-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Beeswax candle"
          autoFocus={!editing}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="p-cost">Cost to make</Label>
          <MoneyInput id="p-cost" value={cost} onChange={setCost} placeholder="4.50" />
          <p className="text-xs text-muted-foreground">What one unit costs you.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-price">Selling price</Label>
          <MoneyInput id="p-price" value={price} onChange={setPrice} placeholder="12.00" />
          <p className="text-xs text-muted-foreground">What customers pay.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="p-cat">Category (optional)</Label>
          <Input id="p-cat" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Candles" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-sku">SKU / code (optional)</Label>
          <Input id="p-sku" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="CND-001" />
        </div>
      </div>

      {!editing && (
        <div className="flex items-center justify-between rounded-xl border bg-card p-3.5">
          <div>
            <p className="text-sm font-medium">How many do you have right now?</p>
            <p className="text-xs text-muted-foreground">Your starting count — you can correct it anytime.</p>
          </div>
          <QuantityStepper value={initialStock} onChange={setInitialStock} min={0} size="lg" ariaLabel="Starting count" />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="p-threshold">Low stock alert below</Label>
        <Input
          id="p-threshold"
          inputMode="numeric"
          className="tabular w-24"
          value={threshold}
          onChange={(e) => setThreshold(Math.max(0, Number(e.target.value.replace(/[^0-9]/g, "")) || 0))}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="p-notes">Notes (optional)</Label>
        <Textarea id="p-notes" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Scent options, sizes, suppliers…" />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button type="button" variant="outline" className="flex-1" onClick={() => navigate(-1)}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" disabled={saving}>
          {saving ? "Saving…" : editing ? "Save changes" : "Add product"}
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">Saved offline on {todayStr()} — syncs when online.</p>
    </form>
  );
}
