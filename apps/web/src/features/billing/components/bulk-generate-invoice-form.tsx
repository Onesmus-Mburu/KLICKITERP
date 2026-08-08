"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { formatMoney } from "@/lib/money";
import { useActiveClasses } from "@/features/students/hooks/use-classes";
import { findWalletByStudent, sweepToInvoices } from "@/features/wallet/api/wallets.api";
import { isInsufficientBalanceError, isTransferNeedsApprovalError } from "@/features/wallet/lib/errors";
import { applyStudentCredit } from "../api/student-credit.api";
import { AcademicYearTermSelect } from "./academic-year-term-select";
import { FeeCategoryChipPicker } from "./fee-category-chip-picker";
import { StudentSelectionGrid } from "./student-selection-grid";
import { getInvoice } from "../api/invoices.api";
import { useBulkGenerateAdhocInvoices, useCategoriesForScope } from "../hooks/use-bulk-adhoc-invoices";

/**
 * `"partialShortfall"` (Phase 6 Slice 12, Part B) — a real invoice that still
 * carries a balance after a wallet sweep (whether the sweep never reached it
 * at all because the wallet ran out first, or reached it and only partially
 * covered it — `WalletTransactionsService.sweepToInvoices()`'s own
 * `shortfall[]` array covers both cases identically, see its doc comment).
 * Deliberately distinct from `"insufficientBalance"` — that kind is the
 * THROWN `BR-WALL-01` floor-violation error (the transfer would push the
 * wallet below its overdraft floor, so the WHOLE aggregate call fails and
 * nothing at all was swept); `"partialShortfall"` is a normal, real `201`
 * response where SOME (possibly zero) money was swept and some balance
 * genuinely remains owing — not an error at all.
 */
export type WalletOutcomeKind = "settled" | "partialShortfall" | "needsApproval" | "insufficientBalance" | "noWallet" | "failed";

export interface WalletOutcome {
  studentId: string;
  invoiceId: string;
  amount: string;
  outcome: WalletOutcomeKind;
  message?: string;
  /** Only ever set on a `"settled"` outcome, and only when `sweepToInvoices()` actually created a receipt (i.e. SOME amount was swept this call). */
  receiptId?: string;
}

/**
 * Phase 6 Slice 12 (Part E) — the "Apply available credit balance"
 * checkbox's own outcome vocabulary. **Judgment call**: a deliberately
 * SEPARATE, narrower type from `WalletOutcomeKind` above, not a reuse of it
 * — the two backend response SHAPES are genuinely identical
 * (`{totalApplied/totalSwept, allocations, receiptId, shortfall}`), but the
 * outcome VOCABULARIES are not: `ReceiptsService.applyStudentCreditToInvoices()`
 * (confirmed by reading it directly, Part D) has no approval-threshold gate
 * (no FR-WALL-013.1 equivalent exists for Credit Balance) and never throws
 * an "insufficient balance" error — it simply applies `min(remaining,
 * invoice.balance)` per invoice and reports the rest via `shortfall`, the
 * same as an exhausted wallet's `sweepToInvoices()` call already does. There
 * is also no `"noWallet"`-equivalent precondition to check first: `GET
 * .../credit-balance` never 404s, and `applyStudentCredit()` takes
 * `studentId` directly — no separate "does this student have an account"
 * lookup is needed the way a wallet sweep needs a wallet id first. Reusing
 * `WalletOutcomeKind` here would mean either dead `switch`/i18n branches
 * that can never actually fire for this flow, or an unsafe cast — a small
 * parallel type (the plan's own offered alternative) models the REAL
 * outcome set instead.
 */
export type CreditBalanceOutcomeKind = "settled" | "partialShortfall" | "failed";

export interface CreditBalanceOutcome {
  studentId: string;
  invoiceId: string;
  amount: string;
  outcome: CreditBalanceOutcomeKind;
  message?: string;
  /** Only ever set on a `"settled"` outcome, and only when `applyStudentCredit()` actually created a receipt (i.e. SOME amount was applied this call). */
  receiptId?: string;
}

