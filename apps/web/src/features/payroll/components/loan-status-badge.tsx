"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { PyrlLoanStatus } from "../api/loans.api";

/**
 * Phase 6 Slice 22 Part 5 (Payroll, Module 15) — the 4 real `pyrl_loan.status`
 * values, one small shared component (2 real call sites — the loans list
 * column and the detail page header — matching this feature's own
 * established `component-combobox.tsx`/`percent.ts` precedent of factoring
 * out 2+-call-site logic rather than duplicating it).
 *
 * **`WRITTEN_OFF` covers two real, DIFFERENT underlying situations that this
 * badge deliberately does NOT try to distinguish** (there is nothing in the
 * response to distinguish them by, and the task brief is explicit that this
 * is a real, honest ambiguity, not an oversight): a loan application that was
 * rejected before ever going `ACTIVE` (in practice, with this controller's 4
 * actions, the only real path to `WRITTEN_OFF`), or — theoretically, though
 * no code path here currently produces it — an active loan written off later.
 * The label stays the plain, honest "Written Off" either way; it never
 * claims "Rejected" (a status that does not exist in the real
 * `pyrl_loan.status` enum at all).
 */
const STATUS_BADGE_VARIANT: Record<PyrlLoanStatus, "soft-warning" | "soft-primary" | "soft-success" | "soft-destructive"> = {
  PENDING_APPROVAL: "soft-warning",
  ACTIVE: "soft-primary",
  SETTLED: "soft-success",
  WRITTEN_OFF: "soft-destructive",
};

export function LoanStatusBadge({ status }: { status: PyrlLoanStatus }) {
  const t = useTranslations("payroll.loans.statuses");
  return <Badge variant={STATUS_BADGE_VARIANT[status]}>{t(status)}</Badge>;
}
