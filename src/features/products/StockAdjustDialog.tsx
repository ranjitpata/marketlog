import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import QuantityStepper from "@/components/shared/QuantityStepper";
import { cn } from "@/lib/utils";
import type { AdjustmentReason } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: AdjustmentReason;
  productName: string;
  currentStock: number;
  onSubmit: (quantityChange: number, note: string | null) => void;
}

const COPY: Record<string, { title: string; body: string; deltaSign: 1 | -1 }> = {
  restock: { title: "Add stock", body: "How many did you make or buy?", deltaSign: 1 },
  damaged: { title: "Record damaged items", body: "How many were damaged or broken?", deltaSign: -1 },
  giveaway: { title: "Record given-away items", body: "Gifts, samples or donations.", deltaSign: -1 },
  correction: { title: "Correct the count", body: "Counted something different on the shelf?", deltaSign: 1 },
  initial: { title: "Starting count", body: "How many do you have?", deltaSign: 1 },
};

/** Dialog for recording a stock change with a reason (never a silent overwrite). */
export default function StockAdjustDialog({ open, onOpenChange, reason, productName, currentStock, onSubmit }: Props) {
  const copy = COPY[reason] ?? COPY.correction;
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

  function handleConfirm() {
    const change = copy.deltaSign * quantity;
    onSubmit(change, note.trim() || null);
    setQuantity(1);
    setNote("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">{copy.body}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {productName} · currently {currentStock} on hand
            </p>
          </div>
          <div className="flex justify-center py-1">
            <QuantityStepper value={quantity} onChange={setQuantity} min={0} size="lg" ariaLabel="Quantity" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adj-note">Note (optional)</Label>
            <Textarea id="adj-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened?" />
          </div>
          <p className={cn("text-center text-sm font-medium", copy.deltaSign > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
            New count: {currentStock + copy.deltaSign * quantity}
            {quantity > 0 && (copy.deltaSign > 0 ? ` (+${quantity})` : ` (−${quantity})`)}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={quantity === 0}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
