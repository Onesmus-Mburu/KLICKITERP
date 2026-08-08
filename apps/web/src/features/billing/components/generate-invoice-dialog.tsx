"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { Checkbox } from "@/components/ui/checkbox";
import { ApiError } from "@/lib/api-error";
import { formatMoney } from "@/lib/money";
import { findWalletByStudent, sweepToInvoices } from "@/features/wallet/api/wallets.api";
import { isInsufficientBalanceError, isTransferNeedsApprovalError } from "@/features/wallet/lib/errors";
import { AcademicYearTermSelect } from "./academic-year-term-select";
import { FeeCategoryChipPicker } from "./fee-category-chip-picker";
import { getInvoice } from "../api/invoices.api";
import { applyStudentCredit } from "../api/student-credit.api";
import { studentCreditBalanceKey } from "../hooks/use-student-credit";
import { useBulkGenerateAdhocInvoices, useCategoriesForScope } from "../hooks/use-bulk-adhoc-invoices";

/**
 * Phase 6 Slice 12 (Part B) — the same wallet-sweep outcome shape
 * `bulk-generate-invoice-form.tsx` uses (see its own `WalletOutcomeKind`
 * doc comment for the full `"partialShortfall"` reasoning), minus the
 * `studentId` field — this dialog only ever operates on ONE student (the
 * one it was opened for), so it isn't needed here. Kept as its own local
 * type rather than importing from that sibling component file — the two
 * screens' result UIs render differently enough (a compact dialog list vs.
 * a full summary Card with count chips) that sharing a component would cost
 * more than it saves; the shape stays close on purpose, for a reader
 * familiar with one screen to recognize the other.
 */
type DialogWalletOutcomeKind = "settled" | "partialShortfall" | "needsApproval" | "insufficientBalance" | "noWallet" | "failed";

interface DialogWalletOutcome {
  invoiceId: string;
  amount: string;
  outcome: DialogWalletOutcomeKind;
  message?: string;
  receiptId?: string;
}

/**
 * Phase 6 Slice 12 (Part E) — this dialog's own counterpart to
 * `bulk-generate-invoice-form.tsx`'s `CreditBalanceOutcomeKind` (see that
 * type's own doc comment for the full "why a separate, narrower type than
 * the wallet one" reasoning — identical here), minus `studentId` for the
 * same single-student reason `DialogWalletOutcomeKind` above already omits
 * it.
 */
type DialogCreditBalanceOutcomeKind = "settled" | "partialShortfall" | "failed";

interface DialogCreditBalanceOutcome {
  invoiceId: string;
  amount: string;
  outcome: DialogCreditBalanceOutcomeKind;
  message?: string;
  receiptId?: string;
}

/** Mirrors `bulk-generate-invoice-form.tsx`'s own `sortInvoiceIdsByDueDate()` — see its doc comment for why this re-sort is necessary rather than trusting `invoiceIds` array order as-is. */
async function sortInvoiceIdsByDueDate(invoiceIds: string[]): Promise<string[]> {
  const withDueDate = await Promise.all(invoiceIds.map(async (invoiceId) => ({ invoiceId, dueDate: (await getInvoice(invoiceId)).dueDate })));
  return withDueDate.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0)).map((i) => i.invoiceId);
}

/** Mirrors `bulk-generate-invoice-form.tsx`'s own `formatCategoryNames()` — see its doc comment. */
function formatCategoryNames(ids: string[], categoryNameById: Map<string, string>): string {
  return ids.map((id) => categoryNameById.get(id) ?? id).join(", ");
}

