"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import type { BankAccountResponseDto, UpdateBankAccountDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useUpdateAccount } from "../hooks/use-accounts";

const NAME_MAX_LENGTH = 80; // bank_account.name is varchar(80) — bank-account.entity.ts.
const BANK_NAME_MAX_LENGTH = 120; // bank_account.bank_name is varchar(120) — bank-account.entity.ts.
const BRANCH_MAX_LENGTH = 120; // bank_account.branch is varchar(120) — bank-account.entity.ts.
const ACCOUNT_NO_MAX_LENGTH = 40; // bank_account.account_no is varchar(40) — bank-account.entity.ts.

/**
 * Phase 6 Slice 21 Part 1 (Banking foundations, Module 16) —
 * `UpdateBankAccountDto` only allows `name?`/`bankName?`/`branch?`/
 * `accountNo?`/`isActive?` (confirmed by reading `account.dto.ts`/
 * `AccountsController.update()` directly). This dialog deliberately OMITS
 * `kind`/`glAccountId` entirely — not disabled inputs, no fields rendered at
 * all — matching the exact "immutable-after-creation fields get omitted, not
 * disabled" precedent `edit-account-dialog.tsx` (Accounting, Slice 17 Part 1)
 * already established for `code`/`class`/`parentId`/`isPostable`.
 *
 * A plain two-way diff, same shape every prior edit dialog in this codebase
 * uses — `bankName`/`branch`/`accountNo` each support clearing back to `null`
 * via an empty input (`value.trim() === "" ? null : value.trim()`), since all
 * three are genuinely nullable on the entity.
 */
export function EditAccountDialog({ account }: { account: BankAccountResponseDto }) {
  const t = useTranslations("banking.accounts.editDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(account.name);
  const [bankName, setBankName] = React.useState(account.bankName ?? "");
  const [branch, setBranch] = React.useState(account.branch ?? "");
  const [accountNo, setAccountNo] = React.useState(account.accountNo ?? "");
  const [isActive, setIsActive] = React.useState(account.isActive);
  const [error, setError] = React.useState<string | null>(null);
  const updateMutation = useUpdateAccount();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName(account.name);
      setBankName(account.bankName ?? "");
      setBranch(account.branch ?? "");
      setAccountNo(account.accountNo ?? "");
      setIsActive(account.isActive);
      setError(null);
    }
  }

  const canSubmit = name.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: UpdateBankAccountDto = {};
    if (name.trim() !== account.name) dto.name = name.trim();

    const originalBankName = account.bankName ?? "";
    if (bankName.trim() !== originalBankName) dto.bankName = bankName.trim() === "" ? null : bankName.trim();

    const originalBranch = account.branch ?? "";
    if (branch.trim() !== originalBranch) dto.branch = branch.trim() === "" ? null : branch.trim();

    const originalAccountNo = account.accountNo ?? "";
    if (accountNo.trim() !== originalAccountNo) dto.accountNo = accountNo.trim() === "" ? null : accountNo.trim();

    if (isActive !== account.isActive) dto.isActive = isActive;

    if (Object.keys(dto).length === 0) {
      setOpen(false);
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: account.id, dto });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Pencil className="size-4" />
          {tCommon("edit")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { name: account.name })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label required>{t("nameLabel")}</Label>
            <Input value={name} maxLength={NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>{t("bankNameLabel")}</Label>
            <Input value={bankName} maxLength={BANK_NAME_MAX_LENGTH} onChange={(e) => setBankName(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("branchLabel")}</Label>
              <Input value={branch} maxLength={BRANCH_MAX_LENGTH} onChange={(e) => setBranch(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("accountNoLabel")}</Label>
              <Input value={accountNo} maxLength={ACCOUNT_NO_MAX_LENGTH} onChange={(e) => setAccountNo(e.target.value)} />
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox id="edit-bank-account-is-active" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            <Label htmlFor="edit-bank-account-is-active">{t("isActiveLabel")}</Label>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || updateMutation.isPending}>
            {updateMutation.isPending ? t("saving") : tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
