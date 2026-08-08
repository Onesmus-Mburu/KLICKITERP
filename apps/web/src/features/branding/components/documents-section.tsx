"use client";

import { Controller, type Control } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignaturePickerList } from "./signature-picker-list";
import { DOCUMENT_HEADER_FOOTER_MAX_LENGTH, DOCUMENT_WATERMARK_MAX_LENGTH } from "../constants";
import type { ThemeFormValues } from "./theme-editor-form";

export function DocumentsSection({ control, disabled }: { control: Control<ThemeFormValues>; disabled?: boolean }) {
  const t = useTranslations("branding.form.documents");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Controller
          control={control}
          name="documentConfig.headerText"
          render={({ field, fieldState }) => (
            <div className="space-y-1.5">
              <Label htmlFor="doc-header-text">{t("headerTextLabel")}</Label>
              <Input
                id="doc-header-text"
                value={field.value ?? ""}
                onChange={field.onChange}
                maxLength={DOCUMENT_HEADER_FOOTER_MAX_LENGTH}
                disabled={disabled}
              />
              {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
            </div>
          )}
        />
        <Controller
          control={control}
          name="documentConfig.footerText"
          render={({ field, fieldState }) => (
            <div className="space-y-1.5">
              <Label htmlFor="doc-footer-text">{t("footerTextLabel")}</Label>
              <Input
                id="doc-footer-text"
                value={field.value ?? ""}
                onChange={field.onChange}
                maxLength={DOCUMENT_HEADER_FOOTER_MAX_LENGTH}
                disabled={disabled}
              />
              {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
            </div>
          )}
        />
      </div>
      <Controller
        control={control}
        name="documentConfig.watermarkText"
        render={({ field, fieldState }) => (
          <div className="max-w-sm space-y-1.5">
            <Label htmlFor="doc-watermark-text">{t("watermarkTextLabel")}</Label>
            <Input
              id="doc-watermark-text"
              value={field.value ?? ""}
              onChange={field.onChange}
              maxLength={DOCUMENT_WATERMARK_MAX_LENGTH}
              disabled={disabled}
            />
            {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
          </div>
        )}
      />
      <Controller
        control={control}
        name="documentConfig.signatureFileIds"
        render={({ field }) => (
          <SignaturePickerList label={t("signatureLabel")} value={field.value} onChange={field.onChange} disabled={disabled} />
        )}
      />
    </div>
  );
}
