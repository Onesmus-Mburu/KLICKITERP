"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Combobox } from "@/components/ui/combobox";
import { useWallets } from "../hooks/use-wallets";

/**
 * Phase 6 Slice 11 (Part 3) — "reuse the wallet list/search for this" per
 * the plan, for `TransferToWalletDto.toWalletId`. Same tradeoff
 * `GlAccountSelect` already established (Slice 3b's own doc comment): fetch
 * one larger page (`pageSize=100`) and let `<Combobox>`'s own client-side
 * substring filter do the "search" — this dev environment's real wallet
 * count is far below that, and no dedicated small-search-box wiring exists
 * for `<Combobox>` (its `query` state is fully internal), so a genuine
 * server-side-`q`-per-keystroke picker would need a NEW primitive, out of
 * scope for one field. `excludeWalletId` drops the wallet you're already
 * transferring FROM out of its own destination picker.
 */
export function WalletPicker({
  value,
  onChange,
  excludeWalletId,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  excludeWalletId?: string;
  disabled?: boolean;
}) {
  const t = useTranslations("wallet.pickers.wallet");
  const query = useWallets({ page: 1, pageSize: 100 });

  const items = React.useMemo(
    () =>
      (query.data?.items ?? [])
        .filter((w) => w.id !== excludeWalletId)
        .map((w) => ({ value: w.id, label: `${w.studentName} (${w.admissionNo})` })),
    [query.data, excludeWalletId],
  );

  return (
    <Combobox
      items={items}
      value={value}
      onChange={onChange}
      placeholder={query.isLoading ? t("loading") : t("placeholder")}
      searchPlaceholder={t("searchPlaceholder")}
      emptyText={t("empty")}
      disabled={disabled || query.isLoading}
    />
  );
}
