"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { CreateBankAccountDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import { useAccounts as useGlAccounts } from "@/features/accounting/hooks/use-accounts";
import { useCreateAccount } from "../hooks/use-accounts";

const NAME_MAX_LENGTH = 80; // bank_account.name is varchar(80) — bank-account.entity.ts.
const BANK_NAME_MAX_LENGTH = 120; // bank_account.bank_name is varchar(120) — bank-account.entity.ts.
const BRANCH_MAX_LENGTH = 120; // bank_account.branch is varchar(120) — bank-account.entity.ts.
const ACCOUNT_NO_MAX_LENGTH = 40; // bank_account.account_no is varchar(40) — bank-account.entity.ts.

const BANK_ACCOUNT_KINDS = ["BANK", "CASH", "MPESA_SETTLEMENT", "PETTY"] as const;

/**
 * Phase 6 Slice 21 Part 1 (Banking foundations, Module 16) — the bank account
 * create form: `name` + `kind` (a required 4-option `<Select>` — `BANK`/
 * `CASH`/`MPESA_SETTLEMENT`/`PETTY`, confirmed against `BANK_ACCOUNT_KINDS`
 * directly) + a required `glAccountId` picker + optional `bankName`/`branch`/
 * `accountNo` inputs. `kind`/`glAccountId` are the ONLY two fields that can
 * ever be set here — both are locked post-creation server-side (confirmed by
 * reading `UpdateBankAccountDto`/`AccountsController.update()` directly, see
 * `accounts.api.ts`'s own doc comment), matching `EditAccountDialog`
 * (Accounting, Slice 17 Part 1)'s own precedent of omitting immutable fields
 * entirely from the edit form rather than disabling them.
 *
 * **GL account picker**: reuses `features/accounting/hooks/use-accounts.ts`
 * (Slice 17) — that hook's own doc comment notes `AccountsController.list()`
 * has no `isPostable` filter param, so callers filter client-side; this
 * dialog fetches `useGlAccounts({ isActive: true })` (server-side active
 * filter, the same param every sibling picker in this codebase already uses)
 * and narrows further to `isPostable` client-side — the same "postable +
 * active" combined filter `create-category-dialog.tsx` (Expenses, Slice 20
 * Part 1) already established for its own EXPENSE-class-scoped picker; this
 * one is NOT class-scoped (a bank account's own `gl_account` is typically
 * ASSET-class — cash/bank/clearing accounts — but the server itself imposes
 * no class restriction beyond active+postable, confirmed by reading
 * `BankAccountsService.create()` directly, so this picker doesn't invent one
 * either).
 *
 * BR-BANK-01's TWO unique constraints (`uq_bank_account_name` /
 * `uq_bank_account_gl_account_id`) are never pre-validated client-side (no
 * "list every name"/"is this glAccountId taken" cheap-check endpoint exists)
 * — a real `409` is surfaced verbatim via `ApiError.message` if either is
 * violated, exactly like every other globally-unique-name entity in this
 * codebase.
 */
export function CreateAccountDialog() {
  const t = useTranslations("banking.accounts.createDialog");
  const tKinds = useTranslations("banking.kinds");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<(typeof BANK_ACCOUNT_KINDS)[number]>("BANK");
  const [glAccountId, setGlAccountId] = React.useState("");
  const [bankName, setBankName] = React.useState("");
  const [branch, setBranch] = React.useState("");
  const [accountNo, setAccountNo] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateAccount();
  const glAccountsQuery = useGlAccounts({ isActive: true });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setName("");
      setKind("BANK");
      setGlAccountId("");
      setBankName("");
      setBranch("");
      setAccountNo("");
      setError(null);
    }
  }

  const glAccountItems = React.useMemo(
    () => (glAccountsQuery.data ?? []).filter((a) => a.isPostable && a.isActive).map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` })),
    [glAccountsQuery.data],
  );
  const canSubmit = name.trim().length > 0 && !!glAccountId;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: CreateBankAccountDto = {
      name: name.trim(),
      kind,
      glAccountId,
      ...(bankName.trim() ? { bankName: bankName.trim() } : {}),
      ...(branch.trim() ? { branch: branch.trim() } : {}),
      ...(accountNo.trim() ? { accountNo: accountNo.trim() } : {}),
    };
    try {
      await createMutation.mutateAsync(dto);
      setOpen(false);
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

        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>{t("nameLabel")}</Label>
              <Input value={name} maxLength={NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label required>{t("kindLabel")}</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as (typeof BANK_ACCOUNT_KINDS)[number])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BANK_ACCOUNT_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {tKinds(k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label required>{t("glAccountLabel")}</Label>
            <Combobox
              items={glAccountItems}
              value={glAccountId}
              onChange={setGlAccountId}
              placeholder={glAccountsQuery.isLoading ? t("loadingAccounts") : t("glAccountPlaceholder")}
              searchPlaceholder={t("glAccountSearchPlaceholder")}
              emptyText={t("glAccountEmptyText")}
              disabled={glAccountsQuery.isLoading}
            />
            <p className="text-xs text-muted-foreground">{t("glAccountHint")}</p>
          </div>

          <div className="space-y-1.5">
            <Label>{t("bankNameLabel")}</Label>
            <Input
              value={bankName}
              maxLength={BANK_NAME_MAX_LENGTH}
              onChange={(e) => setBankName(e.target.value)}
              placeholder={t("bankNamePlaceholder")}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("branchLabel")}</Label>
              <Input value={branch} maxLength={BRANCH_MAX_LENGTH} onChange={(e) => setBranch(e.target.value)} placeholder={t("branchPlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("accountNoLabel")}</Label>
              <Input
                value={accountNo}
                maxLength={ACCOUNT_NO_MAX_LENGTH}
                onChange={(e) => setAccountNo(e.target.value)}
                placeholder={t("accountNoPlaceholder")}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || createMutation.isPending}>
            {createMutation.isPending ? t("creating") : t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
