"use client";

import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import type { PyrlLoanResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney, sumMoneyStrings } from "@/lib/money";
import { useLoanSchedule } from "../hooks/use-loans";

/**
 * Phase 6 Slice 22 Part 5 (Payroll, Module 15) — a loan's real amortization
 * schedule (`pyrl_loan_schedule`), `seq`/`duePeriod`/`principalDue`/
 * `interestDue`/total due/`recoveredAmount` per row.
 *
 * **Deliberately does NOT run `GET .../schedule` at all for a
 * `PENDING_APPROVAL` or `WRITTEN_OFF` loan** — both are genuinely, expectedly
 * empty (`[]`) forever: no schedule row is ever created until a real
 * `decide(approved: true)` call succeeds (`onApprovalDecided()`,
 * `loans.service.ts:236-258`, the ONLY place `pyrl_loan_schedule` rows are
 * ever inserted), and a rejected application (`WRITTEN_OFF` via
 * `decide(approved: false)`) never reaches that code path at all. Rendering
 * `<QueryBoundary>`'s generic "empty" panel for either case would read like
 * something went wrong; instead this component renders its own, specific
 * "not applicable yet" / "never went active" message for those two statuses
 * and only fires the real query (`useLoanSchedule(..., {enabled: true})`,
 * via `<QueryBoundary>`'s own normal loading/error/populated states) for
 * `ACTIVE`/`SETTLED`, where a real schedule is always expected to exist.
 *
 * **`isZeroAmount()` below is a plain `Number()` check, used ONLY for a
 * one-way, read-only "was this installment cancelled by an early
 * settlement?" display classification — never round-tripped back into a
 * request body** — the same "one-way display convenience, not a
 * precision-sensitive conversion" judgment call
 * `statutory-table-params-view.tsx`'s own `formatRate()` already makes for
 * this exact class of concern (Part 4). A cancelled row is real,
 * server-produced data: `settleEarly()` zeroes `principalDue`/`interestDue`
 * on every not-yet-recovered future installment (`loans.service.ts:289-321`)
 * — flagged here as `cancelledBadge`, not silently indistinguishable from a
 * row that (in current practice) could never legitimately have a real zero
 * principal/interest of its own.
 */
export function LoanScheduleTable({ loan }: { loan: PyrlLoanResponseDto }) {
  const t = useTranslations("payroll.loans.scheduleTable");

  if (loan.status === "PENDING_APPROVAL") {
    return (
      <Alert>
        <Info className="size-4" />
        <AlertDescription>{t("notYetGeneratedNotice")}</AlertDescription>
      </Alert>
    );
  }

  if (loan.status === "WRITTEN_OFF") {
    return (
      <Alert>
        <Info className="size-4" />
        <AlertDescription>{t("writtenOffNoScheduleNotice")}</AlertDescription>
      </Alert>
    );
  }

  return <ActiveLoanSchedule loanId={loan.id} />;
}

function ActiveLoanSchedule({ loanId }: { loanId: string }) {
  const t = useTranslations("payroll.loans.scheduleTable");
  const scheduleQuery = useLoanSchedule(loanId);

  return (
    <QueryBoundary query={scheduleQuery} isEmpty={(rows) => rows.length === 0}>
      {(rows) => (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("seqColumn")}</TableHead>
                <TableHead>{t("duePeriodColumn")}</TableHead>
                <TableHead>{t("principalDueColumn")}</TableHead>
                <TableHead>{t("interestDueColumn")}</TableHead>
                <TableHead>{t("totalDueColumn")}</TableHead>
                <TableHead>{t("recoveredColumn")}</TableHead>
                <TableHead>{t("statusColumn")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...rows]
                .sort((a, b) => a.seq - b.seq)
                .map((row) => {
                  const cancelled = isZeroAmount(row.principalDue) && isZeroAmount(row.interestDue) && isZeroAmount(row.recoveredAmount);
                  return (
                    <TableRow key={row.id}>
                      <TableCell>{row.seq}</TableCell>
                      <TableCell>{row.duePeriod}</TableCell>
                      <TableCell>{formatMoney(row.principalDue)}</TableCell>
                      <TableCell>{formatMoney(row.interestDue)}</TableCell>
                      <TableCell>{formatMoney(sumMoneyStrings([row.principalDue, row.interestDue]))}</TableCell>
                      <TableCell>{formatMoney(row.recoveredAmount)}</TableCell>
                      <TableCell>
                        {cancelled ? (
                          <Badge variant="soft-secondary">{t("cancelledBadge")}</Badge>
                        ) : isZeroAmount(row.recoveredAmount) ? (
                          <Badge variant="outline">{t("outstandingBadge")}</Badge>
                        ) : (
                          <Badge variant="soft-success">{t("recoveredBadge")}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
      )}
    </QueryBoundary>
  );
}

function isZeroAmount(decimalString: string): boolean {
  return Number(decimalString) === 0;
}