/**
 * Sorts the given invoice ids by their real `dueDate` ascending (oldest
 * first) — `sweepToInvoices()`'s own contract requires a caller-ordered,
 * oldest-due-first list (see `wallets.api.ts`'s doc comment), and
 * `BulkAdhocInvoicesService.generateForStudent()`'s own due-date grouping
 * (`packages/server/.../bulk-adhoc-invoices.service.ts`) builds its
 * `invoiceIds` result from `BillFeeStructureLineRepository
 * .listByStructureAndTerm()`, which issues a plain `.find()` with NO
 * `ORDER BY` clause (confirmed by reading it directly) — so the array order
 * `result.succeeded[].invoiceIds` comes back in is NOT actually guaranteed
 * to be due-date order at the SQL level, just usually-coincidentally close
 * to it. Rather than trust that coincidence, this re-sorts explicitly by
 * each invoice's own real `dueDate` (an ISO `YYYY-MM-DD` string, so a plain
 * lexicographic compare is correct) before ever calling `sweepToInvoices()`.
 */
async function sortInvoiceIdsByDueDate(invoiceIds: string[]): Promise<string[]> {
  const withDueDate = await Promise.all(invoiceIds.map(async (invoiceId) => ({ invoiceId, dueDate: (await getInvoice(invoiceId)).dueDate })));
  return withDueDate.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0)).map((i) => i.invoiceId);
}

/**
 * Phase 6 Slice 12 (Part C) — resolves fee-category ids to their real
 * display names for the duplicate-billing skip notices below, the SAME way
 * `categoryOptions` already resolves them for `<FeeCategoryChipPicker>` —
 * falls back to the raw id only if a category somehow isn't in the current
 * scope's catalog (shouldn't normally happen, since every id here always
 * came from this same `categoriesQuery` catalog in the first place).
 */
function formatCategoryNames(ids: string[], categoryNameById: Map<string, string>): string {
  return ids.map((id) => categoryNameById.get(id) ?? id).join(", ");
}

interface GenerateSummary {
  succeededStudents: number;
  succeededInvoices: number;
  failed: { studentId: string; error: string }[];
  /**
   * Phase 6 Slice 12 (Part C) — students whose ENTIRE selected-category set
   * was already really billed this term: nothing was generated for them at
   * all. Distinct from `failed` (not an error — a signal to uncheck and retry).
   */
  skipped: { studentId: string; alreadyBilledCategoryIds: string[] }[];
  /**
   * Phase 6 Slice 12 (Part C) — students who DID succeed, but only for SOME
   * of their selected categories, because the rest were already billed this
   * term. Derived from `result.succeeded[].alreadyBilledCategoryIds`.
   */
  partiallySkipped: { studentId: string; alreadyBilledCategoryIds: string[] }[];
}

