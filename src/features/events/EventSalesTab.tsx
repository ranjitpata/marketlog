import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Banknote, CreditCard, Receipt, ShoppingCart, Wallet } from "lucide-react";
import { useEventData } from "@/hooks/useEventData";
import EmptyState from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { formatMoney, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PaymentMethod } from "@/types";

const PAYMENT_META: Record<PaymentMethod, { label: string; icon: typeof Banknote; className: string }> = {
  cash: { label: "Cash", icon: Banknote, className: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400" },
  card: { label: "Card", icon: CreditCard, className: "bg-sky-600/10 text-sky-700 dark:text-sky-400" },
  other: { label: "Other", icon: Wallet, className: "bg-muted text-muted-foreground" },
};

export default function EventSalesTab({ eventId, completed }: { eventId: string; completed: boolean }) {
  const { sales, saleItems } = useEventData(eventId);

  const itemsBySale = useMemo(() => {
    const map = new Map<string, typeof saleItems>();
    for (const item of saleItems) {
      const list = map.get(item.sale_id) ?? [];
      list.push(item);
      map.set(item.sale_id, list);
    }
    return map;
  }, [saleItems]);

  if (sales.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="No sales recorded"
        description={
          completed
            ? "This event finished without recorded sales."
            : "Use Quick Sale during the event — it works even without internet."
        }
        action={
          !completed && (
            <Button asChild>
              <Link to={`/sale?event=${eventId}`}>
                <ShoppingCart className="h-4 w-4" /> Record a sale
              </Link>
            </Button>
          )
        }
      />
    );
  }

  const total = sales.reduce((sum, s) => sum + s.total_amount, 0);

  return (
    <div className="space-y-3">
      <p className="tabular text-right text-sm text-muted-foreground">
        {sales.length} {sales.length === 1 ? "sale" : "sales"} · {formatMoney(total)}
      </p>
      <ul className="space-y-2">
        {sales
          .slice()
          .reverse()
          .map((sale) => {
            const meta = PAYMENT_META[sale.payment_method];
            const PaymentIcon = meta.icon;
            const items = itemsBySale.get(sale.id) ?? [];
            return (
              <li key={sale.id} className="rounded-xl border bg-card p-3.5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="tabular text-sm font-semibold text-muted-foreground">{formatTime(sale.sold_at)}</span>
                  <div className="flex items-center gap-2">
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", meta.className)}>
                      <PaymentIcon className="h-3 w-3" /> {meta.label}
                    </span>
                    <span className="tabular text-base font-bold">{formatMoney(sale.total_amount)}</span>
                  </div>
                </div>
                <ul className="mt-2 space-y-1 border-t pt-2">
                  {items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-2 text-sm">
                      <span className="truncate text-muted-foreground">
                        {item.quantity} × {item.product_name_snapshot}
                      </span>
                      <span className="tabular font-medium">{formatMoney(item.unit_price * item.quantity)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
