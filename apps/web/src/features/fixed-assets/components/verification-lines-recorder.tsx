"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Save } from "lucide-react";
import type { FaVerificationLineResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/lib/api-error";
import { useRecordVerificationCounts } from "../hooks/use-verifications";

const CONDITION_MAX_LENGTH = 20; // fa_asset.condition/fa_verification_line.condition are both varchar(20).

/** `["OPEN", "COUNTING"].includes(status)` — the exact same window `VerificationService.recordCounts()` itself accepts. */
const COUNTABLE_STATUSES = new Set(["OPEN", "COUNTING"]);

interface LineDraft {
  found: boolean;
  condition: string;
  notes: string;
}

/**
 * Phase 6 Slice 23 Part 5 (Fixed Assets, Module 17) — the per-line
 * found/condition/notes recording UI + real-time progress indicator, the
 * centerpiece of this part's own live-testable surface. Mirrors Inventory's
 * own `stock-take-count-form.tsx` shape (batch-per-click, doubles as both
 * the entry screen and the read-only report once the window closes) but
 * this module's own completeness signal is genuinely DIFFERENT —
 * `found` is a NOT NULL boolean whose `false` default doubles as BOTH "not
 * yet examined" and "confirmed missing" (confirmed by reading
 * `FaVerificationLineEntity`/`VerificationService.recordCounts()` directly),
 * so unlike `inv_stock_take_line.countedQty` there is no nullable column
 * that naturally distinguishes "touched" from "untouched" on `found` alone.
 * **`notes` is the real signal instead**: it starts genuinely `null` and
 * becomes non-null (an explicit value, or `""` if the caller omits it) the
 * FIRST time `recordCounts()` ever touches that line — so this component
 * shows **"Not yet recorded"** for `line.notes === null` (and no local
 * unsaved draft), distinctly from **"Recorded — Missing"** for
 * `line.notes !== null && line.found === false`, never conflating the two.
 *
 * **Batch-per-click, partial batches genuinely supported** — only lines the
 * user has actually touched THIS session (present in local `draft`, keyed
 * by `lineId`) are included in each `POST .../counts` call; editing the
 * Found/Missing toggle, the condition input, or the notes input all mark a
 * line as drafted. This means a real, partial "some lines saved, others
 * still blank" call is a first-class, intentional interaction (not just an
 * implementation accident) — `recordCounts()` accepts repeated partial
 * batches and merges, the same "partial-then-resubmit is fine" allowance
 * `stock-take-count-form.tsx`'s own doc comment documents. The session's own
 * real `status` (`OPEN -> COUNTING -> REVIEW`) is the authoritative
 * progress signal, refetched after every save — the progress bar/count text
 * below reads directly off the real `lines` data (`notes !== null`), not off
 * local draft state, so it never overstates progress that hasn't actually
 * been saved yet.
 */
export function VerificationLinesRecorder({
  verificationId,
  status,
  lines,
  assetLabelById,
}: {
  verificationId: string;
  status: string;
  lines: FaVerificationLineResponseDto[];
  assetLabelById: Map<string, string>;
}) {
  const t = useTranslations("fixedAssets.verifications.linesRecorder");
  const [draft, setDraft] = React.useState<Record<string, LineDraft>>({});
  const [error, setError] = React.useState<string | null>(null);
  const recordCountsMutation = useRecordVerificationCounts();

  const editable = COUNTABLE_STATUSES.has(status);

  function draftFor(line: FaVerificationLineResponseDto): LineDraft {
    return draft[line.id] ?? { found: line.found, condition: line.condition ?? "", notes: line.notes ?? "" };
  }

  function touchLine(line: FaVerificationLineResponseDto, patch: Partial<LineDraft>) {
    setDraft((prev) => ({ ...prev, [line.id]: { ...draftFor(line), ...patch } }));
  }

  const recordedCount = lines.filter((l) => l.notes !== null).length;
  const totalCount = lines.length;
  const allRecorded = totalCount > 0 && recordedCount === totalCount;
  const draftedLineIds = Object.keys(draft);
  const canSave = editable && draftedLineIds.length > 0 && !recordCountsMutation.isPending;

  async function handleSave() {
    if (!canSave) return;
    setError(null);
    try {
      await recordCountsMutation.mutateAsync({
        id: verificationId,
        dto: {
          counts: draftedLineIds.map((lineId) => {
            const d = draft[lineId];
            return { lineId, found: d.found, condition: d.condition.trim() || undefined, notes: d.notes };
          }),
        },
      });
      setDraft({});
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{t("progressLabel", { recorded: recordedCount, total: totalCount })}</p>
          <div className="h-1.5 w-48 overflow-hidden rounded-full bg-muted">
            <div
              className={allRecorded ? "h-full bg-success" : "h-full bg-primary"}
              style={{ width: totalCount > 0 ? `${Math.round((recordedCount / totalCount) * 100)}%` : "0%" }}
            />
          </div>
        </div>
        <Badge variant={allRecorded ? "soft-success" : "soft-secondary"}>{allRecorded ? t("progressComplete") : t("progressIncomplete")}</Badge>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.asset")}</TableHead>
              <TableHead className="w-40">{t("columns.recordedState")}</TableHead>
              <TableHead className="w-52">{t("columns.found")}</TableHead>
              <TableHead className="w-36">{t("columns.condition")}</TableHead>
              <TableHead className="w-56">{t("columns.notes")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => {
              const d = draftFor(line);
              const isDrafted = draft[line.id] !== undefined;
              const isRecorded = line.notes !== null;
              return (
                <TableRow key={line.id}>
                  <TableCell>{assetLabelById.get(line.assetId) ?? line.assetId}</TableCell>
                  <TableCell>
                    {isDrafted ? (
                      <Badge variant="soft-warning">{t("stateUnsaved")}</Badge>
                    ) : isRecorded ? (
                      <Badge variant={line.found ? "soft-success" : "soft-destructive"}>
                        {line.found ? t("stateRecordedFound") : t("stateRecordedMissing")}
                      </Badge>
                    ) : (
                      <Badge variant="soft-secondary">{t("stateNotRecorded")}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {editable ? (
                      <div className="flex gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant={isDrafted || isRecorded ? (d.found ? "default" : "outline") : "outline"}
                          onClick={() => touchLine(line, { found: true })}
                        >
                          {t("markFound")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={isDrafted || isRecorded ? (!d.found ? "default" : "outline") : "outline"}
                          onClick={() => touchLine(line, { found: false })}
                        >
                          {t("markMissing")}
                        </Button>
                      </div>
                    ) : (
                      <span className="text-sm text-foreground">{isRecorded ? (line.found ? t("markFound") : t("markMissing")) : "—"}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {editable ? (
                      <Input
                        value={d.condition}
                        maxLength={CONDITION_MAX_LENGTH}
                        placeholder={t("conditionPlaceholder")}
                        onChange={(e) => touchLine(line, { condition: e.target.value })}
                        className="w-32"
                      />
                    ) : (
                      (line.condition ?? "—")
                    )}
                  </TableCell>
                  <TableCell>
                    {editable ? (
                      <Input
                        value={d.notes}
                        placeholder={t("notesPlaceholder")}
                        onChange={(e) => touchLine(line, { notes: e.target.value })}
                        className="w-52"
                      />
                    ) : (
                      (line.notes ?? "—")
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
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
