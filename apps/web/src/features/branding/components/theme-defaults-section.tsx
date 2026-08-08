"use client";

import { Controller, type Control } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FONT_FAMILY_MAX_LENGTH, TOKEN_LENGTH_MAX_LENGTH } from "../constants";
import type { ThemeFormValues } from "./theme-editor-form";

/** Mirrors `ThemeRadiusDto`/`ThemeSpacingDto`'s real field sets (`theme-tokens.dto.ts`) in the same order — plain CSS-length text fields, no unit validation beyond `maxLength` (matches the DTOs' own looseness, no client-side re-validation beyond what the server actually enforces). */
const RADIUS_KEYS = ["sm", "md", "lg", "xl"] as const;
const SPACING_KEYS = ["xs", "sm", "md", "lg", "xl", "xxl", "xxxl"] as const;

export function ThemeDefaultsSection({ control, disabled }: { control: Control<ThemeFormValues>; disabled?: boolean }) {
  const t = useTranslations("branding.form.defaults");
  return (
    <div className="space-y-4">
      <Controller
        control={control}
        name="tokens.fontFamily"
        render={({ field, fieldState }) => (
          <div className="max-w-sm space-y-1.5">
            <Label htmlFor="tokens-font-family" required>
              {t("fontFamilyLabel")}
            </Label>
            <Input
              id="tokens-font-family"
              value={field.value}
              onChange={field.onChange}
              maxLength={FONT_FAMILY_MAX_LENGTH}
              disabled={disabled}
              required
            />
            {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
          </div>
        )}
      />

      <div className="space-y-1.5">
        <Label>{t("radiusLabel")}</Label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {RADIUS_KEYS.map((key) => (
            <Controller
              key={key}
              control={control}
              name={`tokens.radius.${key}`}
              render={({ field, fieldState }) => (
                <div className="space-y-1">
                  <Label htmlFor={`radius-${key}`} className="text-xs text-muted-foreground">
                    {t(`radius.${key}`)}
                  </Label>
                  <Input
                    id={`radius-${key}`}
                    value={field.value}
                    onChange={field.onChange}
                    maxLength={TOKEN_LENGTH_MAX_LENGTH}
                    disabled={disabled}
                    required
                  />
                  {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
                </div>
              )}
            />
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>{t("spacingLabel")}</Label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {SPACING_KEYS.map((key) => (
            <Controller
              key={key}
              control={control}
              name={`tokens.spacing.${key}`}
              render={({ field, fieldState }) => (
                <div className="space-y-1">
                  <Label htmlFor={`spacing-${key}`} className="text-xs text-muted-foreground">
                    {t(`spacing.${key}`)}
                  </Label>
                  <Input
                    id={`spacing-${key}`}
                    value={field.value}
                    onChange={field.onChange}
                    maxLength={TOKEN_LENGTH_MAX_LENGTH}
                    disabled={disabled}
                    required
                  />
                  {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
                </div>
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
