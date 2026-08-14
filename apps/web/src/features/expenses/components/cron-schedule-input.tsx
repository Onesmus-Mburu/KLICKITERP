"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** A safe, always-due-soon default for a brand-new template's own initial field value — monthly, the 1st of the month, matching the task brief's own first-listed preset. */
export const DEFAULT_CRON = "0 0 1 * *";

const FIELD_COUNT = 5;
/** Only these 3 (day-of-month, month, day-of-week) are ever actually consulted by `computeNextRunOn()` — see this component's own doc comment below. */
const CONSULTED_FIELD_INDEXES = [2, 3, 4];

const PRESETS = [
  { value: "0 0 1 * *", labelKey: "presetMonthly" },
  { value: "0 0 * * 1", labelKey: "presetWeekly" },
] as const;

/** Splits a cron string into exactly 5 fields, padding/truncating with `"*"` for anything malformed — never throws, so a template loaded from a genuinely bad/legacy value still renders 5 editable boxes instead of crashing the form. */
function splitCronFields(cron: string): string[] {
  const parts = cron.trim().length > 0 ? cron.trim().split(/\s+/) : [];
  const fields: string[] = [];
  for (let i = 0; i < FIELD_COUNT; i++) {
    fields.push(parts[i] ?? "*");
  }
  return fields;
}

/** `"*"` or a single exact non-negative integer, nothing else — mirrors `RecurringService`'s own server-side `validateCronShape()` EXACTLY (`packages/server/src/domains/expenses/application/recurring.service.ts`), so a client-side-blocked submit never disagrees with the real 422 the server would otherwise throw. */
function isValidCronField(field: string): boolean {
  return field === "*" || /^\d+$/.test(field);
}

/** True only when every one of the 5 fields is individually valid per `isValidCronField()` — used by `<CreateRecurringDialog>`/`<EditRecurringDialog>` to gate their own submit buttons. */
export function isValidCronShape(cron: string): boolean {
  const fields = splitCronFields(cron);
  return fields.length === FIELD_COUNT && fields.every(isValidCronField);
}

/**
 * Phase 6 Slice 20 Part 4 (Recurring Templates, Module 14) — the "5-field
 * cron" input the task brief specifically calls for: 5 separate small text
 * boxes (minute/hour/day-of-month/month/day-of-week), each individually
 * validated against the EXACT same shape the server enforces
 * (`RecurringService.validateCronShape()`, read directly — a real 422
 * otherwise) — `"*"` or one exact non-negative integer, no ranges, lists, or
 * step expressions. This is a fully controlled component (`value`/`onChange`
 * carry the whole 5-field space-joined string) — no local field-array state
 * duplicated here, so a parent form always has one single source of truth.
 *
 * **Honest about which fields matter**: only day-of-month/month/day-of-week
 * are ever actually consulted by `computeNextRunOn()` (confirmed by reading
 * it directly) — `next_run_on` is a plain `date` column with no
 * time-of-day, so minute/hour are validated for shape but never read when
 * computing the next fire date. The minute/hour field labels carry a visibly
 * muted "(unused)" suffix rather than silently implying they control
 * anything, and the help text below states this explicitly — never letting
 * a user believe setting a specific hour will make a template fire at that
 * time of day.
 *
 * Two presets are offered (`"0 0 1 * *"` monthly-1st, `"0 0 * * 1"`
 * weekly-Monday) — the two patterns the task brief itself names as this
 * system's real use case; this is NOT a general cron-expression builder and
 * makes no attempt to support ranges/lists/steps, matching
 * `RecurringService`'s own deliberately restricted grammar.
 */
export function CronScheduleInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("expenses.recurring.cronInput");
  const fields = splitCronFields(value);
  const fieldLabels = [t("minuteLabel"), t("hourLabel"), t("dayOfMonthLabel"), t("monthLabel"), t("dayOfWeekLabel")];

  function handleFieldChange(index: number, raw: string) {
    const trimmed = raw.trim();
    const next = [...fields];
    next[index] = trimmed;
    onChange(next.join(" "));
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-5 gap-2">
        {fields.map((field, index) => {
          const valid = isValidCronField(field);
          const consulted = CONSULTED_FIELD_INDEXES.includes(index);
          return (
            <div key={index} className="space-y-1">
              <Label className="text-xs font-normal">
                {fieldLabels[index]}
                {!consulted && <span className="text-muted-foreground"> {t("unusedSuffix")}</span>}
              </Label>
              <Input
                value={field}
                onChange={(e) => handleFieldChange(index, e.target.value)}
                disabled={disabled}
                className={cn("text-center", !valid && "border-destructive focus-visible:ring-destructive")}
                aria-invalid={!valid}
              />
            </div>
          );
        })}
      </div>
      {!isValidCronShape(value) && <p className="text-xs text-destructive">{t("invalidFieldError")}</p>}
      <p className="text-xs text-muted-foreground">{t("helpText")}</p>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <Button key={preset.value} type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange(preset.value)}>
            {t(preset.labelKey)}
          </Button>
        ))}
      </div>
    </div>
  );
}
