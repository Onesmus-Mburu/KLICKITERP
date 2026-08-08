"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { MoneyInput } from "@/components/patterns/money-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api-error";
import { DEFAULT_CURRENCY } from "@/lib/money";
import { WALLET_SERVICE_POINT_TYPES } from "../constants";
import { isLimitsCeilingExceededError } from "../lib/errors";
import { useUpdateWalletLimits } from "../hooks/use-wallets";

/**
 * Phase 6 Slice 11 (Part 2) — `POST wallets/:id/limits` (BR-WALL-04).
 * `dailyLimit`/`txnLimit` are nullable decimal strings — an empty
 * `<MoneyInput>` submits `null` (clears the limit), matching
 * `UpdateWalletLimitsDto`'s own optional-nullable shape exactly. Per the
 * plan's explicit instruction, this dialog does NOT pre-fetch/pre-validate
 * against the school-policy ceiling (`wallet.max_daily_limit`/
 * `wallet.max_txn_limit`, Settings keys with no dedicated editor UI anywhere
 * per the plan's own scope boundary #1) — a real `422` naming BR-WALL-04 is
 * caught and surfaced distinctly via `isLimitsCeilingExceededError`.
 */
export function UpdateLimitsDialog({
  walletId,
  currentDailyLimit,
  currentTxnLimit,
  currentCategoryBlocks,
  studentId,
}: {
  walletId: string;
  currentDailyLimit: string | null;
  currentTxnLimit: string | null;
  currentCategoryBlocks: string[];
  studentId?: string;
}) {
  const t = useTranslations("wallet.updateLimits");
  const tSpType = useTranslations("wallet.servicePointTypes");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [dailyLimit, setDailyLimit] = React.useState<string | null>(currentDailyLimit);
  const [txnLimit, setTxnLimit] = React.useState<string | null>(currentTxnLimit);
  const [categoryBlocks, setCategoryBlocks] = React.useState<Set<string>>(new Set(currentCategoryBlocks));
  const [error, setError] = React.useState<string | null>(null);
  const [ceilingExceeded, setCeilingExceeded] = React.useState(false);
  const mutation = useUpdateWalletLimits(walletId, studentId);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setDailyLimit(currentDailyLimit);
      setTxnLimit(currentTxnLimit);
      setCategoryBlocks(new Set(currentCategoryBlocks));
      setError(null);
      setCeilingExceeded(false);
    }
  }

  function toggleCategory(type: string) {
    setCategoryBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  async function handleSubmit() {
    setError(null);
    setCeilingExceeded(false);
    try {
      await mutation.mutateAsync({
        dailyLimit: dailyLimit === null || dailyLimit === "" ? null : dailyLimit,
        txnLimit: txnLimit === null || txnLimit === "" ? null : txnLimit,
        categoryBlocks: [...categoryBlocks],
      });
      setOpen(false);
    } catch (err) {
      if (isLimitsCeilingExceededError(err)) {
        setCeilingExceeded(true);
        setError(err.message);
        return;
      }
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">{t("trigger")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{ceilingExceeded ? t("ceilingExceededError", { message: error }) : error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("dailyLimitLabel")}</Label>
            <MoneyInput value={dailyLimit ?? ""} onValueChange={setDailyLimit} currency={DEFAULT_CURRENCY} />
            <p className="text-xs text-muted-foreground">{t("clearHint")}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t("txnLimitLabel")}</Label>
            <MoneyInput value={txnLimit ?? ""} onValueChange={setTxnLimit} currency={DEFAULT_CURRENCY} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("categoryBlocksLabel")}</Label>
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3">
              {WALLET_SERVICE_POINT_TYPES.map((type) => (
                <label key={type} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={categoryBlocks.has(type)} onChange={() => toggleCategory(type)} />
                  {tSpType(type)}
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={mutation.isPending}>
            {mutation.isPending ? t("submitting") : t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
