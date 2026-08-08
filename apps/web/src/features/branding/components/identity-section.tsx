"use client";

import { Controller, type Control } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilePicker } from "./file-picker";
import { THEME_NAME_MAX_LENGTH } from "../constants";
import type { ThemeFormValues } from "./theme-editor-form";

export function IdentitySection({ control, disabled }: { control: Control<ThemeFormValues>; disabled?: boolean }) {
  const t = useTranslations("branding.form.identity");
  return (
    <div className="space-y-4">
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState }) => (
          <div className="max-w-sm space-y-1.5">
            <Label htmlFor="theme-name" required>
              {t("nameLabel")}
            </Label>
            <Input
              id="theme-name"
              value={field.value}
              onChange={field.onChange}
              maxLength={THEME_NAME_MAX_LENGTH}
              disabled={disabled}
              required
            />
            {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
          </div>
        )}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Controller
          control={control}
          name="logoFileId"
          render={({ field }) => (
            <FilePicker
              label={t("logoLabel")}
              value={field.value ?? null}
              onChange={(v) => field.onChange(v ?? undefined)}
              accept="image/*"
              disabled={disabled}
            />
          )}
        />
        <Controller
          control={control}
          name="faviconFileId"
          render={({ field }) => (
            <FilePicker
              label={t("faviconLabel")}
              value={field.value ?? null}
              onChange={(v) => field.onChange(v ?? undefined)}
              accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml"
              disabled={disabled}
            />
          )}
        />
      </div>
    </div>
  );
}
