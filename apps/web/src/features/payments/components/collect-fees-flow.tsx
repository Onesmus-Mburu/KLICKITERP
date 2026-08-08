"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { InvoiceResponseDto, StudentResponseDto } from "@klickit/contracts";
import { CaptureReceiptDtoSchema } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/patterns/money-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { ApiError } from "@/lib/api-error";
import { DEFAULT_CURRENCY, formatMoney, normalizeMoneyInput, sumMoneyStrings } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useStudent } from "@/features/students/hooks/use-students";
import { useStudentInvoices } from "@/features/billing/hooks/use-invoices";
import { useMySession } from "../hooks/use-sessions";
import { useCaptureReceipt } from "../hooks/use-receipts";
import { computeRemaining, isZeroAmount } from "../lib/balance";
import { escapeClear } from "../lib/escape-clear";
import { isSplitRowComplete } from "../lib/validate-split";
import { captureFormReducer, initialCaptureFormState } from "../lib/capture-form-state";
import { StudentSearchBox } from "./student-search-box";
import { SplitRow } from "./split-row";

/**
 * Phase 6 Slice 8 (Part 3) — "Collect Fees", the ONE shared flow behind both
 * `/billing/collect` entry points (the bare nav link, and every Pending/
 * Upcoming row's "Collect" link pre-filled with `?studentId=&invoiceId=`).
 * Deliberately NOT a fork of `receipt-capture-form.tsx` — that file is the
 * shipped, hotkey-wired cashier screen and is never modified here; instead
 * this component reuses the same building blocks (`StudentSearchBox`,
 * `SplitRow`, `captureFormReducer`/`initialCaptureFormState`) and adds one
 * new section between student selection and the payment splits: the
 * `InvoiceSelectionPanel` — a checklist of the selected student's OPEN
 * (`balance>0`, non-VOID) invoices, feeding the new, additive-only
 * `selectedInvoiceIds` reducer field.
 *
 * The "amount to collect" field IS `state.total` (the same field
 * `receipt-capture-form.tsx` calls "Total received" and balances splits
 * against) — it defaults to the running total of CHECKED invoices (a
 * non-destructive default, the same pattern the reducer's own `SET_STUDENT`
 * case already establishes for `payerName`: it only auto-follows the
 * checklist until the cashier types into the amount field directly, at
 * which point it detaches permanently for this capture attempt — so typing
 * a smaller amount (partial) or a larger one (overpayment) both work exactly
 * as the plan describes).
 */