/**
 * Phase 6 Slice 9 (Part D) — redesigned from its original STRUCTURE-only,
 * single-step "generate the whole applicable fee structure" form to the SAME
 * item-based (category-selection) UX `bulk-generate-invoice-form.tsx`
 * (Phase 6 Slice 8, Part 1) established for the bulk screen — a term picker
 * (`<AcademicYearTermSelect autoSelectCurrent>`, reused verbatim) then a fee
 * category `<FeeCategoryChipPicker>` (Part C's enhanced version, fed by the
 * existing `categories-for-scope` catalog, Slice 8's own endpoint, keyed on
 * this student's own `classId` — a new required prop, passed in by
 * `app/(erp)/students/[id]/page.tsx` from the already-loaded
 * `StudentResponseDto.classId` — + the chosen academic year) — minus the
 * grade `<Select>` and student checkbox-grid steps, since the student is
 * already fixed by the page this dialog is opened from. Submits to the
 * SAME existing bulk-generate endpoint the bulk screen uses
 * (`useBulkGenerateAdhocInvoices()`, `POST billing/invoices/bulk-generate`)
 * with `studentIds:[studentId]` — zero new backend code, per the plan.
 *
 * The trigger button itself (`<Button>{t("trigger")}</Button>`, rendered
 * inside `<DialogTrigger asChild>`) is UNCHANGED — same placement (the
 * student detail page's Billing card header), same label key
 * (`generateDialog.trigger`) — the only thing users should notice differs is
 * what opens.
 *
 * The OLD `source:"STRUCTURE"` single-generate call path (`useGenerateInvoice()`,
 * `isAlreadyBilledInvoiceError`) is genuinely REMOVED from this file, not
 * left dead alongside the new one (confirmed: neither is imported below).
 * `useGenerateInvoice()`/`isAlreadyBilledInvoiceError()` themselves are left
 * in place in their own source files (`../hooks/use-invoices.ts`/
 * `../lib/errors.ts`) rather than deleted — unlike Slice 9 Part A's own
 * `checkForStkReceipt()` removal (where the leftover doc comment would have
 * become actively FALSE once orphaned), these two stay fully accurate
 * descriptions of the backend's still-real, still-supported
 * `source:"STRUCTURE"` generation path — genuinely general-purpose
 * infrastructure this dialog no longer happens to call, not
 * `GenerateInvoiceDialog`-specific dead code.
 *
 * The ADHOC bulk-generate path has no `BR-BILL-04`-style unique-constraint
 * 409 to catch — a per-student failure (no applicable PUBLISHED structure, or
 * none of the selected categories matched it) instead lands in the bulk
 * endpoint's own `result.failed[]` array on a real `201`, not a thrown HTTP
 * error, so it's handled directly below rather than via the old
 * `isAlreadyBilledInvoiceError` shape (confirmed by reading the real service,
 * not assumed).
 *
 * **Phase 6 Slice 12 (Part C)** added the duplicate fee-category-per-term
 * guard to the SAME bulk endpoint this dialog already calls
 * (`BulkAdhocInvoicesService`, one `studentIds:[studentId]` call) — this
 * dialog's own `result.skipped`/`result.succeeded[0].alreadyBilledCategoryIds`
 * are handled explicitly below (see `skippedNotice`), rather than falling
 * through to the old "0 invoices generated" path, which would otherwise
 * silently render an empty invoice list with no explanation — the exact
 * confusing-UX gap the plan calls out.
 *
 * **Phase 6 Slice 12 (Part B)** added the SAME "Collect amount from student
 * wallet" checkbox `bulk-generate-invoice-form.tsx` already had (this dialog
 * had none before this pass) — wired to the new `sweepToInvoices()` endpoint,
 * covering ALL of `result.succeeded[0].invoiceIds` (this dialog's own doc
 * comment above already explains more than one invoice can come back, when
 * the selected categories span different due dates) in ONE call.
 *
 * **Judgment call — redirect vs. stay open**: before this pass, generating
 * exactly ONE invoice always closed the dialog and navigated straight to
 * `/billing/invoices/{id}`. That still happens, unchanged, when the wallet
 * checkbox is OFF. When it's ON, the dialog now stays open even for a single
 * invoice and runs the sweep in place, showing its real outcome (settled
 * amount + receipt link, or needs-approval/no-wallet/shortfall) before the
 * user moves on — an immediate redirect would otherwise race the sweep call
 * and hide its result from the one place the user is already looking,
 * defeating the point of surfacing it at all. The multi-invoice case already
 * stayed open before this pass (to list every generated invoice), so only
 * the single-invoice path's behavior actually changes, and only when the
 * checkbox is checked.
 *
 * **Phase 6 Slice 12 (Part E)** added a sibling "Apply available credit
 * balance" checkbox, mirroring Part B's own wallet checkbox integration
 * exactly — wired to the new `applyStudentCredit()` endpoint via
 * `runCreditBalanceCollection()` below, its own SEPARATE results section
 * (`creditBalanceResultTitle`, distinct from `walletResultTitle` — two
 * different funding sources, never merged into one list), and its own
 * `DialogCreditBalanceOutcomeKind` (narrower than the wallet one — see that
 * type's own doc comment for why). The "redirect vs. stay open" judgment
 * call above now also triggers on `applyCreditBalance` being checked, not
 * just `collectFromWallet` — either checkbox needing to show its own real
 * outcome is reason enough to keep the dialog open. When BOTH are checked,
 * wallet runs first, then credit balance — the same ordering decision
 * `bulk-generate-invoice-form.tsx`'s own `handleSubmit()` documents, for the
 * same reason (wallet was the pre-existing behavior; credit balance is
 * layered on after it, only ever applied to what the wallet didn't already
 * cover).
 */
