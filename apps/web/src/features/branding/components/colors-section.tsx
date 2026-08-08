"use client";

import { Controller, useWatch, type Control } from "react-hook-form";
import { useTranslations } from "next-intl";
import { ColorField } from "./color-field";
import { ContrastIndicator } from "./contrast-indicator";
import type { ThemeFormValues } from "./theme-editor-form";

/** Mirrors `ThemeColorsDto`'s 9 real fields (`theme-tokens.dto.ts`) in the same order. */
const COLOR_KEYS = [
  "primary",
  "secondary",
  "accent",
  "primaryLight",
  "primarySoft",
  "primaryLavender",
  "surface",
  "dark",
  "black",
] as const;

/**
 * Phase 6 Slice 14 Part 4 — the WCAG AA contrast badge renders next to
 * exactly these 2 fields, each checked against the live `surface` value, NOT
 * a generic matrix over all 9 colors. `dark` is the real text color rendered
 * on a `surface`-colored background (`--foreground`/`--card` etc. in
 * `lib/theme.ts`'s `buildSemanticLightVariables`); `primary` is the real
 * background color a `surface`-colored label sits on (`--primary`/
 * `--primary-foreground`, same file) — both are genuine, load-bearing
 * foreground/background pairs in this app's actual rendering, just with the
 * roles inverted between the two.
 */
const CONTRAST_CHECKED_KEYS = new Set<(typeof COLOR_KEYS)[number]>(["primary", "dark"]);

export function ColorsSection({ control, disabled }: { control: Control<ThemeFormValues>; disabled?: boolean }) {
  const t = useTranslations("branding.form.colors");
  const surface = useWatch({ control, name: "tokens.colors.surface" });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {COLOR_KEYS.map((key) => (
        <Controller
          key={key}
          control={control}
          name={`tokens.colors.${key}`}
          render={({ field, fieldState }) => (
            <div className="space-y-1.5">
              <ColorField label={t(key)} value={field.value} onChange={field.onChange} disabled={disabled} error={fieldState.error?.message} />
              {CONTRAST_CHECKED_KEYS.has(key) && surface && (
                <ContrastIndicator foreground={field.value} background={surface} onApplySuggestion={field.onChange} />
              )}
            </div>
          )}
        />
      ))}
    </div>
  );
}
