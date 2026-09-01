import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Receipt, Store, Trash2, Pencil } from "lucide-react";
import { useEventData } from "@/hooks/useEventData";
import EmptyState from "@/components/shared/EmptyState";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import MoneyInput from "@/components/shared/MoneyInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createExpense, softDeleteExpense, updateExpense } from "@/lib/repositories/expenseRepository";
import { formatDateMedium, formatMoney, todayStr } from "@/lib/format";
import type { EventExpense } from "@/types";

const CATEGORIES = ["Supplies", "Travel", "Parking", "Food", "Equipment", "Fees", "Other"];

export default function EventExpensesTab({ eventId }: { eventId: string }) {
  const { expenses, event } = useEventData(eventId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EventExpense | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const rowsTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
  const boothFee = event?.booth_fee ?? 0;

  return (
    <div className="space-y-4">
      <Button className="w-full" onClick={() => { setEditing(null); setDialogOpen(true); }}>
        <Plus className="h-4 w-4" /> Add a cost
      </Button>

      {/* Booth fee is a first-class line item from the event — never double counted */}
      <div className="rounded-xl border bg-card p-3.5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Store className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Booth fee</p>
              <p className="text-xs text-muted-foreground">Set on the event itself — counted once</p>
            </div>
          </div>
          <span className="tabular text-base font-bold">{formatMoney(boothFee)}</span>
        </div>
      </div>

      {expenses.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No other costs yet"
          description="Parking, supplies, food — anything beyond the booth fee that this event cost you."
          className="border-solid"
        />
      ) : (
        <ul className="space-y-2">
          {expenses
            .slice()
            .sort((a, b) => b.expense_date.localeCompare(a.expense_date))
            .map((e) => (
              <li key={e.id} className="rounded-xl border bg-card p-3.5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{e.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.category ? `${e.category} · ` : ""}
                      {formatDateMedium(e.expense_date)}
                    </p>
                  </div>
                  <span className="tabular text-base font-bold text-destructive">−{formatMoney(e.amount)}</span>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" aria-label="Edit expense" onClick={() => { setEditing(e); setDialogOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Delete expense" onClick={() => setConfirmId(e.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
        </ul>
      )}

      <div className="flex items-center justify-between rounded-xl bg-muted/60 px-4 py-3">
        <p className="text-sm font-medium">Total event costs</p>
        <p className="tabular text-base font-bold">{formatMoney(boothFee + rowsTotal)}</p>
      </div>

      <ExpenseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        eventId={eventId}
        expense={editing}
        onClearEditing={() => setEditing(null)}
      />

      <ConfirmDialog
        open={confirmId !== null}
        onOpenChange={(o) => !o && setConfirmId(null)}
        title="Remove this cost?"
        description="It will no longer count toward this event's costs."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (confirmId) await softDeleteExpense(confirmId);
          setConfirmId(null);
          toast.success("Cost removed");
        }}
      />
    </div>
  );
}

function ExpenseDialog({
  open,
  onOpenChange,
  eventId,
  expense,
  onClearEditing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  eventId: string;
  expense: EventExpense | null;
  onClearEditing: () => void;
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [category, setCategory] = useState<string>("Supplies");
  const [date, setDate] = useState(todayStr());
  const [error, setError] = useState<string | null>(null);

  // Hydrate fields whenever the dialog opens (create or edit).
  useEffect(() => {
    if (open) {
      setDescription(expense?.description ?? "");
      setAmount(expense?.amount ?? 0);
      setCategory(expense?.category ?? "Supplies");
      setDate(expense?.expense_date ?? todayStr());
      setError(null);
    } else {
      onClearEditing();
    }
  }, [open, expense, onClearEditing]);

  async function handleSave() {
    const trimmed = description.trim();
    if (!trimmed) {
      setError("What was this cost for?");
      return;
    }
    if (amount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    try {
      if (expense) {
        await updateExpense(expense.id, {
          description: trimmed,
          amount,
          category: category === "Other" ? null : category,
          expense_date: date,
        });
        toast.success("Cost updated");
      } else {
        await createExpense({
          event_id: eventId,
          description: trimmed,
          amount,
          category: category === "Other" ? null : category,
          expense_date: date,
          notes: null,
        });
        toast.success("Cost added", { description: "Saved on this device." });
      }
      setError(null);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that cost.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{expense ? "Edit cost" : "Add a cost"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="x-desc">What was it for?</Label>
            <Input id="x-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Parking, table rental, lunch…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="x-amount">Amount</Label>
            <MoneyInput id="x-amount" value={amount} onChange={setAmount} />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={
                    "shrink-0 rounded-full border px-3 py-1 text-xs font-medium " +
                    (category === c ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground")
                  }
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="x-date">Date</Label>
            <Input id="x-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>{expense ? "Save" : "Add cost"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
