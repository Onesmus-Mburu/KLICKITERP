"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { DEFAULT_CURRENCY, normalizeMoneyInput } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface MoneyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type"> {
  /** A `Money.toDecimalString()`-shaped value (e.g. `"1234.5600"`) or empty string. */
  value: string;
  /** Called with a normalized decimal string, or `null` while the field holds invalid/incomplete input (caller decides whether to block submit on `null`). */
  onValueChange: (value: string | null) => void;
  currency?: string;
}

/**
 * Cross-cutting money entry field (docs/phase-6/PROGRESS.md scope item 4),
 * built directly off `lib/money.ts`'s decimal-string discipline — the raw
 * typed text is kept as local state so the user can type freely (including
 * thousands separators), and `normalizeMoneyInput` (BigInt/string-based,
 * never `parseFloat`) is what's reported upward on every change.
 *
 * Phase 6 Slice 3b follow-up: an empty `value` (`""`, the "no real amount
 * entered yet" case every new-line form now starts from) renders a genuinely
 * EMPTY input — `"0.00"` only ever appears as the native `placeholder`
 * attribute (grey hint text, never a committed value, never submitted).
 * Callers that DO have a real existing amount (e.g. editing an already-saved
 * line) pass that real decimal string as `value` and it displays normally,
 * unaffected by this — the empty-state fix only changes what shows up when
 * `value` itself is `""`.
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onValueChange, currency = DEFAULT_CURRENCY, placeholder = "0.00", className, ...props }, ref) => {
    const [raw, setRaw] = React.useState(value);

    React.useEffect(() => setRaw(value), [value]);

    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{currency}</span>
        <Input
          ref={ref}
          inputMode="decimal"
          className={cn("pl-14", className)}
          value={raw}
          placeholder={placeholder}
          onChange={(e) => {
            setRaw(e.target.value);
            onValueChange(normalizeMoneyInput(e.target.value));
          }}
          {...props}
        />
      </div>
    );
  },
);
MoneyInput.displayName = "MoneyInput";
