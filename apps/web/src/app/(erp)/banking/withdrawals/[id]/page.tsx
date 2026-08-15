"use client";

import { DepositWithdrawalDetail } from "@/features/banking/components/deposit-withdrawal-detail";

/**
 * Phase 6 Slice 21 Part 2 (Banking, Module 16) — thin route wrapper around
 * the shared `<DepositWithdrawalDetail kind="withdrawal">` (see that
 * component's own doc comment for why the detail body is a single shared
 * implementation rather than duplicated per kind).
 */
export default function WithdrawalDetailPage() {
  return <DepositWithdrawalDetail kind="withdrawal" />;
}
