"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { useBankAccounts } from "../hooks/use-bank-accounts";

/**
 * Bank-account picker for a BANK/BANK_TRANSFER split row's `bankAccountId`.
 * Mirrors `features/billing/components/gl-account-select.tsx`'s exact
 * conditional-degrade-to-plain-UUID-input-on-403 template (per the plan's
 * own explicit instruction to follow it as a template): `GET /banking/accounts`
 * is a real, existing endpoint (`banking:account:manage`-gated, confirmed by
 * reading `accounts.controller.ts` directly), so the primary path here is a
 * real `<Combobox>` picker, not a UUID text box by default.
 *
 * That permission is a config-domain one a plain cashier role likely won't
 * hold (it's the same permission that gates full bank-account CRUD, not a
 * narrower read-only one) — so the plain-UUID-input fallback below is
 * expected to be the COMMON path in practice, not a rare edge case; that's
 * expected, not a bug to fix (per the plan's own note).
 */
export function BankAccountSelect({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const t = useTranslations("payments.capture");
  const query = useBankAccounts();

  const items = React.useMemo(
    () =>
      (query.data ?? []).map((account) => ({
        value: account.id,
        label: account.bankName ? `${account.name} — ${account.bankName}` : account.name,
      })),
    [query.data],
  );

  if (query.isError) {
    return (
      <div className="space-y-1.5">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("bankAccountUuidPlaceholder")}
          disabled={disabled}
          maxLength={36}
        />
        <p className="text-xs text-warning-foreground">{t("bankAccountLoadFailedHint")}</p>
      </div>
    );
  }

  return (
    <Combobox
      items={items}
      value={value}
      onChange={onChange}
      placeholder={query.isLoading ? t("loadingBankAccounts") : t("selectBankAccount")}
      searchPlaceholder={t("searchBankAccount")}
      emptyText={t("noBankAccountsFound")}
      disabled={disabled || query.isLoading}
    />
  );
}
