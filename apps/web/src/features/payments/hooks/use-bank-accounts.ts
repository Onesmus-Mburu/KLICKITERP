"use client";

import { useQuery } from "@tanstack/react-query";
import { listBankAccounts } from "../api/bank-accounts.api";

/** `banking:account:manage`-gated server-side — a plain cashier role likely won't hold this (it's a config-domain permission, not a payments one), so a real 403 here is the EXPECTED common path, not a rare edge case — `<BankAccountSelect>` degrades to a plain UUID input in that case rather than blocking the whole capture form (see that component's own doc comment). Only `kind: "BANK"`/`isActive: true` accounts are offered — CASH/MPESA_SETTLEMENT/PETTY `bank_account` rows aren't relevant to a BANK/BANK_TRANSFER receipt split's own bank-account reference. */
export function useBankAccounts() {
  return useQuery({
    queryKey: ["payments", "bank-accounts", "BANK"],
    queryFn: () => listBankAccounts({ kind: "BANK", isActive: true }),
  });
}
