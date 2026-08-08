"use client";

import { useTranslations } from "next-intl";
import { useBankAccounts } from "../hooks/use-bank-accounts";

/**
 * Resolves a `bankAccountId` (e.g. `BulkAllocationBatchResponseDto
 * .bankAccountId`, Phase 6 Slice 7) to a human-readable name, reusing
 * `useBankAccounts()`'s existing cached BANK-kind list query verbatim (same
 * data `<BankAccountSelect>`'s own picker already fetches — no new endpoint
 * call). Degrades to a truncated raw id on load/error/not-found, the same
 * conditional-degrade template `BulkAllocationLineStudentCell` already
 * establishes for an analogous id-to-label resolution.
 */
export function BankAccountLabel({ bankAccountId }: { bankAccountId: string }) {
  const t = useTranslations("payments.capture");
  const query = useBankAccounts();

  if (query.isLoading) return <span className="text-muted-foreground">{t("loadingBankAccounts")}</span>;

  const account = query.data?.find((a) => a.id === bankAccountId);
  if (!account) return <span className="text-muted-foreground">{bankAccountId.slice(0, 8)}…</span>;

  return <span>{account.bankName ? `${account.name} — ${account.bankName}` : account.name}</span>;
}
