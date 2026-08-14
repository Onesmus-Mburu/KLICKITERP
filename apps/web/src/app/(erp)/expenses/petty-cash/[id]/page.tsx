"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { useUsersLookup } from "@/features/departments/hooks/use-users-lookup";
import { UpdateCeilingDialog } from "@/features/expenses/components/update-ceiling-dialog";
import { FloatVouchersList } from "@/features/expenses/components/float-vouchers-list";
import { ReplenishmentList } from "@/features/expenses/components/replenishment-list";
import { useFloat, type FloatResponseDto } from "@/features/expenses/hooks/use-petty-cash";

/**
 * Phase 6 Slice 20 Part 2 (Petty Cash, Module 14) — a float's detail page:
 * header Card (custodian, ceiling/balance, `<UpdateCeilingDialog>`), then
 * `<FloatVouchersList>` (spend action + voucher history) and
 * `<ReplenishmentList>` (request action + replenishment history, each
 * cross-referencing this same float's own voucher list to show real voucher
 * numbers per replenishment — see that component's own doc comment).
 *
 * **Balance is always shown fresh, never stale** — `useFloat()` (this page's
 * own query) is invalidated by `useSpend()`/`useUpdateFloatCeiling()`/
 * `useExecuteReplenishment()` (the only 3 mutations that ever change a
 * float's own `ceiling`/`balance`, per `use-petty-cash.ts`'s own doc
 * comments), so this header re-renders with the real, current balance
 * immediately after any of those actions — no manual re-fetch button needed.
 */
function FloatDetailBody({ float }: { float: FloatResponseDto }) {
  const t = useTranslations("expenses.pettyCash.floats.detail");
  const usersQuery = useUsersLookup();

  const custodianLabel = React.useMemo(() => {
    const user = (usersQuery.data?.items ?? []).find((u) => u.id === float.custodianUserId);
    return user ? `${user.fullName} (${user.username})` : float.custodianUserId;
  }, [usersQuery.data, float.custodianUserId]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base text-foreground">{custodianLabel}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </div>
          <UpdateCeilingDialog float={float} />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("ceilingLabel")}</p>
              <p className="text-lg font-semibold text-foreground">{formatMoney(float.ceiling)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("balanceLabel")}</p>
              <p className="text-lg font-semibold text-foreground">{formatMoney(float.balance)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <FloatVouchersList float={float} />
      <ReplenishmentList floatId={float.id} />
    </div>
  );
}

export default function FloatDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("expenses.pettyCash.floats.detail");
  const floatQuery = useFloat(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/expenses/petty-cash">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={floatQuery}>{(float) => <FloatDetailBody float={float} />}</QueryBoundary>
    </div>
  );
}
