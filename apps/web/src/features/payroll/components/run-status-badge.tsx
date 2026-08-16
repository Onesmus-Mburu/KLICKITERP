"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { PyrlRunStatus } from "../api/payroll-runs.api";

/**
 * Phase 6 Slice 22 Part 6 (Payroll, Module 15) — all 8 real `pyrl_run.status`
 * values (this part's own UI only ever DRIVES a transition through
 * `APPROVED` — `COMMITTED`/`PAID`/`FILED` are Part 7's job — but a run
 * fetched via `GET /payroll/runs`/`GET /payroll/runs/:id` can genuinely be in
 * any of the 8 once Part 7 ships, so this badge covers the full real enum
 * now rather than needing a second pass later).
 */
const STATUS_BADGE_VARIANT: Record<PyrlRunStatus, "soft-secondary" | "soft-primary" | "soft-warning" | "soft-success" | "soft-accent" | "soft-destructive"> = {
  DRAFT: "soft-secondary",
  COMPUTED: "soft-primary",
  REVIEW: "soft-warning",
  PENDING_APPROVAL: "soft-warning",
  APPROVED: "soft-success",
  COMMITTED: "soft-success",
  PAID: "soft-accent",
  FILED: "soft-accent",
};

export function RunStatusBadge({ status }: { status: PyrlRunStatus }) {
  const t = useTranslations("payroll.runs.statuses");
  return <Badge variant={STATUS_BADGE_VARIANT[status]}>{t(status)}</Badge>;
}
