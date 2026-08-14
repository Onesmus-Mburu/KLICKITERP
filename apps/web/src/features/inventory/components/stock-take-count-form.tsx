"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Save } from "lucide-react";
import type { StockTakeLineResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/money";
import { ApiError } from "@/lib/api-error";
import { formatQty } from "../lib/decimal-qty";
import { useRecordStockTakeCounts } from "../hooks/use-stock-takes";

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

/** `["OPEN", "COUNTING"].includes(status)` — the exact same window `StockTakesService.recordCounts()` itself accepts (`stock-takes.service.ts`'s own guard); the count inputs edit/save affordance renders ONLY in these two statuses, matching the real server-side window exactly rather than guessing at it. */
const COUNTABLE_STATUSES = new Set(["OPEN", "COUNTING"]);

/**
 * Phase 6 Slice 19 Part 3 (Stock Takes, the last part of Module 13) — doubles
 * as BOTH the count-entry screen (while `status` is OPEN/COUNTING, per
 * `COUNTABLE_STATUSES` above) AND the read-only variance report (REVIEW and
 * every later status) — one table, since it's genuinely the same data at
 * different lifecycle points (`GET .../lines`), not two different views.
 *
 * **Batch-per-click, not one call per line** — every line with a currently
 * valid (non-empty, decimal-shaped) input value is included in ONE
 * `POST .../counts` call each time "Save Counts" is clicked; the backend
 * accepts a batch repeatedly and merges (per this part's own explicit
 * "partial-then-resubmit is fine" allowance) — re-clicking Save after
 * editing just one more line harmlessly re-sends the unchanged ones too.
 * Local edits are tracked in `draft` (keyed by lineId) seeded from each
 * line's own `countedQty` on every render where the line isn't currently
 * being edited, so a REVIEW-status re-fetch (via TanStack Query invalidation
 * after a successful save) doesn't fight the user's own in-progress typing.
 */
export function StockTakeCountForm({
  stockTakeId,
  status,
  lines,
  itemLabelById,
}: {
  stockTakeId: string;
  status: string;
  lines: StockTakeLineResponseDto[];
  itemLabelById: Map<string, string>;
}) {
  const t = useTranslations("inventory.stockTakes.countForm");
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const recordCountsMutation = useRecordStockTakeCounts();

  const editable = COUNTABLE_STATUSES.has(status);

  function valueFor(line: StockTakeLineResponseDto): string {
    if (draft[line.id] !== undefined) return draft[line.id];
    return line.countedQty ?? "";
  }

  function handleChange(lineId: string, value: string) {
    setDraft((prev) => ({ ...prev, [lineId]: value }));
  }

  const readyCounts = lines
    .map((line) => ({ lineId: line.id, countedQty: valueFor(line).trim() }))
    .filter((c) => DECIMAL_PATTERN.test(c.countedQty));

  const canSave = editable && readyCounts.length > 0 && !recordCountsMutation.isPending;

  async function handleSave() {
    if (!canSave) return;
    setError(null);
    try {
      await recordCountsMutation.mutateAsync({ id: stockTakeId, dto: { counts: readyCounts } });
      setDraft({});
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.item")}</TableHead>
              <TableHead className="w-32">{t("columns.snapshotQty")}</TableHead>
              <TableHead className="w-36">{t("columns.countedQty")}</TableHead>
              <TableHead className="w-32">{t("columns.varianceQty")}</TableHead>
              <TableHead className="w-36">{t("columns.varianceValue")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>{itemLabelById.get(line.itemId) ?? line.itemId}</TableCell>
                <TableCell>{formatQty(line.snapshotQty)}</TableCell>
                <TableCell>
                  {editable ? (
                    <Input
                      inputMode="decimal"
                      value={valueFor(line)}
                      onChange={(e) => handleChange(line.id, e.target.value)}
                      placeholder="0.0000"
                      className="w-28"
                    />
                  ) : (
                    (line.countedQty !== null ? formatQty(line.countedQty) : t("notCounted"))
                  )}
                </TableCell>
                <TableCell>{line.varianceQty !== null ? formatQty(line.varianceQty) : "—"}</TableCell>
                <TableCell>{line.varianceValue != null ? formatMoney(line.varianceValue) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editable && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{t("saveHint")}</p>
          <Button type="button" onClick={() => void handleSave()} disabled={!canSave}>
            <Save className="size-4" />
            {recordCountsMutation.isPending ? t("saving") : t("saveButton")}
          </Button>
        </div>
      )}
    </div>
  );
}
