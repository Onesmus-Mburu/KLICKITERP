"use client";

import { useQuery } from "@tanstack/react-query";
import { getStudentCreditBalance } from "../api/student-credit.api";

/**
 * Phase 6 Slice 12 (Part E) — mirrors `features/wallet/hooks/use-wallets.ts`'s
 * `useWalletByStudent()` shape/caching convention. Only a read hook exists
 * here — unlike Wallet's create/topup/spend/etc. mutation hooks, the two
 * write paths that ever touch `bill_student_credit`
 * (`captureReceipt()`'s overpayment issuance, `applyStudentCreditToInvoices()`)
 * are driven from Payments' `ReceiptsService`, called directly via
 * `applyStudentCredit()` (`../api/student-credit.api.ts`) from the Generate
 * Invoice screens rather than through a dedicated mutation hook here — the
 * SAME pattern `bulk-generate-invoice-form.tsx`/`generate-invoice-dialog.tsx`
 * already establish for `sweepToInvoices()` (called directly, not via a
 * `useSweepToInvoices()` hook).
 */
export const STUDENT_CREDIT_QUERY_KEY = ["billing", "student-credit"] as const;

export function studentCreditBalanceKey(studentId: string | undefined) {
  return [...STUDENT_CREDIT_QUERY_KEY, "balance", studentId] as const;
}

/** `GET billing/students/{studentId}/credit-balance` — never 404s, `"0.0000"` for a student who's never had one. Used by the student detail page's Credit Balance card. */
export function useStudentCreditBalance(studentId: string | undefined) {
  return useQuery({
    queryKey: studentCreditBalanceKey(studentId),
    queryFn: () => getStudentCreditBalance(studentId as string),
    enabled: !!studentId,
  });
}
