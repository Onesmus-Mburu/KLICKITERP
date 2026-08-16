"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { CreatePyrlRunDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import { useCreateRun, useRuns } from "../hooks/use-payroll-runs";
import type { PyrlRunKind } from "../api/payroll-runs.api";

const RUN_KINDS: PyrlRunKind[] = ["MAIN", "SUPPLEMENTARY"];
const PERIOD_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Phase 6 Slice 22 Part 6 (Payroll, Module 15) — the create-run form:
 * `periodKey` (a real `<input type="month">` — genuinely yields the exact
 * `'YYYY-MM'` shape `CreatePyrlRunDto.periodKey` expects natively, the
 * correct semantic input type for this exact field, not previously used
 * anywhere else in this feature since no prior part had a plain
 * period-only date field) + `runKind` (MAIN/SUPPLEMENTARY) +
 * `supplementsRunId` (shown only when `runKind === "SUPPLEMENTARY"`).
 *
 * **A run is genuinely system-wide per period — there is no department/
 * employee-subset scope field anywhere on `CreatePyrlRunDto`**, confirmed by
 * reading the DTO/controller directly — this form is correctly this simple.
 *
 * **`supplementsRunId` is service-validated, not DTO-validated** —
 * `createRun()` throws a real `ValidationException` verbatim
 * (`"A SUPPLEMENTARY pyrl_run requires supplementsRunId (the MAIN run it
 * corrects)"`, `payroll-runs.service.ts:291-294`) if `runKind ===
 * "SUPPLEMENTARY"` and this is omitted — this dialog also blocks submission
 * client-side once that combination is selected (via `canSubmit` below), but
 * the exact server message is what actually surfaces on `error` if that
 * guard is somehow bypassed, never a paraphrase.
 *
 * **The `supplementsRunId` picker is a real `<Combobox>` over EXISTING MAIN
 * runs, fetched via `useRuns({})` (no server-side `runKind` filter param
 * exists on `GET /payroll/runs`, confirmed by reading the controller
 * directly — only `periodKey`/`status` are real query params) and filtered
 * to `runKind === "MAIN"` client-side** — the same "fetch broadly, filter
 * client-side when the server doesn't offer the exact filter" pattern this
 * codebase already uses elsewhere. Each option is labeled `periodKey —
 * status` so the picker stays meaningful even with many runs.
 */
export function CreatePayrollRunDialog() {
  const t = useTranslations("payroll.runs.createDialog");
  const tKinds = useTranslations("payroll.runs.kinds");
  const tStatuses = useTranslations("payroll.runs.statuses");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [periodKey, setPeriodKey] = React.useState("");
  const [runKind, setRunKind] = React.useState<PyrlRunKind>("MAIN");
  const [supplementsRunId, setSupplementsRunId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateRun();
  const mainRunsQuery = useRuns({});

  const mainRunItems = React.useMemo(
    () =>
      (mainRunsQuery.data ?? [])
        .filter((r) => r.runKind === "MAIN")
        .map((r) => ({ value: r.id, label: `${r.periodKey} — ${tStatuses(r.status)}` })),
    [mainRunsQuery.data, tStatuses],
  );

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setPeriodKey("");
      setRunKind("MAIN");
      setSupplementsRunId("");
      setError(null);
    }
  }

  const validPeriodKey = PERIOD_KEY_PATTERN.test(periodKey);
  const canSubmit =
    validPeriodKey &&
    (runKind === "MAIN" || !!supplementsRunId) &&
    !createMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: CreatePyrlRunDto = {
      periodKey,
      runKind,
      supplementsRunId: runKind === "SUPPLEMENTARY" ? supplementsRunId : undefined,
    };
    try {
      await createMutation.mutateAsync(dto);
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label required>{t("periodKeyLabel")}</Label>
            <Input type="month" value={periodKey} onChange={(e) => setPeriodKey(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t("periodKeyHint")}</p>
          </div>

          <div className="space-y-1.5">
            <Label required>{t("runKindLabel")}</Label>
            <Select value={runKind} onValueChange={(v) => setRunKind(v as PyrlRunKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RUN_KINDS.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {tKinds(kind)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{runKind === "MAIN" ? t("mainHint") : t("supplementaryHint")}</p>
          </div>

          {runKind === "SUPPLEMENTARY" && (
            <div className="space-y-1.5">
              <Label required>{t("supplementsRunIdLabel")}</Label>
              <Combobox
                items={mainRunItems}
                value={supplementsRunId}
                onChange={setSupplementsRunId}
                placeholder={mainRunsQuery.isLoading ? t("loadingRuns") : t("supplementsRunIdPlaceholder")}
                searchPlaceholder={t("supplementsRunIdSearchPlaceholder")}
                emptyText={t("supplementsRunIdEmptyText")}
                disabled={mainRunsQuery.isLoading}
              />
              <p className="text-xs text-muted-foreground">{t("supplementsRunIdHint")}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {createMutation.isPending ? t("creating") : t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
