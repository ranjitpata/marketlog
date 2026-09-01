import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { centsToInput, parseMoneyToCents } from "@/lib/format";

interface Props {
  value: number; // cents
  onChange: (cents: number) => void;
  placeholder?: string;
  prefix?: string;
  id?: string;
  disabled?: boolean;
}

/**
 * Money input working in whole dollars/cents; internally everything is stored
 * as integer cents. `prefix` avoids locale confusion for price fields.
 */
export default function MoneyInput({ value, onChange, placeholder, prefix = "$", id, disabled }: Props) {
  const [text, setText] = useState(() => centsToInput(value));

  // Keep the field in sync when the parent resets/clears the form.
  useEffect(() => {
    const currentCents = parseMoneyToCents(text);
    if (currentCents !== value) setText(centsToInput(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
        {prefix}
      </span>
      <Input
        id={id}
        inputMode="decimal"
        className="tabular pl-7"
        placeholder={placeholder ?? "0.00"}
        value={text}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.value.replace(/[^0-9.]/g, "").slice(0, 12);
          setText(next);
          onChange(parseMoneyToCents(next));
        }}
        onBlur={() => setText(centsToInput(parseMoneyToCents(text)))}
      />
    </div>
  );
}
