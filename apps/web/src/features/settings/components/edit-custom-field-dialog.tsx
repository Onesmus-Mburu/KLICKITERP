"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { UpdateCustomFieldDto } from "@klickit/contracts";
import { ApiError } from "@/lib/api-error";
import { useUpdateCustomField } from "../hooks/use-custom-fields";
import { optionsToText, textToOptions } from "../lib/custom-field-options";
import type { CustomFieldDefResponse } from "../types";

const LABEL_MAX_LENGTH = 80; // set_custom_field_def.label is varchar(80) — update-custom-field.dto.ts.

/**
 * Phase 6 Slice 11 Part 1 — edit flow for an EXISTING custom field
 * definition. `entity`/`key`/`fieldType` are rendered read-only/disabled,
 * never sent — `UpdateCustomFieldDto` doesn't even carry those 3 fields
 * (confirmed directly in `update-custom-field.dto.ts`: only `label`/
 * `options`/`isRequired`), so this isn't a client-side restriction papering
 * over a real capability, it mirrors the backend's own immutability exactly.
 * Diff-based submit, same reasoning as `<EditTermDialog>`/
 * `<EditAcademicYearDialog>` — only the fields that actually changed are
 * sent (not strictly load-bearing here the way it is for terms under a
 * billing lock, but kept consistent with this pass's other 2 edit dialogs).
 */
export function EditCustomFieldDialog({ field }: { field: CustomFieldDefResponse }) {
  const t = useTranslations("settings.customFields");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState(field.label);
  const [optionsText, setOptionsText] = React.useState(optionsToText(field.options));
  const [isRequired, setIsRequired] = React.useState(field.isRequired);
  const [error, setError] = React.useState<string | null>(null);
  const updateMutation = useUpdateCustomField();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setLabel(field.label);
      setOptionsText(optionsToText(field.options));
      setIsRequired(field.isRequired);
      setError(null);
    }
  }

  const canSubmit = label.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: UpdateCustomFieldDto = {};
    if (label.trim() !== field.label) dto.label = label.trim();
    if (field.fieldType === "SELECT") {
      const nextOptions = textToOptions(optionsText);
      const currentText = optionsToText(field.options);
      if (optionsText.trim() !== currentText.trim()) dto.options = nextOptions;
    }
    if (isRequired !== field.isRequired) dto.isRequired = isRequired;
    if (Object.keys(dto).length === 0) {
      setOpen(false);
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: field.id, dto });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Pencil className="size-4" />
          {tCommon("edit")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editFieldTitle", { label: field.label })}</DialogTitle>
          <DialogDescription>{t("editFieldDescription")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("entity")}</Label>
            <Input value={t(`entities.${field.entity}`)} disabled />
          </div>
          <div className="space-y-1.5">
            <Label>{t("fieldType")}</Label>
            <Input value={t(`fieldTypes.${field.fieldType}`)} disabled />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("key")}</Label>
            <Input value={field.key} disabled />
            <p className="text-xs text-muted-foreground">{t("keyImmutableHint")}</p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label required>{t("label")}</Label>
            <Input value={label} maxLength={LABEL_MAX_LENGTH} onChange={(e) => setLabel(e.target.value)} />
          </div>
          {field.fieldType === "SELECT" && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("options")}</Label>
              <Input value={optionsText} onChange={(e) => setOptionsText(e.target.value)} placeholder={t("optionsPlaceholder")} />
              <p className="text-xs text-muted-foreground">{t("optionsHint")}</p>
            </div>
          )}
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
            <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} className="size-4 rounded border-input" />
            {t("isRequiredLabel")}
          </label>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || updateMutation.isPending}>
            {updateMutation.isPending ? t("saving") : tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
