import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/dexie";
import { useAuthStore } from "@/stores/authStore";
import { getStockMovements, type StockMovement } from "@/lib/db/inventory";

export interface ProductDetail {
  movements: StockMovement[];
  unitsSoldAllTime: number;
  revenueAllTime: number;
}

/** Product activity ledger + lifetime stats (all local reads). */
export function useProductDetail(productId: string | undefined): ProductDetail {
  const userId = useAuthStore((s) => s.userId);

  const movements = useLiveQuery(
    async () => (productId && userId ? getStockMovements(productId, userId) : []),
    [productId, userId],
    [],
  ) ?? [];

  const items = useLiveQuery(
    async () => {
      if (!productId || !userId) return [];
      return db.saleItems
        .where("product_id")
        .equals(productId)
        .filter((si) => si.user_id === userId && !si.deleted_at)
        .toArray();
    },
    [productId, userId],
    [],
  ) ?? [];

  const unitsSoldAllTime = items.reduce((sum, i) => sum + i.quantity, 0);
  const revenueAllTime = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);

  return { movements, unitsSoldAllTime, revenueAllTime };
}
