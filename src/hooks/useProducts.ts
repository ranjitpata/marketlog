import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/dexie";
import { useAuthStore } from "@/stores/authStore";
import type { Product } from "@/types";

/** All of this user's products, alive only, name-sorted. Reads IndexedDB only. */
export function useProducts(): Product[] {
  const userId = useAuthStore((s) => s.userId);
  return (
    useLiveQuery(
      async () => {
        if (!userId) return [];
        return db.products
          .where("user_id")
          .equals(userId)
          .filter((p) => !p.deleted_at)
          .toArray();
      },
      [userId],
      [],
    ) ?? []
  ).sort((a, b) => a.name.localeCompare(b.name));
}

export function useProduct(id: string | undefined): Product | undefined {
  return useLiveQuery(async () => (id ? db.products.get(id) : undefined), [id]);
}
