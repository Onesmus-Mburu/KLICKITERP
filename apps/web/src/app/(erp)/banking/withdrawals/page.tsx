"use client";

import { DepositWithdrawalList } from "@/features/banking/components/deposit-withdrawal-list";

/**
 * Phase 6 Slice 21 Part 2 (Banking, Module 16) — thin route wrapper around
 * the shared `<DepositWithdrawalList kind="withdrawal">` (see that
 * component's own doc comment for why the list body is a single shared
 * implementation rather than duplicated per kind).
 */
export default function WithdrawalsPage() {
  return <DepositWithdrawalList kind="withdrawal" />;
}
