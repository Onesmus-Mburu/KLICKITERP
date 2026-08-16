"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { CreatePyrlStatutoryTableDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-error";
import { useCreateStatutoryTable } from "../hooks/use-statutory-tables";
import { defaultParamsForKind, PYRL_STATUTORY_KINDS, type PyrlStatutoryKind } from "../lib/statutory-params";
import { StatutoryParamsForm } from "./statutory-params-form";

const SOURCE_NOTE_MAX_LENGTH = 2000;

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

/**
 * Phase 6 Slice 22 Part 4 (Payroll, Module 15) — the statutory rate table
 * create form: `kind` (picked FIRST, drives which of the 4 structurally
 * distinct params sub-forms renders — see `statutory-params-form.tsx`'s own
 * doc comment) + `effectiveFrom` (required date, defaulted to today) + the
 * kind-specific `params` + `sourceNote` (required, real provenance text —
 * see below). `kind`/`effectiveFrom` are BOTH create-only/immutable after
 * this — `edit-statutory-table-dialog.tsx` omits both entirely, confirmed by
 * reading `UpdatePyrlStatutoryTableDto` directly (`params?`/`sourceNote?`
 * only). Unlike `pyrl_salary_structure.effectiveFrom` (Part 2, found purely
 * decorative), THIS `effectiveFrom` is the real BR-PYRL-01 time boundary a
 * payroll run's `findEffectiveFor()` lookup relies on — the hint text below
 * says so plainly, the opposite message from Part 2's own
 * `effectiveFromHint`.
 *
 * **`sourceNote` intentionally has NO pre-filled default text** — this
 * part's own task brief is explicit that the real seed disclaimer
 * (`packages/server/src/migrations/0900-seed-permissions-and-roles.ts:490-497`)
 * must never be offered here as if it were the user's own attestation; only
 * a placeholder HINTING at what a good source note looks like (citing the
 * specific KRA/NSSF/SHIF/AHL gazette notice and date) is shown.
 *
 * **Switching `kind` after already editing `params` resets `params` to that
 * new kind's own default shape** (via `defaultParamsForKind()`) — the 4
 * shapes share no fields, so there is no sensible "carry over" behavior
 * between them.
 *
 * Duplicate `(kind, effectiveFrom)` now gets a real 409 — this part's own
 * opportunistic backend fix (`StatutoryTablesService.create()`), surfaced
 * verbatim via `ApiError.message`.
 */
export function CreateStatutoryTableDialog({ defaultKind }: { defaultKind?: PyrlStatutoryKind }) {
  const t = useTranslations("payroll.statutoryTables.createDialog");
  const tKinds = useTranslations("payroll.statutoryTables.kinds");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<PyrlStatutoryKind>(defaultKind ?? "PAYE");
  const [effectiveFrom, setEffectiveFrom] = React.useState(todayIsoDate());
  const [params, setParams] = React.useState<Record<string, unknown>>(() => defaultParamsForKind(defaultKind ?? "PAYE"));
  const [sourceNote, setSourceNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateStatutoryTable();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      const initialKind = defaultKind ?? "PAYE";
      setKind(initialKind);
      setEffectiveFrom(todayIsoDate());
      setParams(defaultParamsForKind(initialKind));
      setSourceNote("");
      setError(null);
    }
  }

  function handleKindChange(next: PyrlStatutoryKind) {
    setKind(next);
    setParams(defaultParamsForKind(next));
  }

  const canSubmit = !!effectiveFrom && sourceNote.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: CreatePyrlStatutoryTableDto = {
      kind,
      effectiveFrom,
      params,
      sourceNote: sourceNote.trim(),
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>{t("kindLabel")}</Label>
              <Select value={kind} onValueChange={(v) => handleKindChange(v as PyrlStatutoryKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PYRL_STATUTORY_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {tKinds(k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("kindHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label required>{t("effectiveFromLabel")}</Label>
              <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
              <p className="text-xs text-muted-foreground">{t("effectiveFromHint")}</p>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("paramsSectionLabel")}</p>
            <StatutoryParamsForm kind={kind} params={params} onChange={setParams} />
          </div>

          <div className="space-y-1.5">
            <Label required>{t("sourceNoteLabel")}</Label>
            <Textarea
              value={sourceNote}
              maxLength={SOURCE_NOTE_MAX_LENGTH}
              onChange={(e) => setSourceNote(e.target.value)}
              placeholder={t("sourceNotePlaceholder")}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">{t("sourceNoteHint")}</p>
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
