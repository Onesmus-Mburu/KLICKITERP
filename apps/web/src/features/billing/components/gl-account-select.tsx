"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { useIncomeAccounts } from "../hooks/use-accounts";

/**
 * Phase 6 Slice 3 — GL income account picker for `FeeCategoryDialog`'s
 * `glIncomeAccountId` field. Research outcome (per the plan's own ask):
 * `GET /accounting/accounts` (`accounting:account:view`) is a real,
 * existing list endpoint — confirmed by reading `accounts.controller.ts`
 * before assuming a fallback text input was needed, so the primary path
 * here is a real picker, not a UUID text box.
 *
 * Phase 6 Slice 3b follow-up: swapped the plain `<Select>` for the generic
 * `<Combobox>` primitive — the real dev-DB seed alone has 59 income accounts
 * (confirmed in Slice 3's own verification), and a "type `4010` or `school
 * fees` to jump straight to it" search is a genuine improvement over
 * scrolling a long code+name list, exactly the kind of picker `<Combobox>`
 * was built generically to also serve, per the plan's own suggestion.
 *
 * The plan's fallback ("if no suitable list endpoint exists, fall back to a
 * plain labeled UUID text input") is still implemented, but conditionally —
 * a role that can manage `billing:fee-category` but lacks
 * `accounting:account:view` will get a real 403 from this query, and rather
 * than blocking the whole fee-category form on that, this component
 * degrades to the plain UUID input with a visible explanatory hint instead
 * of silently failing. This is a more honest application of the plan's
 * fallback than "assume the endpoint never exists" would have been.
 */
export function GlAccountSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("billing.feeCategories.dialog");
  const query = useIncomeAccounts();

  const items = React.useMemo(
    () => (query.data ?? []).map((account) => ({ value: account.id, label: `${account.code} — ${account.name}` })),
    [query.data],
  );

  if (query.isError) {
    return (
      <div className="space-y-1.5">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("glAccountUuidPlaceholder")}
          disabled={disabled}
          maxLength={36}
        />
        <p className="text-xs text-warning-foreground">{t("glAccountLoadFailedHint")}</p>
      </div>
    );
  }

  return (
    <Combobox
      items={items}
      value={value}
      onChange={onChange}
      placeholder={query.isLoading ? t("loadingAccounts") : t("selectGlAccount")}
      searchPlaceholder={t("searchGlAccount")}
      emptyText={t("noAccountsFound")}
      disabled={disabled || query.isLoading}
    />
  );
}