/**
 * Slice 2 (Phase 6 Slice 8) — the bulk "Generate Invoice" screen's form:
 * academic-year/term (`<AcademicYearTermSelect autoSelectCurrent>`, reused
 * verbatim from the existing per-student `GenerateInvoiceDialog`) + a grade
 * `<Select>` (`useActiveClasses()`, existing) + Slice 0's
 * `<FeeCategoryChipPicker>` (fed by the new categories-for-scope endpoint
 * once both year+class are chosen) + Slice 0's `<Checkbox>`-backed
 * `<StudentSelectionGrid>` + a "Collect amount from student wallet"
 * checkbox. On submit, calls the Slice 1 bulk-generate endpoint, then —
 * only if the wallet checkbox is checked — calls the new (Phase 6 Slice 12,
 * Part A/B) `sweepToInvoices()` endpoint ONCE PER SUCCEEDED STUDENT (not
 * once per invoice, per the plan) with that student's own newly-generated
 * invoice ids, oldest-due-first. The succeeded/failed summary UX mirrors
 * `FeeStructureCreateDialog`'s own established partial-result pattern.
 *
 * **Phase 6 Slice 12 (Part B)** replaced this file's original naive
 * per-invoice `transferToFees()` loop (Slice 8) with real
 * `sweepToInvoices()` calls — see `runWalletCollection()`'s own doc comment
 * below for the full outcome-mapping logic.
 *
 * **Phase 6 Slice 12 (Part E)** added a sibling "Apply available credit
 * balance" checkbox, wired to the new `applyStudentCredit()` endpoint the
 * same way the wallet checkbox is wired to `sweepToInvoices()` — see
 * `runCreditBalanceCollection()`'s own doc comment below for its
 * outcome-mapping logic and its `CreditBalanceOutcomeKind` doc comment for
 * why it's a separate, narrower type rather than a reuse of
 * `WalletOutcomeKind`. When BOTH checkboxes are checked, wallet runs first,
 * then credit balance — see `handleSubmit()`'s own ordering comment.
 */
