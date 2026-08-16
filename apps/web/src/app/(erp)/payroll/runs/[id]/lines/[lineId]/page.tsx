"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { PayslipView } from "@/features/payroll/components/payslip-view";
import { useRun, useRunLines } from "@/features/payroll/hooks/use-payroll-runs";

/**
 * Phase 6 Slice 22 Part 7 (Payroll, Module 15) — a dedicated, bookmarkable,
 * print-friendly payslip route, per the task brief's own suggested path.
 * Not reached from the nav (deliberate — this dropdown's shape is now
 * FINAL, see `nav-links.tsx`'s own doc comment) — reached ONLY by clicking
 * "View payslip" on a specific row of `<RunLinesTable>` on the run's own
 * detail page (`/payroll/runs/[id]`).
 *
 * **No dedicated `GET` endpoint exists for a single `pyrl_run_line` by
 * id** (confirmed by reading `PayrollRunsController` directly — only
 * `GET :id/lines`, the whole run's list, exists) — this page re-fetches the
 * run's full line list via `useRunLines(id)` (already cached from the run
 * detail page in the common "clicked through from there" case, TanStack
 * Query's own cache making this a non-issue) and finds the one matching
 * `lineId` client-side, rather than threading state through router
 * navigation — the only way this route stays genuinely bookmarkable/
 * refreshable on its own, not just reachable via a click.
 */
export default function PayslipPage() {
  const { id, lineId } = useParams<{ id: string; lineId: string }>();
  const t = useTranslations("payroll.payslip");
  const runQuery = useRun(id);
  const linesQuery = useRunLines(id);

  return (
    <div className="space-y-6 print:space-y-4">
      <Button asChild variant="ghost" size="sm" className="print:hidden">
        <Link href={`/payroll/runs/${id}`}>
          <ArrowLeft className="size-4" />
          {t("backToRun")}
        </Link>
      </Button>

      <QueryBoundary query={runQuery}>
        {(run) => (
          <QueryBoundary query={linesQuery}>
            {(lines) => {
              const line = lines.find((l) => l.id === lineId);
              if (!line) {
                return (
                  <Alert variant="destructive">
                    <AlertDescription>{t("lineNotFoundNotice")}</AlertDescription>
                  </Alert>
                );
              }
              return <PayslipView run={run} line={line} />;
            }}
          </QueryBoundary>
        )}
      </QueryBoundary>
    </div>
  );
}
