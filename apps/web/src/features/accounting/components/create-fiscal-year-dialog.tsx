"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useCreateFiscalYear } from "../hooks/use-fiscal-years";

const NAME_MAX_LENGTH = 20; // gl_fiscal_year.name is varchar(20) — create-fiscal-year.dto.ts.
const DEFAULT_PERIOD_COUNT = 12;
const MIN_PERIOD_COUNT = 1;
const MAX_PERIOD_COUNT = 366;

/**
 * Phase 6 Slice 17 Part 1 (Accounting Core foundations, Module 7) —
 * `POST /accounting/fiscal-years` auto-generates the year's periods
 * server-side in the same transaction (`FiscalYearsService.create()`):
 * `periodCount` (default 12) equal-length-AS-POSSIBLE calendar-DAY slices
 * across `[startsOn, endsOn]`, all `OPEN`. `periodCountHint` below is
 * deliberately honest about that — this is NOT "12 real calendar months,"
 * it's a day-count division, so an off-calendar `periodCount` (e.g. 4 for
 * quarters) genuinely won't line up with real quarter boundaries either.
 * Date inputs follow `features/settings/components/edit-academic-year-dialog.tsx`'s
 * own established plain `<Input type="date">` (`YYYY-MM-DD` string) pattern.
 */
export function CreateFiscalYearDialog() {
  const t = useTranslations("accounting.fiscalYears.createDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [startsOn, setStartsOn] = React.useState("");
  const [endsOn, setEndsOn] = React.useState("");
  const [periodCount, setPeriodCount] = React.useState(String(DEFAULT_PERIOD_COUNT));
  const [error, setError] = React.useState<string | null>(null);
  const createMutation = useCreateFiscalYear();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName("");
      setStartsOn("");
      setEndsOn("");
      setPeriodCount(String(DEFAULT_PERIOD_COUNT));
      setError(null);
    }
  }

  const parsedPeriodCount = Number(periodCount);
  const periodCountValid = Number.isInteger(parsedPeriodCount) && parsedPeriodCount >= MIN_PERIOD_COUNT && parsedPeriodCount <= MAX_PERIOD_COUNT;
  const canSubmit = name.trim().length > 0 && startsOn.length > 0 && endsOn.length > 0 && endsOn >= startsOn && periodCountValid;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        startsOn,
        endsOn,
        periodCount: parsedPeriodCount,
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
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label required>{t("nameLabel")}</Label>
            <Input value={name} maxLength={NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label required>{t("startsOnLabel")}</Label>
              <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label required>{t("endsOnLabel")}</Label>
              <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label required>{t("periodCountLabel")}</Label>
            <Input
              type="number"
              min={MIN_PERIOD_COUNT}
              max={MAX_PERIOD_COUNT}
              value={periodCount}
              onChange={(e) => setPeriodCount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("periodCountHint")}</p>
          </div>
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
