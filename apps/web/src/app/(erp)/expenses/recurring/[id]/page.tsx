"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { useCostCenters } from "@/features/accounting/hooks/use-cost-centers";
import { useSupplier } from "@/features/procurement/hooks/use-suppliers";
import { useUsersLookup } from "@/features/departments/hooks/use-users-lookup";
import { useCategory } from "@/features/expenses/hooks/use-categories";
import { EditRecurringDialog } from "@/features/expenses/components/edit-recurring-dialog";
import { parseRecurringTemplate, useRecurringTemplate, type RecurringResponseDto } from "@/features/expenses/hooks/use-recurring";

/**
 * Phase 6 Slice 20 Part 4 (Recurring Templates, Module 14 — the LAST part of
 * this slice) — a recurring template's detail page: header Card (schedule,
 * next run date, active/inactive badge, `<EditRecurringDialog>` — the only
 * place a template can be edited or deactivated), then a details Card
 * (payee, category, cost center, amount, method, narrative — the same shape
 * `vouchers/[id]/page.tsx`'s own details grid establishes for the identical
 * template field set), and a last-fired Card linking to the most recent
 * DRAFT voucher this template produced, if any.
 *
 * `template`'s polymorphic `payeeRef` is resolved the same way
 * `vouchers/[id]/page.tsx`'s own `payeeLabel` does: `SUPPLIER` via
 * `useSupplier()` (a real detail fetch, single template not a list),
 * `STAFF` via `useUsersLookup()`, `OTHER` read directly off the already-
 * parsed `otherName`/`otherContact` — all via `parseRecurringTemplate()`
 * (`recurring.api.ts`), never hand-rolled again here.
 */
function RecurringDetailBody({ recurring }: { recurring: RecurringResponseDto }) {
  const t = useTranslations("expenses.recurring.detail");
  const tPayeeTypes = useTranslations("expenses.vouchers.payeeTypes");
  const tMethods = useTranslations("expenses.vouchers.methods");

  const parsed = React.useMemo(() => parseRecurringTemplate(recurring.template), [recurring.template]);

  const categoryQuery = useCategory(parsed.categoryId);
  const costCentersQuery = useCostCenters();
  const usersQuery = useUsersLookup();
  const supplierQuery = useSupplier(parsed.payeeType === "SUPPLIER" ? parsed.supplierId : undefined);

  const costCenter = React.useMemo(
    () => (costCentersQuery.data ?? []).find((c) => c.id === parsed.costCenterId),
    [costCentersQuery.data, parsed.costCenterId],
  );

  const payeeLabel = React.useMemo(() => {
    if (parsed.payeeType === "SUPPLIER") return supplierQuery.data?.name ?? parsed.supplierId ?? "—";
    if (parsed.payeeType === "STAFF") {
      const user = (usersQuery.data?.items ?? []).find((u) => u.id === parsed.staffUserId);
      return user ? `${user.fullName} (${user.username})` : (parsed.staffUserId ?? "—");
    }
    return parsed.otherContact ? `${parsed.otherName} — ${parsed.otherContact}` : parsed.otherName;
  }, [parsed, supplierQuery.data, usersQuery.data]);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base text-foreground">{payeeLabel}</CardTitle>
              <Badge variant={recurring.isActive ? "success" : "soft-secondary"}>{recurring.isActive ? t("active") : t("inactive")}</Badge>
            </div>
            <CardDescription>
              {t("scheduleLabel")}: <span className="font-mono">{recurring.scheduleCron}</span> · {t("nextRunOnLabel")}: {recurring.nextRunOn}
            </CardDescription>
          </div>
          <EditRecurringDialog recurring={recurring} />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("payeeTypeLabel")}</p>
              <p className="text-sm text-foreground">{tPayeeTypes(parsed.payeeType)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("categoryLabel")}</p>
              <p className="text-sm text-foreground">{categoryQuery.data?.name ?? parsed.categoryId}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("costCenterLabel")}</p>
              <p className="text-sm text-foreground">{costCenter ? `${costCenter.code} — ${costCenter.name}` : t("noCostCenter")}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("amountLabel")}</p>
              <p className="text-sm font-semibold text-foreground">{formatMoney(parsed.amount)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("methodLabel")}</p>
              <p className="text-sm text-foreground">{tMethods(parsed.method)}</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("narrativeLabel")}</p>
            <p className="whitespace-pre-wrap text-sm text-foreground">{parsed.narrative}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("lastFiredTitle")}</CardTitle>
          <CardDescription>{t("lastFiredDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {recurring.lastVoucherId ? (
            <Link href={`/expenses/vouchers/${recurring.lastVoucherId}`} className="text-sm text-primary hover:underline">
              {t("viewLastVoucher")}
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">{t("neverFired")}</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function RecurringDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("expenses.recurring.detail");
  const recurringQuery = useRecurringTemplate(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/expenses/recurring">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={recurringQuery}>{(recurring) => <RecurringDetailBody recurring={recurring} />}</QueryBoundary>
    </div>
  );
}
