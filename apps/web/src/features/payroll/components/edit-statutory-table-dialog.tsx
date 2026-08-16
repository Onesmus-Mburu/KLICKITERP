"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import type { PyrlStatutoryTableResponseDto, UpdatePyrlStatutoryTableDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-error";
import { useUpdateStatutoryTable } from "../hooks/use-statutory-tables";
import type { PyrlStatutoryKind } from "../lib/statutory-params";
import { StatutoryParamsForm } from "./statutory-params-form";

const SOURCE_NOTE_MAX_LENGTH = 2000;

/**
 * Phase 6 Slice 22 Part 4 (Payroll, Module 15) — `UpdatePyrlStatutoryTableDto`
 * only allows `params?`/`sourceNote?` (confirmed by reading
 * `statutory-table.dto.ts` directly). `kind`/`effectiveFrom` are OMITTED from
 * this form entirely, not disabled — create-only/immutable, per this part's
 * own task brief matching every prior Payroll part's own "immutable fields
 * get omitted, not disabled" precedent — both are shown read-only in the
 * header instead, as real context for what's being edited. The row's own
 * already-fixed `kind` still drives which of the 4 params sub-forms renders
 * (`statutory-params-form.tsx`), it just can't be changed here.
 */
export function EditStatutoryTableDialog({ table }: { table: PyrlStatutoryTableResponseDto }) {
  const t = useTranslations("payroll.statutoryTables.editDialog");
  const tKinds = useTranslations("payroll.statutoryTables.kinds");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [params, setParams] = React.useState<Record<string, unknown>>(table.params);
  const [sourceNote, setSourceNote] = React.useState(table.sourceNote);
  const [error, setError] = React.useState<string | null>(null);

  const updateMutation = useUpdateStatutoryTable();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setParams(table.params);
      setSourceNote(table.sourceNote);
      setError(null);
    }
  }

  const canSubmit = sourceNote.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: UpdatePyrlStatutoryTableDto = {};
    if (JSON.stringify(params) !== JSON.stringify(table.params)) dto.params = params;
    if (sourceNote.trim() !== table.sourceNote) dto.sourceNote = sourceNote.trim();

    if (Object.keys(dto).length === 0) {
      setOpen(false);
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: table.id, dto });
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title", { kind: tKinds(table.kind), effectiveFrom: table.effectiveFrom })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <Alert variant="warning">
          <AlertDescription>{t("immutableFieldsNote", { kind: tKinds(table.kind), effectiveFrom: table.effectiveFrom })}</AlertDescription>
        </Alert>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("paramsSectionLabel")}</p>
            <StatutoryParamsForm kind={table.kind as PyrlStatutoryKind} params={params} onChange={setParams} />
          </div>

          <div className="space-y-1.5">
            <Label required>{t("sourceNoteLabel")}</Label>
            <Textarea value={sourceNote} maxLength={SOURCE_NOTE_MAX_LENGTH} onChange={(e) => setSourceNote(e.target.value)} rows={4} />
          </div>
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
