"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import { CUSTOM_FIELD_ENTITIES, CUSTOM_FIELD_TYPES } from "../constants";
import { useCreateCustomField } from "../hooks/use-custom-fields";
import { textToOptions } from "../lib/custom-field-options";
import type { CustomFieldEntityType, CustomFieldType } from "../types";

const KEY_MAX_LENGTH = 40; // set_custom_field_def.key is varchar(40) — create-custom-field.dto.ts.
const LABEL_MAX_LENGTH = 80; // set_custom_field_def.label is varchar(80) — create-custom-field.dto.ts.
const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/**
 * Phase 6 Slice 11 Part 1 — the first "define a custom field" UI anywhere in
 * this app (`POST /custom-fields` has existed with no frontend caller until
 * now). `options` only shows, and only gets sent, when `fieldType==="SELECT"`
 * — per the plan's own explicit instruction ("design the form so options
 * entry only shows/matters when fieldType==='SELECT'") — see
 * `../lib/custom-field-options.ts` for the real comma-list<->array shape
 * this app commits to for that case.
 */
export function CreateCustomFieldDialog() {
  const t = useTranslations("settings.customFields");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [entity, setEntity] = React.useState<CustomFieldEntityType>("STUDENT");
  const [key, setKey] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [fieldType, setFieldType] = React.useState<CustomFieldType>("TEXT");
  const [optionsText, setOptionsText] = React.useState("");
  const [isRequired, setIsRequired] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const createMutation = useCreateCustomField();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setEntity("STUDENT");
      setKey("");
      setLabel("");
      setFieldType("TEXT");
      setOptionsText("");
      setIsRequired(false);
      setError(null);
    }
  }

  const canSubmit = KEY_PATTERN.test(key) && label.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      await createMutation.mutateAsync({
        entity,
        key: key.trim(),
        label: label.trim(),
        fieldType,
        ...(fieldType === "SELECT" ? { options: textToOptions(optionsText) } : {}),
        isRequired,
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">
          <Plus className="size-4" />
          {t("newFieldTrigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("newFieldTitle")}</DialogTitle>
          <DialogDescription>{t("newFieldDescription")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label required>{t("entity")}</Label>
            <Select value={entity} onValueChange={(v) => setEntity(v as CustomFieldEntityType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CUSTOM_FIELD_ENTITIES.map((e) => (
                  <SelectItem key={e} value={e}>
                    {t(`entities.${e}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label required>{t("fieldType")}</Label>
            <Select value={fieldType} onValueChange={(v) => setFieldType(v as CustomFieldType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CUSTOM_FIELD_TYPES.map((ft) => (
                  <SelectItem key={ft} value={ft}>
                    {t(`fieldTypes.${ft}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label required>{t("key")}</Label>
            <Input value={key} maxLength={KEY_MAX_LENGTH} onChange={(e) => setKey(e.target.value)} placeholder={t("keyPlaceholder")} />
            <p className="text-xs text-muted-foreground">{t("keyHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label required>{t("label")}</Label>
            <Input value={label} maxLength={LABEL_MAX_LENGTH} onChange={(e) => setLabel(e.target.value)} placeholder={t("labelPlaceholder")} />
          </div>
          {fieldType === "SELECT" && (
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
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || createMutation.isPending}>
            {createMutation.isPending ? t("creating") : t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