export function BulkGenerateInvoiceForm() {
  const t = useTranslations("billing.bulkGenerate");
  const classesQuery = useActiveClasses();

  const [academicYearId, setAcademicYearId] = React.useState<string | null>(null);
  const [termId, setTermId] = React.useState<string | null>(null);
  const [classId, setClassId] = React.useState<string | null>(null);
  const [feeCategoryIds, setFeeCategoryIds] = React.useState<string[]>([]);
  const [studentIds, setStudentIds] = React.useState<string[]>([]);
  const [collectFromWallet, setCollectFromWallet] = React.useState(false);
  const [applyCreditBalance, setApplyCreditBalance] = React.useState(false);

  const [error, setError] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<GenerateSummary | null>(null);
  const [walletOutcomes, setWalletOutcomes] = React.useState<WalletOutcome[] | null>(null);
  const [walletProcessing, setWalletProcessing] = React.useState(false);
  const [creditBalanceOutcomes, setCreditBalanceOutcomes] = React.useState<CreditBalanceOutcome[] | null>(null);
  const [creditBalanceProcessing, setCreditBalanceProcessing] = React.useState(false);

  const categoriesQuery = useCategoriesForScope(academicYearId ?? undefined, classId ?? undefined);
  const bulkGenerateMutation = useBulkGenerateAdhocInvoices();

  // A different class means a different category catalog AND a different student population —
  // stale selections from the previous class must not silently carry over.
  React.useEffect(() => {
    setFeeCategoryIds([]);
    setStudentIds([]);
  }, [classId]);

  const categoryOptions = React.useMemo(
    () =>
      (categoriesQuery.data ?? []).map((c) => ({
        value: c.feeCategoryId,
        label: `${c.name} (${formatMoney(c.exampleAmount)})`,
      })),
    [categoriesQuery.data],
  );

  /** Phase 6 Slice 12 (Part C) — plain id->name lookup for the skip notices, same source data as `categoryOptions`. */
  const categoryNameById = React.useMemo(
    () => new Map((categoriesQuery.data ?? []).map((c) => [c.feeCategoryId, c.name])),
    [categoriesQuery.data],
  );

  const submitting = bulkGenerateMutation.isPending || walletProcessing || creditBalanceProcessing;

  async function handleSubmit() {
    setError(null);
    setSummary(null);
    setWalletOutcomes(null);
    setCreditBalanceOutcomes(null);

    if (!termId) {
      setError(t("termRequired"));
      return;
    }
    if (!classId) {
      setError(t("classRequired"));
      return;
    }
    if (feeCategoryIds.length === 0) {
      setError(t("categoriesRequired"));
      return;
    }
    if (studentIds.length === 0) {
      setError(t("studentsRequired"));
      return;
    }

    let result;
    try {
      result = await bulkGenerateMutation.mutateAsync({ termId, classId, feeCategoryIds, studentIds });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
      return;
    }

    setSummary({
      succeededStudents: result.succeeded.length,
      succeededInvoices: result.succeeded.reduce((sum, s) => sum + s.invoiceIds.length, 0),
      failed: result.failed,
      skipped: result.skipped,
      partiallySkipped: result.succeeded
        .filter((s) => s.alreadyBilledCategoryIds && s.alreadyBilledCategoryIds.length > 0)
        .map((s) => ({ studentId: s.studentId, alreadyBilledCategoryIds: s.alreadyBilledCategoryIds ?? [] })),
    });

    // Phase 6 Slice 12 (Part E) — ordering decision, when BOTH checkboxes are
    // checked: wallet runs FIRST, credit balance SECOND. Wallet was the
    // pre-existing behavior (Part B); credit balance is layered on after it
    // as the new addition, run sequentially against the same
    // newly-generated invoices — the obvious, minimally-surprising choice
    // per the plan's own instruction, and it also means an invoice can be
    // fully settled by the wallet before credit balance is even consulted,
    // so credit balance is only ever applied to whatever the wallet didn't
    // already cover.
    if (collectFromWallet && result.succeeded.length > 0) {
      await runWalletCollection(result.succeeded);
    }
    if (applyCreditBalance && result.succeeded.length > 0) {
      await runCreditBalanceCollection(result.succeeded);
    }
  }

  /**
   * Phase 6 Slice 12 (Part B) — one real `sweepToInvoices()` call per
   * succeeded student (not one `transferToFees()` call per invoice, Slice
   * 8's original design), each call covering ALL of that student's own
   * newly-generated invoices at once, oldest-due-first
   * (`sortInvoiceIdsByDueDate()` above).
   *
   * Response mapping (per the plan's own explicit spec):
   *  - every invoice in `response.allocations` gets a `"settled"` outcome
   *    (its real swept amount + the receipt id, for a link) — this includes
   *    an invoice that was only PARTIALLY covered, which also appears below;
   *  - every invoice in `response.shortfall` gets its own, separate
   *    `"partialShortfall"` outcome (its real remaining balance) — this
   *    covers both "reached but only partly covered" AND "never reached at
   *    all because the wallet ran out first" identically, including the
   *    genuinely-zero-swept case (`totalSwept === "0.0000"`, e.g. an empty
   *    wallet) where `allocations` is empty and every invoice's full balance
   *    shows up here — a real `201`, not a thrown error, so it's handled by
   *    this same unconditional pass over `shortfall`, not a separate
   *    "wallet empty" branch.
   * An invoice can legitimately produce BOTH a `"settled"` and a
   * `"partialShortfall"` outcome in the same run (partially covered) — the
   * summary list below keys each `<li>` on `${invoiceId}-${outcome}`, not
   * `invoiceId` alone, to stay unique.
   *
   * A thrown error from `sweepToInvoices()` itself means the WHOLE aggregate
   * call failed (nothing at all was swept for this student) — every one of
   * that student's invoices gets the SAME outcome kind, not a per-invoice
   * breakdown, since the backend never got far enough to produce one.
   */
  async function runWalletCollection(succeeded: { studentId: string; invoiceIds: string[] }[]): Promise<void> {
    setWalletProcessing(true);
    const outcomes: WalletOutcome[] = [];
    // One wallet lookup per student, reused across every one of that student's own invoices this run.
    const walletIdByStudent = new Map<string, string | null>();

    for (const student of succeeded) {
      let walletId = walletIdByStudent.get(student.studentId);
      if (walletId === undefined) {
        const wallet = await findWalletByStudent(student.studentId).catch(() => null);
        walletId = wallet?.id ?? null;
        walletIdByStudent.set(student.studentId, walletId);
      }

      if (!walletId) {
        for (const invoiceId of student.invoiceIds) {
          outcomes.push({ studentId: student.studentId, invoiceId, amount: "0.0000", outcome: "noWallet" });
        }
        continue;
      }

      try {
        const orderedInvoiceIds = await sortInvoiceIdsByDueDate(student.invoiceIds);
        const result = await sweepToInvoices(walletId, { invoiceIds: orderedInvoiceIds });

        for (const alloc of result.allocations) {
          outcomes.push({
            studentId: student.studentId,
            invoiceId: alloc.invoiceId,
            amount: alloc.amount,
            outcome: "settled",
            receiptId: result.receiptId ?? undefined,
          });
        }
        for (const shortfall of result.shortfall) {
          outcomes.push({
            studentId: student.studentId,
            invoiceId: shortfall.invoiceId,
            amount: shortfall.remainingBalance,
            outcome: "partialShortfall",
          });
        }
      } catch (err) {
        if (isTransferNeedsApprovalError(err)) {
          for (const invoiceId of student.invoiceIds) {
            outcomes.push({ studentId: student.studentId, invoiceId, amount: "", outcome: "needsApproval" });
          }
        } else if (isInsufficientBalanceError(err)) {
          for (const invoiceId of student.invoiceIds) {
            outcomes.push({ studentId: student.studentId, invoiceId, amount: "", outcome: "insufficientBalance" });
          }
        } else {
          const message = err instanceof ApiError ? err.message : t("genericError");
          for (const invoiceId of student.invoiceIds) {
            outcomes.push({ studentId: student.studentId, invoiceId, amount: "", outcome: "failed", message });
          }
        }
      }
    }

    setWalletOutcomes(outcomes);
    setWalletProcessing(false);
  }

  /**
   * Phase 6 Slice 12 (Part E) — the "Apply available credit balance"
   * checkbox's own collection loop, run AFTER `runWalletCollection()` when
   * both checkboxes are checked (see `handleSubmit()`'s own ordering
   * comment). One real `applyStudentCredit()` call per succeeded student,
   * covering ALL of that student's own newly-generated invoices at once,
   * oldest-due-first (`sortInvoiceIdsByDueDate()` above —
   * `applyStudentCreditToInvoices()` has the identical caller-ordered
   * contract `sweepToInvoices()` does).
   *
   * Response mapping mirrors `runWalletCollection()`'s (see its own doc
   * comment for the full reasoning) but over the narrower
   * `CreditBalanceOutcomeKind` vocabulary (see that type's own doc comment
   * for why it's not a reuse of `WalletOutcomeKind`): every invoice in
   * `response.allocations` gets `"settled"`; every invoice in
   * `response.shortfall` gets `"partialShortfall"` (covers both "reached but
   * only partly covered" and "never reached because the balance ran out
   * first", including the genuinely-zero-applied case where `allocations`
   * is empty — a real `201`, not a thrown error). A thrown error marks the
   * WHOLE student's invoice set `"failed"` — there is no `needsApproval`/
   * `insufficientBalance` split to make here, since neither is a real
   * possible outcome for this endpoint.
   */
  async function runCreditBalanceCollection(succeeded: { studentId: string; invoiceIds: string[] }[]): Promise<void> {
    setCreditBalanceProcessing(true);
    const outcomes: CreditBalanceOutcome[] = [];

    for (const student of succeeded) {
      try {
        const orderedInvoiceIds = await sortInvoiceIdsByDueDate(student.invoiceIds);
        const result = await applyStudentCredit({ studentId: student.studentId, invoiceIds: orderedInvoiceIds });

        for (const alloc of result.allocations) {
          outcomes.push({
            studentId: student.studentId,
            invoiceId: alloc.invoiceId,
            amount: alloc.amount,
            outcome: "settled",
            receiptId: result.receiptId ?? undefined,
          });
        }
        for (const shortfall of result.shortfall) {
          outcomes.push({
            studentId: student.studentId,
            invoiceId: shortfall.invoiceId,
            amount: shortfall.remainingBalance,
            outcome: "partialShortfall",
          });
        }
      } catch (err) {
        const message = err instanceof ApiError ? err.message : t("genericError");
        for (const invoiceId of student.invoiceIds) {
          outcomes.push({ studentId: student.studentId, invoiceId, amount: "", outcome: "failed", message });
        }
      }
    }

    setCreditBalanceOutcomes(outcomes);
    setCreditBalanceProcessing(false);
  }

  const outcomeCount = (outcome: WalletOutcomeKind) => (walletOutcomes ?? []).filter((o) => o.outcome === outcome).length;
  const creditOutcomeCount = (outcome: CreditBalanceOutcomeKind) => (creditBalanceOutcomes ?? []).filter((o) => o.outcome === outcome).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("formTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label required>{t("academicYearTerm")}</Label>
            <AcademicYearTermSelect
              academicYearId={academicYearId}
              termId={termId}
              onAcademicYearChange={setAcademicYearId}
              onTermChange={setTermId}
              yearPlaceholder={t("selectYear")}
              termPlaceholder={t("selectTerm")}
              autoSelectCurrent
            />
          </div>

          <div className="space-y-1.5">
            <Label required>{t("class")}</Label>
            <Select value={classId ?? ""} onValueChange={setClassId} disabled={classesQuery.isLoading}>
              <SelectTrigger className="sm:w-64">
                <SelectValue placeholder={t("selectClass")} />
              </SelectTrigger>
              <SelectContent>
                {classesQuery.data?.map((klass) => (
                  <SelectItem key={klass.id} value={klass.id}>
                    {klass.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label required>{t("feeCategories")}</Label>
            {!academicYearId || !classId ? (
              <p className="text-sm text-muted-foreground">{t("selectYearAndClassFirst")}</p>
            ) : categoriesQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">{t("loadingCategories")}</p>
            ) : categoryOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noCategoriesForScope")}</p>
            ) : (
              <FeeCategoryChipPicker options={categoryOptions} selected={feeCategoryIds} onChange={setFeeCategoryIds} />
            )}
          </div>

          <div className="space-y-1.5">
            <Label required>{t("students")}</Label>
            <StudentSelectionGrid classId={classId} selected={studentIds} onChange={setStudentIds} />
          </div>

          <div className="space-y-1.5">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={collectFromWallet} onChange={(e) => setCollectFromWallet(e.target.checked)} />
              {t("collectFromWallet")}
            </label>
            {collectFromWallet && <p className="pl-6 text-xs text-muted-foreground">{t("collectFromWalletNotice")}</p>}
          </div>

          {/* Phase 6 Slice 12 (Part E) — sibling checkbox to "Collect amount
              from student wallet" above, same inline-notice-on-check
              pattern. Wallet runs first, this runs second, when both are
              checked (see `handleSubmit()`'s own ordering comment). */}
          <div className="space-y-1.5">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={applyCreditBalance} onChange={(e) => setApplyCreditBalance(e.target.checked)} />
              {t("applyCreditBalance")}
            </label>
            {applyCreditBalance && <p className="pl-6 text-xs text-muted-foreground">{t("applyCreditBalanceNotice")}</p>}
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={handleSubmit} disabled={submitting}>
              {bulkGenerateMutation.isPending
                ? t("generating")
                : walletProcessing
                  ? t("collecting")
                  : creditBalanceProcessing
                    ? t("applyingCredit")
                    : t("submit")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("resultTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant={summary.failed.length > 0 || summary.skipped.length > 0 ? "warning" : "success"}>
              <AlertDescription>
                {t("resultSucceeded", { students: summary.succeededStudents, invoices: summary.succeededInvoices })}
              </AlertDescription>
            </Alert>

            {summary.failed.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium text-foreground">{t("resultFailedTitle")}</p>
                <ul className="list-inside list-disc text-sm text-muted-foreground">
                  {summary.failed.map((f) => (
                    <li key={f.studentId}>
                      {f.studentId}: {f.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Phase 6 Slice 12 (Part C) — FULL duplicate-billing skips: distinct from `failed` above (not an error). */}
            {summary.skipped.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium text-foreground">{t("resultSkippedTitle")}</p>
                <ul className="list-inside list-disc text-sm text-muted-foreground">
                  {summary.skipped.map((s) => (
                    <li key={s.studentId}>
                      {t("resultSkippedEntry", {
                        studentId: s.studentId,
                        categories: formatCategoryNames(s.alreadyBilledCategoryIds, categoryNameById),
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Phase 6 Slice 12 (Part C) — PARTIAL duplicate-billing skips: the student still succeeded, but only for some of their selected categories. */}
            {summary.partiallySkipped.length > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium text-foreground">{t("resultPartialSkipTitle")}</p>
                <ul className="list-inside list-disc text-sm text-muted-foreground">
                  {summary.partiallySkipped.map((s) => (
                    <li key={s.studentId}>
                      {t("resultPartialSkipEntry", {
                        studentId: s.studentId,
                        categories: formatCategoryNames(s.alreadyBilledCategoryIds, categoryNameById),
                      })}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {walletOutcomes && (
              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-sm font-medium text-foreground">{t("walletResultTitle")}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span>{t("walletSettled", { count: outcomeCount("settled") })}</span>
                  <span>{t("walletPartialShortfall", { count: outcomeCount("partialShortfall") })}</span>
                  <span>{t("walletNeedsApproval", { count: outcomeCount("needsApproval") })}</span>
                  <span>{t("walletInsufficientBalance", { count: outcomeCount("insufficientBalance") })}</span>
                  <span>{t("walletNoWallet", { count: outcomeCount("noWallet") })}</span>
                  <span>{t("walletFailed", { count: outcomeCount("failed") })}</span>
                </div>
                <ul className="list-inside list-disc text-xs text-muted-foreground">
                  {walletOutcomes.map((o) => (
                    <li key={`${o.invoiceId}-${o.outcome}`}>
                      {o.studentId.slice(0, 8)}… / {o.invoiceId.slice(0, 8)}…: {t(`walletOutcome.${o.outcome}`, { amount: formatMoney(o.amount || "0.0000") })}
                      {o.message ? ` — ${o.message}` : ""}
                      {o.outcome === "settled" && o.receiptId && (
                        <>
                          {" "}
                          <Link href={`/payments/receipts/${o.receiptId}`} className="text-primary underline">
                            {t("viewReceiptLink")}
                          </Link>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Phase 6 Slice 12 (Part E) — a SEPARATE results section from
                the wallet one above, deliberately not merged into one
                undifferentiated list: these are two distinct funding
                sources, and the accountant needs to see each's own real
                per-invoice outcome independently. */}
            {creditBalanceOutcomes && (
              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-sm font-medium text-foreground">{t("creditBalanceResultTitle")}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span>{t("creditBalanceSettled", { count: creditOutcomeCount("settled") })}</span>
                  <span>{t("creditBalancePartialShortfall", { count: creditOutcomeCount("partialShortfall") })}</span>
                  <span>{t("creditBalanceFailed", { count: creditOutcomeCount("failed") })}</span>
                </div>
                <ul className="list-inside list-disc text-xs text-muted-foreground">
                  {creditBalanceOutcomes.map((o) => (
                    <li key={`${o.invoiceId}-${o.outcome}`}>
                      {o.studentId.slice(0, 8)}… / {o.invoiceId.slice(0, 8)}…: {t(`creditBalanceOutcome.${o.outcome}`, { amount: formatMoney(o.amount || "0.0000") })}
                      {o.message ? ` — ${o.message}` : ""}
                      {o.outcome === "settled" && o.receiptId && (
                        <>
                          {" "}
                          <Link href={`/payments/receipts/${o.receiptId}`} className="text-primary underline">
                            {t("viewReceiptLink")}
                          </Link>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
