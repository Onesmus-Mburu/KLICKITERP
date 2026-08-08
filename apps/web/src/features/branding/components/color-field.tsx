"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HEX_COLOR_PATTERN } from "../constants";

export interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
}

/**
 * Native `<input type="color">` swatch, two-way-synced with a text `Input`.
 * The TEXT field tracks its own local draft state and only calls `onChange`
 * (committing to the form) once the typed text matches `HEX_COLOR_PATTERN`
 * (the real backend regex, mirrored byte-for-byte in `constants.ts`) — an
 * in-progress, invalid partial keystroke (e.g. "#57") never flickers the
 * swatch or the parent form's committed value. The SWATCH always mirrors
 * the current committed `value` (falling back to the last valid draft while
 * the user is still typing) — `<input type="color">` requires a real
 * 6-digit `#rrggbb` value or it silently coerces to black, so
 * `normalizeForSwatch` below expands a valid 3-digit shorthand.
 */
export function ColorField({ label, value, onChange, disabled, error }: ColorFieldProps) {
  const [draft, setDraft] = React.useState(value);

  // The form can reseed `value` out from under this field (e.g. switching
  // create-mode seed data) — keep the local draft in sync whenever the
  // COMMITTED value changes for a reason other than this field's own typing.
  React.useEffect(() => {
    setDraft(value);
  }, [value]);

  function handleTextChange(next: string) {
    setDraft(next);
    if (HEX_COLOR_PATTERN.test(next)) {
      onChange(next);
    }
  }

  function handleSwatchChange(next: string) {
    setDraft(next);
    onChange(next);
  }

  const swatchValue = HEX_COLOR_PATTERN.test(draft) ? normalizeForSwatch(draft) : normalizeForSwatch(value);

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={swatchValue}
          onChange={(e) => handleSwatchChange(e.target.value)}
          disabled={disabled}
          aria-label={label}
          className="size-10 shrink-0 cursor-pointer rounded-md border border-input bg-background p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <Input value={draft} onChange={(e) => handleTextChange(e.target.value)} disabled={disabled} maxLength={7} placeholder="#573399" />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Expands a valid 3-digit hex shorthand (`#abc` -> `#aabbcc`) for `<input type="color">`, which requires a real 6-digit value; anything already 6-digit (or otherwise invalid) passes through/falls back untouched. */
function normalizeForSwatch(hex: string): string {
  const shortMatch = /^#([0-9A-Fa-f])([0-9A-Fa-f])([0-9A-Fa-f])$/.exec(hex);
  if (shortMatch) {
    const [, r, g, b] = shortMatch;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return HEX_COLOR_PATTERN.test(hex) ? hex : "#000000";
}
