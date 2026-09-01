import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { clamp } from "@/lib/format";

interface Props {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  ariaLabel?: string;
}

/** Thumb-friendly quantity stepper used across prep, adjustments and cart. */
export default function QuantityStepper({
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  size = "md",
  disabled,
  ariaLabel = "Quantity",
}: Props) {
  const dim = size === "sm" ? "h-8" : size === "lg" ? "h-12" : "h-10";
  const btn = cn("flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40", dim, size === "lg" ? "w-12" : "w-9");
  const canDown = !disabled && value > min;
  const canUp = !disabled && value < max;

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex select-none items-center rounded-full border bg-card",
        dim,
        disabled && "opacity-60",
      )}
    >
      <button
        type="button"
        aria-label="Decrease"
        className={cn(btn, "rounded-l-full text-muted-foreground")}
        disabled={!canDown}
        onClick={() => onChange(clamp(value - 1, min, max))}
      >
        <Minus className="h-4 w-4" />
      </button>
      <span
        className={cn(
          "tabular min-w-8 text-center font-semibold",
          size === "lg" ? "text-lg" : "text-sm",
        )}
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase"
        className={cn(btn, "rounded-r-full text-foreground")}
        disabled={!canUp}
        onClick={() => onChange(clamp(value + 1, min, max))}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
