"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { CreateDepositOrWithdrawalDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/patterns/money-input";
import { ApiError } from "@/lib/api-error";
import { useAccounts as useBankAccounts } from "@/features/banking/hooks/use-accounts";
import { useCreateDepositOrWithdrawal, type DepositWithdrawalKind } from "../hooks/use-deposits-withdrawals";

const SLIP_REF_MAX_LENGTH = 60; // bank_deposit.slip_ref / bank_withdrawal.slip_ref is varchar(60) — bank-deposit.entity.ts / bank-withdrawal.entity.ts.

/**
 * Phase 6 Slice 21 Part 2 (Banking, Module 16) — ONE shared dialog for BOTH
 * `POST /banking/deposits` and `POST /banking/withdrawals`, parameterized by
 * `kind` (the same "one shared component, kind discriminator" shape this
 * part's own `deposits-withdrawals.api.ts` already establishes at the API
 * layer — see that file's own doc comment for why a shared implementation
 * over two near-duplicate files). `kind === "deposit"` renders/submits
 * exactly like `kind === "withdrawal"`, just against
 * `banking.deposits.createDialog`/`banking.withdrawals.createDialog`'s own
 * (separately translated, direction-appropriate) copy and the matching
 * `/banking/deposits`/`/banking/withdrawals` route.
 *
 * **Single account picker, not two** — `accountId` is the ONLY bank-account
 * field on `CreateDepositOrWithdrawalDto` (reuses Part 1's own
 * `features/banking/hooks/use-accounts.ts`, `isActive: true`, no `kind`
 * filter — same reasoning as `create-transfer-dialog.tsx`'s own doc comment:
 * the server imposes none). This is deliberate, not a missing field: a
 * deposit/withdrawal's OTHER leg is always the generic `1700 Undeposited
 * Funds` clearing account, never a second real `bank_account` row (a
 * cashier's till/safe is never itself registered as one) — see
 * `deposits-withdrawals.api.ts`'s own "GL posting" doc comment.
 *
 * **`sourceSessionId` is deliberately NEVER offered here** — the task's own
 * explicit instruction: it's a reference-only optional link to an existing
 * `pay_cashier_session` (Module 10/Payments), with no additional posting
 * logic keyed off it server-side (`DepositsService`'s own doc comment
 * confirms this directly), and no cashier-session picker exists anywhere in
 * this Banking feature (that workflow lives entirely in `features/payments/`).
 * Every deposit/withdrawal created through this dialog therefore has
 * `sourceSessionId: null` — the detail page still displays it read-only
 * (see `deposit-withdrawal-detail.tsx`) in case a future integration ever
 * populates it some other way.
 */
export function CreateDepositWithdrawalDialog({ kind }: { kind: DepositWithdrawalKind }) {
  const t = useTranslations(`banking.${kind}s.createDialog`);
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [accountId, setAccountId] = React.useState("");
  const [amount, setAmount] = React.useState<string | null>(null);
  const [slipRef, setSlipRef] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateDepositOrWithdrawal(kind);
  const accountsQuery = useBankAccounts({ isActive: true });

  function resetForm() {
    setAccountId("");
    setAmount(null);
    setSlipRef("");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) resetForm();
  }

  const accountItems = React.useMemo(
    () => (accountsQuery.data ?? []).map((a) => ({ value: a.id, label: a.bankName ? `${a.name} — ${a.bankName}` : a.name })),
    [accountsQuery.data],
  );

  const canSubmit = !!accountId && !!amount && !createMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit || !amount) return;
    setError(null);
    const dto: CreateDepositOrWithdrawalDto = { accountId, amount, ...(slipRef.trim() ? { slipRef: slipRef.trim() } : {}) };
    try {
      const created = await createMutation.mutateAsync(dto);
      setOpen(false);
      router.push(`/banking/${kind}s/${created.id}`);
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
            <Label required>{t("accountLabel")}</Label>
            <Combobox
              items={accountItems}
              value={accountId}
              onChange={setAccountId}
              placeholder={accountsQuery.isLoading ? t("loadingAccounts") : t("selectAccountPlaceholder")}
              searchPlaceholder={t("searchAccounts")}
              emptyText={t("noAccountsFound")}
              disabled={accountsQuery.isLoading}
            />
          </div>
          <div className="space-y-1.5">
            <Label required>{t("amountLabel")}</Label>
            <MoneyInput value={amount ?? ""} onValueChange={setAmount} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("slipRefLabel")}</Label>
            <Input value={slipRef} maxLength={SLIP_REF_MAX_LENGTH} onChange={(e) => setSlipRef(e.target.value)} placeholder={t("slipRefPlaceholder")} />
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