export function GenerateInvoiceDialog({ studentId, classId }: { studentId: string; classId: string }) {
  const t = useTranslations("billing.invoices.generateDialog");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [academicYearId, setAcademicYearId] = React.useState<string | null>(null);
  const [termId, setTermId] = React.useState<string | null>(null);
  const [feeCategoryIds, setFeeCategoryIds] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [generatedInvoiceIds, setGeneratedInvoiceIds] = React.useState<string[] | null>(null);
  const [collectFromWallet, setCollectFromWallet] = React.useState(false);
  const [walletOutcomes, setWalletOutcomes] = React.useState<DialogWalletOutcome[] | null>(null);
  const [walletProcessing, setWalletProcessing] = React.useState(false);
  const [applyCreditBalance, setApplyCreditBalance] = React.useState(false);
  const [creditBalanceOutcomes, setCreditBalanceOutcomes] = React.useState<DialogCreditBalanceOutcome[] | null>(null);
  const [creditBalanceProcessing, setCreditBalanceProcessing] = React.useState(false);
  // Phase 6 Slice 12 (Part C) — set only on a FULL duplicate-billing skip:
  // this student's entire selected-category set was already billed this
  // term, so `result.succeeded` came back empty for them. Distinct from
  // `error` — this isn't a failure, it's a clear "nothing to do" signal.
  const [skippedNotice, setSkippedNotice] = React.useState<{ alreadyBilledCategoryIds: string[] } | null>(null);
  // Set only on a PARTIAL duplicate-billing skip: the student still
  // succeeded (invoices ARE listed below), but only for some of their
  // selected categories — this note explains what was left out and why.
  const [partialSkipCategoryIds, setPartialSkipCategoryIds] = React.useState<string[] | null>(null);

  const categoriesQuery = useCategoriesForScope(academicYearId ?? undefined, classId);
  const generateMutation = useBulkGenerateAdhocInvoices();

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

  // A different academic year means a different category catalog (`categories-for-scope`
  // is keyed on academicYearId+classId, not term) — stale selections from a
  // previous year must not silently carry over.
  React.useEffect(() => {
    setFeeCategoryIds([]);
  }, [academicYearId]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setAcademicYearId(null);
      setTermId(null);
      setFeeCategoryIds([]);
      setError(null);
      setGeneratedInvoiceIds(null);
      setCollectFromWallet(false);
      setWalletOutcomes(null);
      setWalletProcessing(false);
      setApplyCreditBalance(false);
      setCreditBalanceOutcomes(null);
      setCreditBalanceProcessing(false);
      setSkippedNotice(null);
      setPartialSkipCategoryIds(null);
    }
  }

  async function handleGenerate() {
    setError(null);
    setWalletOutcomes(null);
    setCreditBalanceOutcomes(null);
    setSkippedNotice(null);
    setPartialSkipCategoryIds(null);
    if (!termId) {
      setError(t("termRequired"));
      return;
    }
    if (feeCategoryIds.length === 0) {
      setError(t("categoriesRequired"));
      return;
    }

    let result;
    try {
      result = await generateMutation.mutateAsync({ termId, classId, feeCategoryIds, studentIds: [studentId] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
      return;
    }

    if (result.failed.length > 0) {
      setError(t("generationFailed", { message: result.failed[0]?.error ?? "" }));
      return;
    }

    // Phase 6 Slice 12 (Part C) — a FULL duplicate-billing skip: every
    // selected category was already really billed this student this term
    // (this dialog only ever submits ONE studentId, so at most one entry
    // here). Nothing was generated — surface this clearly instead of
    // falling through to an empty invoice list (`invoiceIds.length === 0`)
    // with no explanation, or leaving the dialog looking like it silently
    // did nothing.
    if (result.skipped.length > 0) {
      setSkippedNotice({ alreadyBilledCategoryIds: result.skipped[0]?.alreadyBilledCategoryIds ?? [] });
      return;
    }

    const alreadyBilledCategoryIds = result.succeeded[0]?.alreadyBilledCategoryIds ?? [];
    if (alreadyBilledCategoryIds.length > 0) {
      setPartialSkipCategoryIds(alreadyBilledCategoryIds);
    }

    const invoiceIds = result.succeeded[0]?.invoiceIds ?? [];

    // Both checkboxes OFF: byte-for-byte the original behavior — a single
    // invoice redirects straight to its detail page, more than one stays
    // open to list every one (see the class doc comment for why). A PARTIAL
    // skip (`alreadyBilledCategoryIds.length > 0`, checked above) now also
    // forces the dialog to stay open even for a single invoice — an instant
    // redirect would otherwise hide the "some categories were already
    // billed" note the user needs to see, the same class of problem each
    // checkbox's own "stay open" judgment call above already solves.
    if (!collectFromWallet && !applyCreditBalance) {
      if (invoiceIds.length === 1 && invoiceIds[0] && alreadyBilledCategoryIds.length === 0) {
        setOpen(false);
        router.push(`/billing/invoices/${invoiceIds[0]}`);
        return;
      }
      setGeneratedInvoiceIds(invoiceIds);
      return;
    }

    // Either checkbox ON: stay open regardless of invoice count (see the
    // class doc comment's "Judgment call" section) — list the generated
    // invoice(s), then run wallet collection (if checked) followed by
    // credit-balance collection (if checked), wallet first — see the class
    // doc comment's own ordering note — showing each's real outcome in
    // place.
    setGeneratedInvoiceIds(invoiceIds);
    if (invoiceIds.length > 0) {
      if (collectFromWallet) {
        await runWalletCollection(invoiceIds);
      }
      if (applyCreditBalance) {
        await runCreditBalanceCollection(invoiceIds);
      }
    }
  }

  /**
   * Single-student counterpart to `bulk-generate-invoice-form.tsx`'s own
   * `runWalletCollection()` — see that function's doc comment for the full
   * `allocations`/`shortfall` outcome-mapping logic, identical here. The one
   * real difference: there is only ONE wallet lookup and ONE
   * `sweepToInvoices()` call total (this dialog only ever generates for a
   * single student), not a per-student loop.
   */
  async function runWalletCollection(invoiceIds: string[]): Promise<void> {
    setWalletProcessing(true);

    const wallet = await findWalletByStudent(studentId).catch(() => null);
    if (!wallet) {
      setWalletOutcomes(invoiceIds.map((invoiceId) => ({ invoiceId, amount: "0.0000", outcome: "noWallet" })));
      setWalletProcessing(false);
      return;
    }

    try {
      const orderedInvoiceIds = await sortInvoiceIdsByDueDate(invoiceIds);
      const result = await sweepToInvoices(wallet.id, { invoiceIds: orderedInvoiceIds });

      const outcomes: DialogWalletOutcome[] = [];
      for (const alloc of result.allocations) {
        outcomes.push({ invoiceId: alloc.invoiceId, amount: alloc.amount, outcome: "settled", receiptId: result.receiptId ?? undefined });
      }
      for (const shortfall of result.shortfall) {
        outcomes.push({ invoiceId: shortfall.invoiceId, amount: shortfall.remainingBalance, outcome: "partialShortfall" });
      }
      setWalletOutcomes(outcomes);
    } catch (err) {
      let outcome: DialogWalletOutcomeKind;
      let message: string | undefined;
      if (isTransferNeedsApprovalError(err)) {
        outcome = "needsApproval";
      } else if (isInsufficientBalanceError(err)) {
        outcome = "insufficientBalance";
      } else {
        outcome = "failed";
        message = err instanceof ApiError ? err.message : t("genericError");
      }
      setWalletOutcomes(invoiceIds.map((invoiceId) => ({ invoiceId, amount: "", outcome, message })));
    } finally {
      setWalletProcessing(false);
    }
  }

  /**
   * Single-student counterpart to `bulk-generate-invoice-form.tsx`'s own
   * `runCreditBalanceCollection()` — see that function's doc comment for the
   * full `allocations`/`shortfall` outcome-mapping logic, identical here.
   * Unlike `runWalletCollection()` above, there is no wallet-id lookup step
   * first — `applyStudentCredit()` takes `studentId` directly, and `GET
   * .../credit-balance` never 404s, so there's no `"noWallet"`-equivalent
   * precondition to check (see `DialogCreditBalanceOutcomeKind`'s own doc
   * comment). On success, invalidates the student detail page's own Credit
   * Balance card query (`studentCreditBalanceKey`, `use-student-credit.ts`)
   * so a fresh apply here is reflected without the user needing a manual
   * page refresh — this dialog is opened FROM that same page.
   */
  async function runCreditBalanceCollection(invoiceIds: string[]): Promise<void> {
    setCreditBalanceProcessing(true);
    try {
      const orderedInvoiceIds = await sortInvoiceIdsByDueDate(invoiceIds);
      const result = await applyStudentCredit({ studentId, invoiceIds: orderedInvoiceIds });

      const outcomes: DialogCreditBalanceOutcome[] = [];
      for (const alloc of result.allocations) {
        outcomes.push({ invoiceId: alloc.invoiceId, amount: alloc.amount, outcome: "settled", receiptId: result.receiptId ?? undefined });
      }
      for (const shortfall of result.shortfall) {
        outcomes.push({ invoiceId: shortfall.invoiceId, amount: shortfall.remainingBalance, outcome: "partialShortfall" });
      }
      setCreditBalanceOutcomes(outcomes);
      queryClient.invalidateQueries({ queryKey: studentCreditBalanceKey(studentId) });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t("genericError");
      setCreditBalanceOutcomes(invoiceIds.map((invoiceId) => ({ invoiceId, amount: "", outcome: "failed", message })));
    } finally {
      setCreditBalanceProcessing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">{t("trigger")}</Button>
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

        {skippedNotice ? (
          // Phase 6 Slice 12 (Part C) — FULL duplicate-billing skip: nothing was
          // generated at all, shown clearly instead of a confusing empty invoice
          // list or a generic error (see the class doc comment).
          <Alert variant="warning">
            <AlertDescription>
              {t("alreadyBilledSkippedNotice", {
                categories: formatCategoryNames(skippedNotice.alreadyBilledCategoryIds, categoryNameById),
              })}
            </AlertDescription>
          </Alert>
        ) : generatedInvoiceIds ? (
          <>
            <Alert variant="success">
              <AlertDescription>
                <p>
                  {generatedInvoiceIds.length > 1
                    ? t("multiInvoiceDescription", { count: generatedInvoiceIds.length })
                    : t("singleInvoiceDescription")}
                </p>
                <ul className="mt-2 list-inside list-disc">
                  {generatedInvoiceIds.map((id, index) => (
                    <li key={id}>
                      <Link
                        href={`/billing/invoices/${id}`}
                        className="underline"
                        onClick={() => !walletProcessing && !creditBalanceProcessing && setOpen(false)}
                      >
                        {generatedInvoiceIds.length > 1 ? t("viewInvoiceLink", { index: index + 1 }) : t("viewInvoiceLinkSingle")}
                      </Link>
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>

            {/* Phase 6 Slice 12 (Part C) — PARTIAL duplicate-billing skip: this student still got invoiced, but not for every selected category. */}
            {partialSkipCategoryIds && partialSkipCategoryIds.length > 0 && (
              <Alert variant="warning">
                <AlertDescription>
                  {t("alreadyBilledPartialSkipNotice", {
                    categories: formatCategoryNames(partialSkipCategoryIds, categoryNameById),
                  })}
                </AlertDescription>
              </Alert>
            )}

            {collectFromWallet && (walletProcessing || walletOutcomes) && (
              <div className="space-y-1.5 border-t border-border pt-3">
                <p className="text-sm font-medium text-foreground">{t("walletResultTitle")}</p>
                {walletProcessing ? (
                  <p className="text-sm text-muted-foreground">{t("collectingFromWallet")}</p>
                ) : (
                  <ul className="list-inside list-disc text-sm text-muted-foreground">
                    {(walletOutcomes ?? []).map((o) => (
                      <li key={`${o.invoiceId}-${o.outcome}`}>
                        {t(`walletOutcome.${o.outcome}`, { amount: formatMoney(o.amount || "0.0000") })}
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
                )}
              </div>
            )}

            {/* Phase 6 Slice 12 (Part E) — a SEPARATE results section from
                the wallet one above, deliberately not merged into one list
                — two distinct funding sources, each with its own real
                per-invoice outcome. */}
            {applyCreditBalance && (creditBalanceProcessing || creditBalanceOutcomes) && (
              <div className="space-y-1.5 border-t border-border pt-3">
                <p className="text-sm font-medium text-foreground">{t("creditBalanceResultTitle")}</p>
                {creditBalanceProcessing ? (
                  <p className="text-sm text-muted-foreground">{t("applyingCreditBalance")}</p>
                ) : (
                  <ul className="list-inside list-disc text-sm text-muted-foreground">
                    {(creditBalanceOutcomes ?? []).map((o) => (
                      <li key={`${o.invoiceId}-${o.outcome}`}>
                        {t(`creditBalanceOutcome.${o.outcome}`, { amount: formatMoney(o.amount || "0.0000") })}
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
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label required>{t("term")}</Label>
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
              <Label required>{t("feeCategories")}</Label>
              {!academicYearId || !termId ? (
                <p className="text-sm text-muted-foreground">{t("selectTermFirst")}</p>
              ) : categoriesQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">{t("loadingCategories")}</p>
              ) : categoryOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noCategoriesForScope")}</p>
              ) : (
                <FeeCategoryChipPicker options={categoryOptions} selected={feeCategoryIds} onChange={setFeeCategoryIds} />
              )}
            </div>

            <div className="space-y-1.5">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={collectFromWallet} onChange={(e) => setCollectFromWallet(e.target.checked)} />
                {t("collectFromWallet")}
              </label>
              {collectFromWallet && <p className="pl-6 text-xs text-muted-foreground">{t("collectFromWalletNotice")}</p>}
            </div>

            {/* Phase 6 Slice 12 (Part E) — sibling checkbox to "Collect
                amount from student wallet" above, same inline-notice pattern. */}
            <div className="space-y-1.5">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={applyCreditBalance} onChange={(e) => setApplyCreditBalance(e.target.checked)} />
                {t("applyCreditBalance")}
              </label>
              {applyCreditBalance && <p className="pl-6 text-xs text-muted-foreground">{t("applyCreditBalanceNotice")}</p>}
            </div>
          </>
        )}

        <DialogFooter>
          {skippedNotice || generatedInvoiceIds ? (
            <Button type="button" onClick={() => setOpen(false)} disabled={walletProcessing || creditBalanceProcessing}>
              {tCommon("close")}
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="button" onClick={handleGenerate} disabled={generateMutation.isPending}>
                {generateMutation.isPending ? t("generating") : t("submit")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
