import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Package, Plus, Search, ChevronRight } from "lucide-react";
import { useProducts } from "@/hooks/useProducts";
import { useProductDetail } from "@/hooks/useProductDetail";
import EmptyState from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import type { Product } from "@/types";
import { cn } from "@/lib/utils";

export default function ProductsPage() {
  const products = useProducts();
  const [query, setQuery] = useState("");

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) if (p.category) set.add(p.category);
    return Array.from(set);
  }, [products]);
  const [category, setCategory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (category && p.category !== category) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, query, category]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products…"
            className="pl-9"
            inputMode="search"
          />
        </div>
        <Button asChild>
          <Link to="/products/new">
            <Plus className="h-4 w-4" /> Add
          </Link>
        </Button>
      </div>

      {categories.length > 0 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5">
          <button
            onClick={() => setCategory(null)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-medium",
              category === null ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground",
            )}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(category === c ? null : c)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium",
                category === c ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No products yet"
          description="Add the things you make or sell so you can bring them to events and track what sells."
          action={
            <Button asChild>
              <Link to="/products/new">
                <Plus className="h-4 w-4" /> Add your first product
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((p) => (
            <ProductRow key={p.id} product={p} />
          ))}
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">Nothing matches “{query}”.</p>
          )}
        </ul>
      )}
    </div>
  );
}

function ProductRow({ product }: { product: Product }) {
  const navigate = useNavigate();
  const { unitsSoldAllTime } = useProductDetail(product.id);

  const low = product.low_stock_threshold !== null && product.current_inventory <= product.low_stock_threshold;
  const out = product.current_inventory <= 0;

  return (
    <li>
      <button
        onClick={() => navigate(`/products/${product.id}`)}
        className="flex w-full items-center gap-3 rounded-xl border bg-card p-3.5 text-left shadow-sm transition-colors hover:bg-accent/50 active:bg-accent"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{product.name}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="tabular font-medium text-foreground">{formatMoney(product.selling_price)}</span>
            {product.category && <span>· {product.category}</span>}
            <span>· {unitsSoldAllTime} sold</span>
          </div>
        </div>
        <span
          className={cn(
            "tabular rounded-full px-2.5 py-1 text-xs font-semibold",
            out
              ? "bg-destructive/10 text-destructive"
              : low
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                : "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
          )}
        >
          {out ? "Out of stock" : `${product.current_inventory} in stock`}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    </li>
  );
}
