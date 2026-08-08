"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ColumnDef } from "@tanstack/react-table";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DataTable } from "@/components/patterns/data-table";
import { ApiError } from "@/lib/api-error";
import { useClasses } from "../hooks/use-classes";
import { useFeeGroups } from "../hooks/use-fee-groups";
import { useAdmissionNoAutogenSetting } from "../hooks/use-admission-no-autogen";
import { STUDENTS_QUERY_KEY } from "../hooks/use-students";
import { createStudent } from "../api/students.api";
import { GuardianLinkAfterCreateError, createAndLinkGuardian, GUARDIANS_QUERY_KEY } from "../hooks/use-guardians";
import { downloadStudentImportTemplate, parseStudentImportFile, type RawImportRow } from "../lib/bulk-import-xlsx";
import { resolveImportRows, type ImportRowReason, type ResolvedImportRow } from "../lib/bulk-import-resolve";
import { useQueryClient } from "@tanstack/react-query";

type Step = "setup" | "preview" | "importing" | "results";

interface ImportOutcome {
  row: ResolvedImportRow;
  success: boolean;
  /** Set only when `createStudent()` itself failed — the row is a real failure. */
  errorMessage?: string;
  /**
   * Phase 6 Slice 2b follow-up item 1 — set when the student WAS created
   * successfully but one or more of this row's guardians couldn't be
   * created/linked (the same non-atomic, documented tradeoff
   * `student-form.tsx`'s inline guardian section and
   * `guardian-link-dialog.tsx` already establish — `createAndLinkGuardian`
   * is two independent HTTP calls, not one transaction). The row still
   * counts as a SUCCESS (the student is real and queryable either way);
   * this is surfaced as a warning, not a failure.
   */
  guardianWarning?: string;
  /**
   * Phase 6 Slice 2c — one entry per guardian actually created/linked for
   * this row (successes only — a failed guardian is already covered by
   * `guardianWarning` above), so the admin reviewing import results can see
   * which guardian blocks resolved to an ALREADY-EXISTING guardian (a real
   * sibling match) vs. a genuinely new record — useful signal the plan
   * explicitly asked this results view to surface.
   */
  guardianResults?: { relationship: string; wasExisting: boolean }[];
}

/**
 * Phase 6 Slice 2b item 5 — bulk import via Excel, deliberately scoped down
 * per the plan: client-side sequential imports against the EXISTING
 * single-student `POST /students` endpoint (no real backend batch endpoint
 * — none exists for this domain). Explicitly documented tradeoff, not
 * hidden: slower and non-atomic for very large files (`scopeNote` below,
 * always visible on the setup step). Models its results screen on this
 * codebase's own "partial-failure, always-show-a-summary" spirit (the
 * promotion-batch pattern), even though there's no backend batch endpoint
 * backing it here.
 *
 * Phase 6 Slice 2b follow-up item 1 — now DOES create+link guardians per
 * row (up to 4, one per relationship block), sequentially, right after
 * that row's student is created — reusing `createAndLinkGuardian()`
 * (`use-guardians.ts`), the same non-atomic create-then-link function the
 * single-student form and `guardian-link-dialog.tsx` already share. Still
 * NOT a single atomic operation across student+guardians — see
 * `scopeNote`'s updated copy.
 *
 * A real, previously-undiscovered bug was found and fixed while extending
 * this file: `bulk-import-resolve.ts`'s `resolveImportRows()` built a valid
 * `payload` per row but never actually included it on the returned object
 * — every call to `createStudent(row.payload!)` below was silently sent
 * `undefined`. Fixed alongside this follow-up (see that file's
 * `ResolvedImportRow` return statement) — flagged here since it means the
 * import-execution step was never actually exercisable before this pass,
 * despite the prior slice's own mechanism-level verification (which
 * validated a hand-built candidate directly, never round-tripped through
 * `resolveImportRows()` itself).
 */