export function CollectFeesFlow({
  initialStudentId,
  initialInvoiceId,
}: {
  initialStudentId?: string;
  initialInvoiceId?: string;
}) {
  const t = useTranslations("payments.collectFees");
  const router = useRouter();
  const [state, dispatch] = React.useReducer(captureFormReducer, undefined, () => initialCaptureFormState(crypto.randomUUID()));
  const [error, setError] = React.useState<string | null>(null);
  const [amountManuallyEdited, setAmountManuallyEdited] = React.useState(false);

  const sessionQuery = useMySession();
  const captureMutation = useCaptureReceipt();

  // --- Entry point #1 (pre-filled): resolve + apply the initial student, once ---
  const initialStudentQuery = useStudent(initialStudentId);
  const appliedInitialStudentRef = React.useRef(false);
  React.useEffect(() => {
    if (appliedInitialStudentRef.current || !initialStudentId) return;
    if (!initialStudentQuery.data) return;
    dispatch({ type: "SET_STUDENT", student: initialStudentQuery.data });
    appliedInitialStudentRef.current = true;
  }, [initialStudentId, initialStudentQuery.data]);

  const studentId = state.student?.id;
  const invoicesQuery = useStudentInvoices(studentId);
  const openInvoices = React.useMemo(
    () => (invoicesQuery.data ?? []).filter((invoice) => invoice.status !== "VOID" && !isZeroAmount(invoice.balance)),
    [invoicesQuery.data],
  );

  // --- Entry point #2 (pre-filled): once this student's invoices have
  // loaded, pre-check `initialInvoiceId` IF it's genuinely one of their open
  // invoices (a stale/paid-off id from an old link is silently ignored,
  // never force-added to the checked set). Applied once only. ---
  const appliedInitialInvoiceRef = React.useRef(false);
  React.useEffect(() => {
    if (appliedInitialInvoiceRef.current) return;
    if (!initialInvoiceId) {
      appliedInitialInvoiceRef.current = true;
      return;
    }
    if (!invoicesQuery.data) return;
    if (openInvoices.some((invoice) => invoice.id === initialInvoiceId)) {
      dispatch({ type: "SET_SELECTED_INVOICES", invoiceIds: [initialInvoiceId] });
    }
    appliedInitialInvoiceRef.current = true;
  }, [initialInvoiceId, invoicesQuery.data, openInvoices]);

  const runningTotal = React.useMemo(
    () =>
      sumMoneyStrings(
        openInvoices.filter((invoice) => state.selectedInvoiceIds.has(invoice.id)).map((invoice) => invoice.balance),
      ),
    [openInvoices, state.selectedInvoiceIds],
  );

  // Non-destructive default (see class doc comment): keeps `state.total`
  // following the checked-invoices running total until the cashier edits
  // the amount field directly.
  React.useEffect(() => {
    if (amountManuallyEdited) return;
    dispatch({ type: "SET_FIELD", field: "total", value: state.selectedInvoiceIds.size > 0 ? runningTotal : "" });
  }, [runningTotal, state.selectedInvoiceIds.size, amountManuallyEdited]);

  function handleSelectStudent(student: StudentResponseDto | null) {
    dispatch({ type: "SET_STUDENT", student });
    dispatch({ type: "SET_SELECTED_INVOICES", invoiceIds: [] });
    setAmountManuallyEdited(false);
  }

  function handleToggleInvoice(invoiceId: string) {
    dispatch({ type: "TOGGLE_INVOICE", invoiceId });
  }

  const splitAmountsForSum = state.splits.map((s) => normalizeMoneyInput(s.amount) ?? "0");
  const totalNormalized = normalizeMoneyInput(state.total) ?? "0";
  const remaining = computeRemaining(totalNormalized, splitAmountsForSum);
  const isBalanced = normalizeMoneyInput(state.total) !== null && isZeroAmount(remaining);
  const hasCashSplit = state.splits.some((s) => s.method === "CASH");
  const hasOpenSession = !!sessionQuery.data;
  const allRowsComplete = state.splits.length > 0 && state.splits.every(isSplitRowComplete);
  const canSubmit =
    !!state.student &&
    state.payerName.trim().length > 0 &&
    isBalanced &&
    allRowsComplete &&
    !(hasCashSplit && !hasOpenSession) &&
    !captureMutation.isPending;

  async function handleSubmit() {
    setError(null);
    if (!canSubmit || !state.student) return;

    const dto = {
      studentId: state.student.id,
      payerName: state.payerName.trim(),
      payerPhone: state.payerPhone.trim() || undefined,
      receiptDate: state.receiptDate,
      total: totalNormalized,
      splits: state.splits.map((row) => ({
        method: row.method,
        amount: normalizeMoneyInput(row.amount) ?? row.amount,
        bankAccountId: row.bankAccountId.trim() || undefined,
        externalRef: row.externalRef.trim() || undefined,
        chequeDetails:
          row.method === "CHEQUE"
            ? {
                bankName: row.chequeBankName.trim(),
                chequeNo: row.chequeNo.trim(),
                chequeDate: row.chequeDate,
                drawer: row.chequeDrawer.trim(),
              }
            : undefined,
      })),
      sessionId: hasOpenSession ? sessionQuery.data?.id : undefined,
      idempotencyKey: state.idempotencyKey,
      // Phase 6 Slice 8 (Part 3) — the one real behavioral difference from
      // `receipt-capture-form.tsx`'s own dto: a non-empty checked set scopes
      // BR-PAY-02/03's allocation to exactly those invoices; an empty one
      // sends `undefined`, the exact same unscoped-FIFO shape every other
      // caller already sends.
      invoiceIds: state.selectedInvoiceIds.size > 0 ? [...state.selectedInvoiceIds] : undefined,
    };

    const parsed = CaptureReceiptDtoSchema.safeParse(dto);
    if (!parsed.success) {
      setError(t("structuralValidationError"));
      return;
    }

    try {
      const receipt = await captureMutation.mutateAsync(parsed.data);
      dispatch({ type: "RESET", idempotencyKey: crypto.randomUUID() });
      setAmountManuallyEdited(false);
      router.push(`/payments/receipts/${receipt.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {hasCashSplit && !hasOpenSession && !sessionQuery.isLoading && (
        <Alert variant="warning">
          <AlertDescription>{t("cashRequiresSessionHint")}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("studentSectionTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label required>{t("student")}</Label>
            <StudentSearchBox selectedStudent={state.student} onSelect={handleSelectStudent} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label required>{t("payerName")}</Label>
              <Input
                value={state.payerName}
                onChange={(e) => dispatch({ type: "SET_FIELD", field: "payerName", value: e.target.value })}
                onKeyDown={escapeClear(() => dispatch({ type: "SET_FIELD", field: "payerName", value: "" }))}
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("payerPhone")}</Label>
              <Input
                value={state.payerPhone}
                onChange={(e) => dispatch({ type: "SET_FIELD", field: "payerPhone", value: e.target.value })}
                onKeyDown={escapeClear(() => dispatch({ type: "SET_FIELD", field: "payerPhone", value: "" }))}
                maxLength={20}
              />
            </div>
            <div className="space-y-1.5">
              <Label required>{t("receiptDate")}</Label>
              <Input type="date" value={state.receiptDate} onChange={(e) => dispatch({ type: "SET_FIELD", field: "receiptDate", value: e.target.value })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("invoicesSectionTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {state.student ? (
            <InvoiceSelectionPanel
              invoicesQuery={invoicesQuery}
              openInvoices={openInvoices}
              selectedInvoiceIds={state.selectedInvoiceIds}
              onToggle={handleToggleInvoice}
              runningTotal={runningTotal}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t("selectStudentFirstHint")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <CardTitle className="text-base text-foreground">{t("splitsSectionTitle")}</CardTitle>
          <div className="w-40 space-y-1.5">
            <Label required>{t("amountToCollect")}</Label>
            <MoneyInput
              value={state.total}
              onValueChange={(v) => {
                setAmountManuallyEdited(true);
                dispatch({ type: "SET_FIELD", field: "total", value: v ?? "" });
              }}
              currency={DEFAULT_CURRENCY}
              onKeyDown={escapeClear(() => {
                setAmountManuallyEdited(true);
                dispatch({ type: "SET_FIELD", field: "total", value: "" });
              })}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {state.splits.map((row) => (
            <SplitRow
              key={row.id}
              row={row}
              onChange={(patch) => dispatch({ type: "UPDATE_SPLIT", id: row.id, patch })}
              onRemove={() => dispatch({ type: "REMOVE_SPLIT", id: row.id })}
              canRemove={state.splits.length > 1}
              registerMethodTriggerRef={() => {}}
              stkContext={
                state.student
                  ? {
                      studentId: state.student.id,
                      accountRef: state.student.admissionNo,
                      // Phase 6 Slice 9 (Part A) — same "empty means unscoped"
                      // convention Slice 8 Part 3 established for this exact
                      // capture flow's own `handleSubmit()` dto above.
                      invoiceIds: state.selectedInvoiceIds.size > 0 ? [...state.selectedInvoiceIds] : undefined,
                    }
                  : undefined
              }
            />
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => dispatch({ type: "ADD_SPLIT", id: crypto.randomUUID() })}
          >
            <Plus className="size-4" />
            {t("addSplit")}
          </Button>

          <div className="flex items-center justify-between rounded-lg border border-dashed border-border p-3 text-sm">
            <span className="text-muted-foreground">{t("remaining")}</span>
            <span className={cn("font-semibold", isBalanced ? "text-success" : "text-destructive")}>{formatMoney(remaining)}</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" size="lg" onClick={() => void handleSubmit()} disabled={!canSubmit}>
          {captureMutation.isPending ? t("submitting") : t("submit")}
        </Button>
      </div>
    </div>
  );
}

/**
 * Once a student is selected: fetches their invoices via the REUSED
 * `useStudentInvoices()` hook (`features/billing/hooks/use-invoices.ts` —
 * the same hook the student detail page's Billing card already uses), then
 * filters client-side to OPEN ones (`status !== "VOID" && balance != 0`,
 * mirroring `BillInvoiceRepository.findOpenForStudent()`'s own `balance>0`
 * definition of "open" as closely as a client can, plus excluding VOID for
 * display sanity — see `collect-fees-flow.tsx`'s own module doc comment).
 * Each row is a Slice-0 `<Checkbox>` (student's invoice number, due date,
 * balance) with a running "Total selected" sum below the list.
 */
function InvoiceSelectionPanel({
  invoicesQuery,
  openInvoices,
  selectedInvoiceIds,
  onToggle,
  runningTotal,
}: {
  invoicesQuery: UseQueryResult<InvoiceResponseDto[], unknown>;
  openInvoices: InvoiceResponseDto[];
  selectedInvoiceIds: Set<string>;
  onToggle: (invoiceId: string) => void;
  runningTotal: string;
}) {
  const t = useTranslations("payments.collectFees");

  return (
    <QueryBoundary query={invoicesQuery}>
      {() =>
        openInvoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noOpenInvoices")}</p>
        ) : (
          <div className="space-y-3">
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {openInvoices.map((invoice) => (
                <label
                  key={invoice.id}
                  htmlFor={`collect-fees-invoice-${invoice.id}`}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50"
                >
                  <Checkbox
                    id={`collect-fees-invoice-${invoice.id}`}
                    checked={selectedInvoiceIds.has(invoice.id)}
                    onChange={() => onToggle(invoice.id)}
                  />
                  <span className="flex-1 font-medium text-foreground">{invoice.number}</span>
                  <span className="text-xs text-muted-foreground">{t("dueDateLabel", { date: invoice.dueDate })}</span>
                  <span className="w-28 shrink-0 text-right font-medium text-foreground">{formatMoney(invoice.balance)}</span>
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between rounded-lg border border-dashed border-border p-3 text-sm">
              <span className="text-muted-foreground">{t("runningTotalLabel")}</span>
              <span className="font-semibold text-foreground">{formatMoney(runningTotal)}</span>
            </div>
          </div>
        )
      }
    </QueryBoundary>
  );
}
