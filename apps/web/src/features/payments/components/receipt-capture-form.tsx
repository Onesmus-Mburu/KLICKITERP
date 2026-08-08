"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { CaptureReceiptDtoSchema } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/patterns/money-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { DEFAULT_CURRENCY, formatMoney, normalizeMoneyInput } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { useMySession } from "../hooks/use-sessions";
import { useCaptureReceipt } from "../hooks/use-receipts";
import { computeRemaining, isZeroAmount } from "../lib/balance";
import { escapeClear } from "../lib/escape-clear";
import { isSplitRowComplete } from "../lib/validate-split";
import { captureFormReducer, initialCaptureFormState } from "../lib/capture-form-state";
import { StudentSearchBox } from "./student-search-box";
import { SplitRow } from "./split-row";

/**
 * Phase 6 Slice 4 — the cashier receipt-capture screen, and the first real
 * build of the architecture docs' cashier keyboard map (F2 search / F4
 * method / F8 post), explicitly deferred to "Phase 6" since the project's
 * inception. `useHotkeys()` is mounted HERE, scoped to this one screen —
 * not the app shell/layout — per the plan's explicit instruction (not yet a
 * global app-wide system).
 *
 * F8's handler and the primary submit button's `onClick` call the EXACT SAME
 * `handleSubmit` function reference below — one shared function, never two
 * divergent code paths, per the plan's explicit instruction. Both respect
 * the identical `canSubmit` gate (BR-PAY-01 unbalanced, a CASH split with no
 * open session, or the mutation already in flight) — `handleSubmit()` itself
 * re-checks `canSubmit` at the top and no-ops otherwise, so F8 can never
 * bypass the disabled state the button visually shows.
 */
export function ReceiptCaptureForm() {
  const t = useTranslations("payments.capture");
  const router = useRouter();
  const [state, dispatch] = React.useReducer(captureFormReducer, undefined, () => initialCaptureFormState(crypto.randomUUID()));
  const [error, setError] = React.useState<string | null>(null);
  const [pendingFocusRowId, setPendingFocusRowId] = React.useState<string | null>(null);

  const studentSearchRef = React.useRef<HTMLInputElement>(null);
  const methodTriggerRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map());

  // Independent, parallel queries — `useMySession()` here and
  // `useBankAccounts()` (inside each BANK/BANK_TRANSFER row's own
  // `<BankAccountSelect>`, mounted lazily only once that method is chosen)
  // are never chained via `enabled` on one another or on the student
  // search — each fires on its own as soon as it's mounted (per the plan's
  // own verification item 5).
  const sessionQuery = useMySession();
  const captureMutation = useCaptureReceipt();

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
      // Sent whenever a session is open, not only for CASH splits — a
      // deliberate product choice (not mandated by BR-PAY-04, which only
      // REQUIRES it for CASH): associating every receipt captured during an
      // open shift with that session, regardless of method mix, is what
      // makes the landing page's "this session's receipts" list a complete,
      // useful till-reconciliation view rather than a cash-only subset.
      sessionId: hasOpenSession ? sessionQuery.data?.id : undefined,
      idempotencyKey: state.idempotencyKey,
    };

    // Structural backstop only (per the plan) — the live per-field checks
    // above (`canSubmit`) are the real UX; this just guards against a
    // shape the schema itself would reject before it ever reaches the wire.
    const parsed = CaptureReceiptDtoSchema.safeParse(dto);
    if (!parsed.success) {
      setError(t("structuralValidationError"));
      return;
    }

    try {
      const receipt = await captureMutation.mutateAsync(parsed.data);
      dispatch({ type: "RESET", idempotencyKey: crypto.randomUUID() });
      router.push(`/payments/receipts/${receipt.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  useHotkeys({
    F2: () => {
      studentSearchRef.current?.focus();
      studentSearchRef.current?.select();
    },
    F4: () => {
      const last = state.splits[state.splits.length - 1];
      if (!last || isSplitRowComplete(last)) {
        const id = crypto.randomUUID();
        setPendingFocusRowId(id);
        dispatch({ type: "ADD_SPLIT", id });
      } else {
        methodTriggerRefs.current.get(last.id)?.focus();
      }
    },
    F8: () => {
      void handleSubmit();
    },
  });

  // Focuses a just-added row's method trigger once it's actually mounted
  // (the ref only exists after the re-render `ADD_SPLIT` triggers).
  React.useEffect(() => {
    if (!pendingFocusRowId) return;
    const el = methodTriggerRefs.current.get(pendingFocusRowId);
    if (el) {
      el.focus();
      setPendingFocusRowId(null);
    }
  }, [state.splits, pendingFocusRowId]);

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
            <StudentSearchBox ref={studentSearchRef} selectedStudent={state.student} onSelect={(s) => dispatch({ type: "SET_STUDENT", student: s })} />
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
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <CardTitle className="text-base text-foreground">{t("splitsSectionTitle")}</CardTitle>
          <div className="w-40 space-y-1.5">
            <Label required>{t("total")}</Label>
            <MoneyInput
              value={state.total}
              onValueChange={(v) => dispatch({ type: "SET_FIELD", field: "total", value: v ?? "" })}
              currency={DEFAULT_CURRENCY}
              onKeyDown={escapeClear(() => dispatch({ type: "SET_FIELD", field: "total", value: "" }))}
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
              registerMethodTriggerRef={(el) => {
                if (el) methodTriggerRefs.current.set(row.id, el);
                else methodTriggerRefs.current.delete(row.id);
              }}
            />
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const id = crypto.randomUUID();
              dispatch({ type: "ADD_SPLIT", id });
            }}
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
