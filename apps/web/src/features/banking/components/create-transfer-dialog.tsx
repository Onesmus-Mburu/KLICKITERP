"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { CreateBankTransferDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/patterns/money-input";
import { ApiError } from "@/lib/api-error";
import { useAccounts as useBankAccounts } from "@/features/banking/hooks/use-accounts";
import { useCreateTransfer } from "../hooks/use-transfers";

/**
 * Phase 6 Slice 21 Part 2 (Banking, Module 16) — `POST /banking/transfers`.
 * `fromAccountId`/`toAccountId` both reuse Part 1's own bank-account picker
 * (`features/banking/hooks/use-accounts.ts`, `isActive: true` — deliberately
 * NO `kind` filter: BR-BANK-01 imposes none, `BankTransfersService.create()`
 * only checks both accounts EXIST and are DISTINCT, confirmed by reading it
 * directly — a transfer between two `CASH`-kind accounts, or `CASH` ->
 * `BANK`, is just as valid as `BANK` -> `BANK`). Each picker excludes the
 * OTHER field's own current selection client-side — a UX nicety that makes
 * the same-account mistake harder to make by accident; the REAL enforcement
 * is entirely server-side (see `transfers.api.ts`'s own doc comment), so this
 * is surfaced verbatim via `ApiError.message` if it's ever hit anyway (e.g. a
 * race, or two accounts that briefly look identical).
 */
export function CreateTransferDialog() {
  const t = useTranslations("banking.transfers.createDialog");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [fromAccountId, setFromAccountId] = React.useState("");
  const [toAccountId, setToAccountId] = React.useState("");
  const [amount, setAmount] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateTransfer();
  const accountsQuery = useBankAccounts({ isActive: true });

  function resetForm() {
    setFromAccountId("");
    setToAccountId("");
    setAmount(null);
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) resetForm();
  }

  const allAccountItems = React.useMemo(
    () => (accountsQuery.data ?? []).map((a) => ({ value: a.id, label: a.bankName ? `${a.name} — ${a.bankName}` : a.name })),
    [accountsQuery.data],
  );
  const fromAccountItems = React.useMemo(() => allAccountItems.filter((item) => item.value !== toAccountId), [allAccountItems, toAccountId]);
  const toAccountItems = React.useMemo(() => allAccountItems.filter((item) => item.value !== fromAccountId), [allAccountItems, fromAccountId]);

  const sameAccount = !!fromAccountId && fromAccountId === toAccountId;
  const canSubmit = !!fromAccountId && !!toAccountId && !sameAccount && !!amount && !createMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit || !amount) return;
    setError(null);
    const dto: CreateBankTransferDto = { fromAccountId, toAccountId, amount };
    try {
      const created = await createMutation.mutateAsync(dto);
      setOpen(false);
      router.push(`/banking/transfers/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">
          <Plus className="size-4" />
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

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label required>{t("fromAccountLabel")}</Label>
            <Combobox
              items={fromAccountItems}
              value={fromAccountId}
              onChange={setFromAccountId}
              placeholder={accountsQuery.isLoading ? t("loadingAccounts") : t("selectAccountPlaceholder")}
              searchPlaceholder={t("searchAccounts")}
              emptyText={t("noAccountsFound")}
              disabled={accountsQuery.isLoading}
            />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("toAccountLabel")}</Label>
            <Combobox
              items={toAccountItems}
              value={toAccountId}
              onChange={setToAccountId}
              placeholder={accountsQuery.isLoading ? t("loadingAccounts") : t("selectAccountPlaceholder")}
              searchPlaceholder={t("searchAccounts")}
              emptyText={t("noAccountsFound")}
              disabled={accountsQuery.isLoading}
            />
            {sameAccount && <p className="text-xs text-destructive">{t("sameAccountError")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label required>{t("amountLabel")}</Label>
            <MoneyInput value={amount ?? ""} onValueChange={setAmount} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {createMutation.isPending ? t("creating") : t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