export function BulkImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("students.bulkImport");
  const tCommon = useTranslations("common");
  // Reuses the SAME relationship labels (Father/Mother/Guardian/Sponsor)
  // guardian-link-dialog.tsx/guardian-fields.tsx already establish, rather
  // than inventing a second copy in the bulkImport i18n namespace.
  const tGuardian = useTranslations("students.guardianDialog");
  const queryClient = useQueryClient();

  const classesQuery = useClasses();
  const feeGroupsQuery = useFeeGroups();
  const autogenQuery = useAdmissionNoAutogenSetting();

  const [step, setStep] = React.useState<Step>("setup");
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [resolving, setResolving] = React.useState(false);
  const [resolvedRows, setResolvedRows] = React.useState<ResolvedImportRow[]>([]);
  const [importProgress, setImportProgress] = React.useState({ done: 0, total: 0 });
  const [outcomes, setOutcomes] = React.useState<ImportOutcome[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) {
      setStep("setup");
      setParseError(null);
      setResolvedRows([]);
      setOutcomes([]);
      setImportProgress({ done: 0, total: 0 });
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [open]);

  function reasonText(reason: ImportRowReason): string {
    switch (reason.code) {
      case "unknownClass":
        return t("unknownClass", { name: reason.params?.name ?? "" });
      case "unknownStream":
        return t("unknownStream", { name: reason.params?.name ?? "", className: reason.params?.className ?? "" });
      case "unknownFeeGroup":
        return t("unknownFeeGroup", { name: reason.params?.name ?? "" });
      case "missingRequiredField":
        return t("missingRequiredField", { field: reason.params?.field ?? "" });
      case "invalidBoarding":
        return t("invalidBoarding");
      case "guardianNameRequired":
        return t("guardianNameRequired", { relationship: relationshipLabel(reason.params?.relationship) });
      case "guardianContactRequired":
        return t("guardianContactRequired", { relationship: relationshipLabel(reason.params?.relationship) });
      case "schemaError":
        return `${reason.params?.field ?? ""}: ${reason.params?.message ?? ""}`;
      default:
        return "";
    }
  }

  function relationshipLabel(code: string | undefined): string {
    if (!code) return "";
    // Dynamic key lookup against a fixed 4-value convention list — same
    // pattern student-form.tsx's `t(\`boardingKind.${kind}\`)` already uses.
    return tGuardian(`relationshipOptions.${code}`);
  }

  async function handleFileChosen(file: File) {
    setParseError(null);
    setResolving(true);
    try {
      const rawRows: RawImportRow[] = await parseStudentImportFile(file);
      if (rawRows.length === 0) {
        setParseError(t("noRows"));
        setResolving(false);
        return;
      }
      const resolved = await resolveImportRows(rawRows, classesQuery.data ?? [], feeGroupsQuery.data ?? [], autogenQuery.data?.enabled === true);
      setResolvedRows(resolved);
      setStep("preview");
    } catch {
      setParseError(t("parseError"));
    } finally {
      setResolving(false);
    }
  }

  async function handleImport() {
    const validRows = resolvedRows.filter((r) => r.valid && r.payload);
    setStep("importing");
    setImportProgress({ done: 0, total: validRows.length });
    const results: ImportOutcome[] = [];
    let anyGuardianCreated = false;

    // Sequential, not parallel — a deliberate, documented tradeoff (see this
    // component's own doc comment / the always-visible `scopeNote`): easier
    // on the API than firing all requests at once, and each row's real
    // success/failure (e.g. a genuine admissionNo 409 that only surfaces at
    // import time) is captured individually.
    for (const row of validRows) {
      try {
        const created = await createStudent(row.payload!);

        // Phase 6 Slice 2b follow-up item 1 — create+link this row's
        // guardians (if any), also sequentially, reusing the SAME
        // create-then-link function `student-form.tsx`'s inline guardian
        // section and `guardian-link-dialog.tsx`'s "new guardian" tab both
        // already share (`createAndLinkGuardian`, use-guardians.ts) rather
        // than a third reimplementation. Guardian failures don't flip this
        // row to a failure — the student itself was genuinely created.
        let guardianWarning: string | undefined;
        const guardianResults: { relationship: string; wasExisting: boolean }[] = [];
        for (const g of row.guardians) {
          try {
            const { wasExisting } = await createAndLinkGuardian(created.id, g.guardianDto, g.linkDto);
            anyGuardianCreated = true;
            guardianResults.push({ relationship: g.relationship, wasExisting });
          } catch (guardianErr) {
            guardianWarning =
              guardianErr instanceof GuardianLinkAfterCreateError
                ? guardianErr.message
                : t("guardianImportFailed", { relationship: relationshipLabel(g.relationship) });
          }
        }

        results.push({ row, success: true, guardianWarning, guardianResults });
      } catch (err) {
        results.push({ row, success: false, errorMessage: err instanceof ApiError ? err.message : t("parseError") });
      }
      setImportProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    queryClient.invalidateQueries({ queryKey: [...STUDENTS_QUERY_KEY, "list"] });
    if (anyGuardianCreated) {
      queryClient.invalidateQueries({ queryKey: GUARDIANS_QUERY_KEY });
    }
    setOutcomes(results);
    setStep("results");
  }

  const validCount = resolvedRows.filter((r) => r.valid).length;
  const invalidCount = resolvedRows.length - validCount;
  const succeededCount = outcomes.filter((o) => o.success).length;
  const failedCount = outcomes.length - succeededCount;

  const previewColumns = React.useMemo<ColumnDef<ResolvedImportRow>[]>(
    () => [
      { id: "rowNumber", header: t("columnRow"), accessorKey: "rowNumber" },
      { id: "admissionNo", header: t("columnAdmissionNo"), cell: ({ row }) => row.original.raw.admissionNo || "—" },
      {
        id: "name",
        header: t("columnName"),
        cell: ({ row }) => `${row.original.raw.firstName} ${row.original.raw.lastName}`.trim() || "—",
      },
      { id: "class", header: t("columnClass"), cell: ({ row }) => row.original.raw.className || "—" },
      { id: "stream", header: t("columnStream"), cell: ({ row }) => row.original.raw.streamName || "—" },
      { id: "feeGroup", header: t("columnFeeGroup"), cell: ({ row }) => row.original.raw.feeGroupName || "—" },
      {
        id: "guardians",
        header: t("columnGuardians"),
        // Phase 6 Slice 2b follow-up item 1 — shows which guardians THIS
        // row will create+link on import (relationship labels, primary one
        // marked) — separate from the Reason column, which is where a
        // guardian BLOCK-level error (name-only / contact-only) is
        // reported instead (that block never makes it into `guardians`).
        cell: ({ row }) =>
          row.original.guardians.length === 0 ? (
            "—"
          ) : (
            <ul className="space-y-0.5 text-xs">
              {row.original.guardians.map((g, i) => (
                <li key={i}>
                  {relationshipLabel(g.relationship)}
                  {g.linkDto.isPrimary ? ` (${t("primaryGuardianTag")})` : ""}
                </li>
              ))}
            </ul>
          ),
      },
      {
        id: "status",
        header: t("rowStatus"),
        cell: ({ row }) => (row.original.valid ? <Badge variant="soft-success">{t("rowValid")}</Badge> : <Badge variant="soft-destructive">{t("rowInvalid")}</Badge>),
      },
      {
        id: "reason",
        header: t("columnReason"),
        cell: ({ row }) =>
          row.original.valid ? null : (
            <ul className="list-disc space-y-0.5 pl-4 text-xs text-destructive">
              {row.original.reasons.map((reason, i) => (
                <li key={i}>{reasonText(reason)}</li>
              ))}
            </ul>
          ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t`/`tGuardian` from next-intl are stable per-locale; reasonText/relationshipLabel close over them directly
    [t, tGuardian],
  );

  const resultsColumns = React.useMemo<ColumnDef<ImportOutcome>[]>(
    () => [
      { id: "rowNumber", header: t("columnRow"), cell: ({ row }) => row.original.row.rowNumber },
      { id: "admissionNo", header: t("columnAdmissionNo"), cell: ({ row }) => row.original.row.raw.admissionNo || "—" },
      { id: "name", header: t("columnName"), cell: ({ row }) => `${row.original.row.raw.firstName} ${row.original.row.raw.lastName}`.trim() },
      {
        id: "status",
        header: t("rowStatus"),
        cell: ({ row }) => (row.original.success ? <Badge variant="soft-success">{tCommon("save")}</Badge> : <Badge variant="soft-destructive">{t("columnReason")}</Badge>),
      },
      {
        id: "guardians",
        header: t("columnGuardians"),
        // Phase 6 Slice 2c — per the plan's explicit ask: note when a
        // guardian block resolved to an EXISTING guardian (a real sibling
        // match, `wasExisting:true`) instead of creating a new one — useful
        // signal for the admin reviewing import results, not just a
        // pass/fail flag.
        cell: ({ row }) => {
          const results = row.original.guardianResults ?? [];
          if (results.length === 0) return "—";
          return (
            <ul className="space-y-0.5 text-xs">
              {results.map((g, i) => (
                <li key={i}>
                  {relationshipLabel(g.relationship)} — {g.wasExisting ? t("guardianExistingTag") : t("guardianNewTag")}
                </li>
              ))}
            </ul>
          );
        },
      },
      { id: "reason", header: t("columnReason"), cell: ({ row }) => row.original.errorMessage ?? row.original.guardianWarning ?? "" },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tGuardian` (closed over by relationshipLabel, used in the guardians column above) is stable per-locale, same rationale as previewColumns' own eslint-disable above
    [t, tCommon, tGuardian],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {/* Always visible, per the plan's explicit "document this tradeoff plainly rather than hiding it" instruction. */}
        <Alert variant="warning">
          <AlertDescription>{t("scopeNote")}</AlertDescription>
        </Alert>

        {step === "setup" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">{t("step1Title")}</h3>
              <Button type="button" variant="outline" onClick={downloadStudentImportTemplate}>
                <Download className="size-4" />
                {t("downloadTemplate")}
              </Button>
              <p className="text-xs text-muted-foreground">{t("templateHint")}</p>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">{t("step2Title")}</h3>
              {parseError && (
                <Alert variant="destructive">
                  <AlertDescription>{parseError}</AlertDescription>
                </Alert>
              )}
              <Input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFileChosen(file);
                }}
                disabled={resolving}
              />
              {resolving && <p className="text-xs text-muted-foreground">{t("parsing")}</p>}
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">{t("previewTitle")}</h3>
              <div className="flex gap-2 text-xs">
                <Badge variant="soft-success">{validCount}</Badge>
                <Badge variant="soft-destructive">{invalidCount}</Badge>
              </div>
            </div>
            <DataTable columns={previewColumns} data={resolvedRows} />
          </div>
        )}

        {step === "importing" && (
          <div className="space-y-2 py-6 text-center">
            <p className="text-sm text-foreground">{t("importing", { done: importProgress.done, total: importProgress.total })}</p>
          </div>
        )}

        {step === "results" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">{t("resultsTitle")}</h3>
              <p className="text-sm font-medium text-foreground">{t("resultsSummary", { succeeded: succeededCount, failed: failedCount })}</p>
            </div>
            <DataTable columns={resultsColumns} data={outcomes} />
          </div>
        )}

        <DialogFooter>
          {step === "setup" && (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
          )}
          {step === "preview" && (
            <>
              <Button type="button" variant="outline" onClick={() => setStep("setup")}>
                {t("backToUpload")}
              </Button>
              <Button type="button" onClick={handleImport} disabled={validCount === 0}>
                {t("importButton", { count: validCount })}
              </Button>
            </>
          )}
          {step === "results" && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setResolvedRows([]);
                  setOutcomes([]);
                  setImportProgress({ done: 0, total: 0 });
                  if (fileInputRef.current) fileInputRef.current.value = "";
                  setStep("setup");
                }}
              >
                {t("startOver")}
              </Button>
              <Button type="button" onClick={() => onOpenChange(false)}>
                {t("resultsDone")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
