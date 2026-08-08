"use client";

import { useTranslations } from "next-intl";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { useStudentCreditBalance } from "../hooks/use-student-credit";

/**
 * Phase 6 Slice 12 (Part E) — the student detail page's new Credit Balance
 * card, the direct sibling of `features/wallet/components/wallet-card.tsx`
 * (Slice 11, Part 2): same `<QueryBoundary>`-wrapped-balance-display shape,
 * `isEmpty={() => false}` for the identical reason `WalletCard`'s own doc
 * comment already documents for `wallet === null` — a `"0.0000"` balance is
 * a legitimate, meaningful state to show plainly, not `<QueryBoundary>`'s
 * generic "Nothing here yet" empty panel.
 *
 * Deliberately SIMPLER than `WalletCard`, per the plan's own instruction:
 *  - No "Create Credit Balance account" action — `GET .../credit-balance`
 *    never 404s (it returns `"0.0000"` for a student who's never had one),
 *    and a `bill_student_credit` row is lazily created server-side on first
 *    real `StudentCreditService.issue()` call (an overpaying receipt) —
 *    there is no user-initiated "provision this" action to build here at
 *    all, unlike Wallet's opt-in `POST wallets/students/{studentId}`.
 *  - No "view full detail" link — no credit-balance detail page exists
 *    anywhere in this plan, just the one read endpoint this card already
 *    shows the whole of.
 */
export function CreditBalanceCard({ studentId }: { studentId: string }) {
  const t = useTranslations("students.detail.creditBalance");
  const balanceQuery = useStudentCreditBalance(studentId);

  return (
    <QueryBoundary query={balanceQuery} isEmpty={() => false}>
      {(credit) => (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">{t("balanceLabel")}</p>
            <p className="text-lg font-semibold text-foreground">{formatMoney(credit.balance)}</p>
          </div>
          <p className="max-w-xs text-right text-xs text-muted-foreground">{t("description")}</p>
        </div>
      )}
    </QueryBoundary>
  );
}
