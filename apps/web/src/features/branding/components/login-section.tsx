"use client";

import { Controller, type Control } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilePicker } from "./file-picker";
import { LOGIN_WELCOME_TEXT_MAX_LENGTH } from "../constants";
import type { ThemeFormValues } from "./theme-editor-form";

export function LoginSection({ control, disabled }: { control: Control<ThemeFormValues>; disabled?: boolean }) {
  const t = useTranslations("branding.form.login");
  return (
    <div className="space-y-4">
      <Controller
        control={control}
        name="loginConfig.backgroundImageFileId"
        render={({ field }) => (
          <FilePicker
            label={t("backgroundImageLabel")}
            value={field.value ?? null}
            onChange={(v) => field.onChange(v ?? undefined)}
            accept="image/*"
            disabled={disabled}
          />
        )}
      />
      <Controller
        control={control}
        name="loginConfig.welcomeText"
        render={({ field, fieldState }) => (
          <div className="max-w-md space-y-1.5">
            <Label htmlFor="login-welcome-text">{t("welcomeTextLabel")}</Label>
            <Input
              id="login-welcome-text"
              value={field.value ?? ""}
              onChange={field.onChange}
              maxLength={LOGIN_WELCOME_TEXT_MAX_LENGTH}
              disabled={disabled}
            />
            {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
          </div>
        )}
      />
    </div>
  );
}
