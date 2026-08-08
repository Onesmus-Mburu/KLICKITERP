"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import type { FeeStructureLineResponseDto, FeeStructureResponseDto } from "@klickit/contracts";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { useFeeCategories } from "../hooks/use-fee-categories";
import { useCreateFeeStructure } from "../hooks/use-fee-structures";
import { addFeeStructureLine } from "../api/fee-structures.api";

/**
 * Phase 6 Slice 3b follow-up — "Edit" action for a PUBLISHED fee structure.
 *
 * `bill_fee_structure_line` rows are genuinely immutable once published
 * (`trg_bill_structure_immutable`, a real DB trigger protecting already
 * generated invoices that reference the exact published version — see
 * `docs/phase-6/PROGRESS.md`'s Slice 3b section). This does NOT mutate the
 * published row. Instead, per the agreed design:
 *
 * 1. Creates a new DRAFT (`POST /billing/fee-structures`) scoped to the
 *    EXACT same `(academicYearId, classId, streamId?, boarding?,
 *    feeGroupId?)` — `FeeStructuresService.createDraft()`'s own versioning
 *    logic computes the next version number for that scope automatically, no
 *    "clone" flag needed (confirmed in Slice 3b's own work).
 * 2. Loops `POST /billing/fee-structures/:id/lines` once per existing line
 *    (already fetched by the caller via `useFeeStructureLines`, passed in as
 *    `lines` — no extra `GET` needed), carrying over `feeCategoryId`/
 *    `termId`/`dueDate`/`amount`/`isOptional` exactly.
 * 3. Navigates to the new DRAFT's detail page, which is already the fully
 *    editable DRAFT-editing screen (`<FeeStructureLineForm>`/
 *    `<FeeStructureLinesTable editable>`) — no new editing UI.
 *
 * Line-copy failures are reported with the same real per-item
 * succeeded/failed discipline `FeeStructureCreateDialog`'s multi-grade loop
 * and the Students-module bulk-import feature both already established — a
 * partial failure never leaves the user silently guessing which lines made
 * it. The new DRAFT itself is never rolled back on a partial failure (the
 * successfully-copied lines are real and useful); a link straight to it is
 * offered so the user can finish the rest manually.
 */
export function EditPublishedFeeStructureButton({
  structure,
  lines,
}: {
  structure: FeeStructureResponseDto;
  lines: FeeStructureLineResponseDto[];
}) {
  const t = useTranslations("billing.feeStructures.editDialog");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const categoriesQuery = useFeeCategories();
  const createMutation = useCreateFeeStructure();

  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [partialResult, setPartialResult] = React.useState<{
    succeededCount: number;
    failed: { label: string; message: string }[];
    newStructureId: string;
  } | null>(null);

  const categoryNameById = React.useMemo(
    () => new Map((categoriesQuery.data ?? []).map((c) => [c.id, c.name])),
    [categoriesQuery.data],
  );

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setError(null);
      setPartialResult(null);
    }
  }

  async function handleConfirm() {
    setError(null);
    setPartialResult(null);
    setSubmitting(true);

    let created: FeeStructureResponseDto;
    try {
      created = await createMutation.mutateAsync({
        academicYearId: structure.academicYearId,
        classId: structure.classId,
        streamId: structure.streamId ?? undefined,
        boarding: (structure.boarding as "DAY" | "BOARDER" | null) ?? undefined,
        feeGroupId: structure.feeGroupId ?? undefined,
      });
    } catch (err) {
      setSubmitting(false);
      const message = err instanceof ApiError ? err.message : t("genericError");
      setError(t("createFailed", { message }));
      return;
    }

    const failed: { label: string; message: string }[] = [];
    let succeededCount = 0;
    for (const line of lines) {
      try {
        await addFeeStructureLine(created.id, {
          feeCategoryId: line.feeCategoryId,
          termId: line.termId,
          dueDate: line.dueDate,
          amount: line.amount,
          isOptional: line.isOptional,
        });
        succeededCount += 1;
      } catch (err) {
        failed.push({
          label: `${categoryNameById.get(line.feeCategoryId) ?? line.feeCategoryId} (${line.dueDate})`,
          message: err instanceof ApiError ? err.message : t("genericError"),
        });
      }
    }
    setSubmitting(false);

    if (failed.length === 0) {
      setOpen(false);
      router.push(`/billing/fee-structures/${created.id}`);
      return;
    }

    setPartialResult({ succeededCount, failed, newStructureId: created.id });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="print:hidden">
          <Pencil className="size-4" />
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

        {partialResult && (
          <Alert variant={partialResult.succeededCount > 0 ? "warning" : "destructive"}>
            <AlertDescription>
              <p>
                {partialResult.succeededCount > 0
                  ? t("partial.succeeded", { succeeded: partialResult.succeededCount, total: lines.length })
                  : t("partial.noneSucceeded", { total: lines.length })}
              </p>
              <ul className="mt-1 list-inside list-disc">
                {partialResult.failed.map((f, i) => (
                  <li key={i}>
                    {f.label}: {f.message}
                  </li>
                ))}
              </ul>
              <p className="mt-2">
                <Link className="font-medium underline" href={`/billing/fee-structures/${partialResult.newStructureId}`}>
                  {t("goToNewVersion")}
                </Link>
              </p>
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          {partialResult ? (
            // A partial failure already created a real new DRAFT — re-running `handleConfirm`
            // from here would create YET ANOTHER draft version rather than retrying the failed
            // lines, so the only sane action left is closing; the alert above already links
            // straight to the new draft where the missing lines can be added manually.
            <Button type="button" onClick={() => setOpen(false)}>
              {tCommon("close")}
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="button" onClick={handleConfirm} disabled={submitting}>
                {submitting ? t("creating") : t("confirm")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
