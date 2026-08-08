"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import type { MpesaTransactionResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoneyInput } from "@/components/patterns/money-input";
import { ApiError } from "@/lib/api-error";
import { DEFAULT_CURRENCY, normalizeMoneyInput } from "@/lib/money";
import { RECEIPT_SPLIT_METHODS, type ReceiptSplitMethod } from "../constants";
import { escapeClear } from "../lib/escape-clear";
import type { SplitRowState } from "../lib/capture-form-state";
import { useInitiateStk } from "../hooks/use-mpesa";
import { BankAccountSelect } from "./bank-account-select";
import { StkStatusPanel } from "./stk-status-panel";

/**
 * One split row's fields, plus its method-conditional sub-fields
 * (`ReceiptsService.validateSplitReferences()`'s real per-method
 * requirements — see `../lib/validate-split.ts`'s doc comment for the exact
 * mapping). `registerMethodTriggerRef` lets the parent capture form's F4
 * hotkey handler focus this row's method `<Select>` trigger directly
 * (`hooks/use-hotkeys.ts`'s F4 binding) — `<SelectTrigger>` forwards its ref
 * to the real underlying `<button>` DOM node.
 */
export function SplitRow({
  row,
  onChange,
  onRemove,
  canRemove,
  registerMethodTriggerRef,
  stkContext,
}: {
  row: SplitRowState;
  onChange: (patch: Partial<SplitRowState>) => void;
  onRemove: () => void;
  canRemove: boolean;
  registerMethodTriggerRef: (el: HTMLButtonElement | null) => void;
  /**
   * Phase 6 Slice 9 (Part A) — context the `MPESA_STK` branch's "Send STK
   * Push" trigger needs that doesn't live on `SplitRowState` itself (the
   * student and their account reference are form-level, not per-row).
   * Optional and additive: `receipt-capture-form.tsx` (the plain cashier
   * screen, untouched this pass) doesn't pass it, so its own MPESA_STK row
   * shows the phone field with a disabled trigger and a hint, rather than a
   * crash.
   */
  stkContext?: { studentId: string; accountRef: string; invoiceIds?: string[] };
}) {
  const t = useTranslations("payments.capture");
  const tMethod = useTranslations("payments.splitMethods");
  const [stkMsisdn, setStkMsisdn] = React.useState("");
  const [stkTransaction, setStkTransaction] = React.useState<MpesaTransactionResponseDto | null>(null);
  const [stkError, setStkError] = React.useState<string | null>(null);
  const initiateStkMutation = useInitiateStk();

  /** Shared by the trigger's own click handler AND `<StkStatusPanel>`'s "Resend" — a fresh `initiateStk()` call, same amount/msisdn/accountRef/invoiceIds, a genuinely NEW transaction/checkoutRequestId each time (Safaricom STK prompts are single-use). */
  async function initiateStkForThisRow(): Promise<MpesaTransactionResponseDto> {
    if (!stkContext) throw new Error("MPESA_STK: no student context available on this capture screen");
    const amountKes = normalizeMoneyInput(row.amount);
    if (!amountKes) throw new Error(t("stkAmountRequired"));
    if (!stkMsisdn.trim()) throw new Error(t("stkMsisdnRequired"));
    return initiateStkMutation.mutateAsync({
      studentId: stkContext.studentId,
      amountKes,
      msisdn: stkMsisdn.trim(),
      accountRef: stkContext.accountRef,
      invoiceIds: stkContext.invoiceIds,
    });
  }

  async function handleSendStkPush() {
    setStkError(null);
    try {
      const txn = await initiateStkForThisRow();
      setStkTransaction(txn);
    } catch (err) {
      setStkError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_auto]">
        <div className="space-y-1.5">
          <Label required>{t("method")}</Label>
          <Select value={row.method} onValueChange={(v) => onChange({ method: v as ReceiptSplitMethod })}>
            <SelectTrigger ref={registerMethodTriggerRef} onKeyDown={escapeClear(() => onChange({ method: "" }))}>
              <SelectValue placeholder={t("selectMethod")} />
            </SelectTrigger>
            <SelectContent>
              {RECEIPT_SPLIT_METHODS.map((method) => (
                <SelectItem key={method} value={method}>
                  {tMethod(method)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label required>{t("amount")}</Label>
          <MoneyInput
            value={row.amount}
            onValueChange={(v) => onChange({ amount: v ?? "" })}
            currency={DEFAULT_CURRENCY}
            onKeyDown={escapeClear(() => onChange({ amount: "" }))}
          />
        </div>
        <div className="flex items-end">
          <Button type="button" variant="ghost" size="icon" onClick={onRemove} disabled={!canRemove} aria-label={t("removeSplit")}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {row.method === "CHEQUE" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label required>{t("chequeBankName")}</Label>
            <Input value={row.chequeBankName} onChange={(e) => onChange({ chequeBankName: e.target.value })} onKeyDown={escapeClear(() => onChange({ chequeBankName: "" }))} maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("chequeNo")}</Label>
            <Input value={row.chequeNo} onChange={(e) => onChange({ chequeNo: e.target.value })} onKeyDown={escapeClear(() => onChange({ chequeNo: "" }))} maxLength={30} />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("chequeDate")}</Label>
            <Input type="date" value={row.chequeDate} onChange={(e) => onChange({ chequeDate: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("chequeDrawer")}</Label>
            <Input value={row.chequeDrawer} onChange={(e) => onChange({ chequeDrawer: e.target.value })} onKeyDown={escapeClear(() => onChange({ chequeDrawer: "" }))} maxLength={120} />
          </div>
        </div>
      )}

      {(row.method === "BANK" || row.method === "BANK_TRANSFER") && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label required>{t("bankAccount")}</Label>
            <BankAccountSelect value={row.bankAccountId} onChange={(v) => onChange({ bankAccountId: v })} />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("externalRef")}</Label>
            <Input value={row.externalRef} onChange={(e) => onChange({ externalRef: e.target.value })} onKeyDown={escapeClear(() => onChange({ externalRef: "" }))} maxLength={60} />
          </div>
        </div>
      )}

      {(row.method === "CARD" || row.method === "POS") && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label required>{t("externalRef")}</Label>
            <Input value={row.externalRef} onChange={(e) => onChange({ externalRef: e.target.value })} onKeyDown={escapeClear(() => onChange({ externalRef: "" }))} maxLength={60} />
          </div>
        </div>
      )}

      {row.method === "MPESA_STK" &&
        (stkTransaction ? (
          <StkStatusPanel transaction={stkTransaction} onResend={initiateStkForThisRow} />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label required>{t("stkMsisdn")}</Label>
                <Input
                  value={stkMsisdn}
                  onChange={(e) => setStkMsisdn(e.target.value)}
                  onKeyDown={escapeClear(() => setStkMsisdn(""))}
                  placeholder={t("stkMsisdnPlaceholder")}
                  maxLength={15}
                />
              </div>
            </div>
            {stkError && <p className="text-sm text-destructive">{stkError}</p>}
            {!stkContext && <p className="text-xs text-muted-foreground">{t("stkContextUnavailable")}</p>}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleSendStkPush()}
              disabled={!stkContext || !stkMsisdn.trim() || !normalizeMoneyInput(row.amount) || initiateStkMutation.isPending}
            >
              {initiateStkMutation.isPending ? t("stkSending") : t("stkSendTrigger")}
            </Button>
          </div>
        ))}
    </div>
  );
}
