"use client";

import { DepositWithdrawalList } from "@/features/banking/components/deposit-withdrawal-list";

/**
 * Phase 6 Slice 21 Part 2 (Banking, Module 16) — thin route wrapper around
 * the shared `<DepositWithdrawalList kind="deposit">` (see that component's
 * own doc comment for why the list body is a single shared implementation
 * rather than duplicated per kind).
 */
export default function DepositsPage() {
  return <DepositWithdrawalList kind="deposit" />;
}
