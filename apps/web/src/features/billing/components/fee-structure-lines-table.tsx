"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import type { FeeStructureLineResponseDto } from "@klickit/contracts";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoneyInput } from "@/components/patterns/money-input";
import { DataTable } from "@/components/patterns/data-table";
import { ApiError } from "@/lib/api-error";
import { DEFAULT_CURRENCY, formatMoney } from "@/lib/money";
import { useFeeCategories } from "../hooks/use-fee-categories";
import { useUpdateFeeStructureLine } from "../hooks/use-fee-structures";
import { useTerms } from "../hooks/use-academic-calendar";

/**
 * Lines table for a fee structure — read-only once `status !== "DRAFT"`
 * (`FeeStructuresService.updateLine()`'s own server-side guard); while
 * DRAFT, each row's amount/term/due-date is inline-editable via
 * `POST /billing/fee-structures/lines/:lineId` (a real `POST`, not `PATCH` —
 * see `../api/fee-structures.api.ts`'s doc comment).
 *
 * Phase 6 Slice 3b: `UpdateFeeStructureLineDto` widened to require
 * `termId`/`dueDate` alongside `amount` (not amount alone), so a DRAFT
 * line's term/due-date can be corrected in place, not just its amount — the
 * inline editor now edits all three together, in one `POST`.
 */
export function FeeStructureLinesTable({
  structureId,
  academicYearId,
  lines,
  editable,
}: {
  structureId: string;
  academicYearId: string;
  lines: FeeStructureLineResponseDto[];
  editable: boolean;
}) {
  const t = useTranslations("billing.feeStructures.detail");
  const categoriesQuery = useFeeCategories();
  const termsQuery = useTerms(academicYearId);
  const updateLineMutation = useUpdateFeeStructureLine(structureId);

  const [editingLineId, setEditingLineId] = React.useState<string | null>(null);
  // Never actually rendered before `setDraftAmount(row.original.amount)` runs (both are set
  // together when a row's Edit action fires, right below) — "" rather than a fake "0.0000",
  // matching `<MoneyInput>`'s own real-empty-vs-placeholder discipline (Phase 6 Slice 3b follow-up).
  const [draftAmount, setDraftAmount] = React.useState<string>("");
  const [draftTermId, setDraftTermId] = React.useState<string>("");
  const [draftDueDate, setDraftDueDate] = React.useState<string>("");
  const [rowError, setRowError] = React.useState<string | null>(null);

  const categoryNameById = React.useMemo(() => new Map((categoriesQuery.data ?? []).map((c) => [c.id, c.name])), [categoriesQuery.data]);
  const termNameById = React.useMemo(() => new Map((termsQuery.data ?? []).map((term) => [term.id, term.name])), [termsQuery.data]);

  const handleSave = React.useCallback(
    async (lineId: string) => {
      setRowError(null);
      if (!draftAmount.trim()) {
        setRowError(t("amountInvalid"));
        return;
      }
      if (!draftTermId) {
        setRowError(t("termRequired"));
        return;
      }
      if (!draftDueDate) {
        setRowError(t("dueDateRequired"));
        return;
      }
      try {
        await updateLineMutation.mutateAsync({ lineId, dto: { amount: draftAmount, termId: draftTermId, dueDate: draftDueDate } });
        setEditingLineId(null);
      } catch (err) {
        setRowError(err instanceof ApiError ? err.message : t("genericError"));
      }
    },
    [draftAmount, draftTermId, draftDueDate, t, updateLineMutation],
  );

  const columns = React.useMemo<ColumnDef<FeeStructureLineResponseDto>[]>(
    () => [
      {
        id: "category",
        header: t("lineCategory"),
        cell: ({ row }) => categoryNameById.get(row.original.feeCategoryId) ?? row.original.feeCategoryId,
      },
      {
        id: "term",
        header: t("lineTerm"),
        cell: ({ row }) =>
          editingLineId === row.original.id ? (
            <Select value={draftTermId} onValueChange={setDraftTermId}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue placeholder={t("selectTerm")} />
              </SelectTrigger>
              <SelectContent>
                {termsQuery.data?.map((term) => (
                  <SelectItem key={term.id} value={term.id}>
                    {term.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            (termNameById.get(row.original.termId) ?? row.original.termId)
          ),
      },
      {
        id: "dueDate",
        header: t("lineDueDate"),
        cell: ({ row }) =>
          editingLineId === row.original.id ? (
            <Input type="date" className="h-9 w-36" value={draftDueDate} onChange={(e) => setDraftDueDate(e.target.value)} />
          ) : (
            row.original.dueDate
          ),
      },
      {
        id: "amount",
        header: t("lineAmount"),
        cell: ({ row }) =>
          editingLineId === row.original.id ? (
            <div className="flex items-center gap-2">
              <MoneyInput value={draftAmount} onValueChange={(v) => setDraftAmount(v ?? "")} currency={DEFAULT_CURRENCY} className="h-9 w-36" />
              <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => handleSave(row.original.id)} disabled={updateLineMutation.isPending}>
                <Check className="size-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setEditingLineId(null)}>
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            formatMoney(row.original.amount)
          ),
      },
      {
        id: "isOptional",
        header: t("lineOptional"),
        cell: ({ row }) => (row.original.isOptional ? <Badge variant="soft-secondary">{t("optionalYes")}</Badge> : "—"),
      },
      ...(editable
        ? [
            {
              id: "actions",
              header: "",
              cell: ({ row }: { row: { original: FeeStructureLineResponseDto } }) =>
                editingLineId === row.original.id ? null : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="print:hidden"
                    onClick={() => {
                      setEditingLineId(row.original.id);
                      setDraftAmount(row.original.amount);
                      setDraftTermId(row.original.termId);
                      setDraftDueDate(row.original.dueDate);
                      setRowError(null);
                    }}
                  >
                    <Pencil className="size-4" />
                    {t("editAmount")}
                  </Button>
                ),
            } as ColumnDef<FeeStructureLineResponseDto>,
          ]
        : []),
    ],
    [t, categoryNameById, termNameById, termsQuery.data, editingLineId, draftAmount, draftTermId, draftDueDate, editable, updateLineMutation.isPending, handleSave],
  );

  return (
    <div className="space-y-2">
      {rowError && <p className="text-xs text-destructive">{rowError}</p>}
      <DataTable columns={columns} data={lines} />
    </div>
  );
}
