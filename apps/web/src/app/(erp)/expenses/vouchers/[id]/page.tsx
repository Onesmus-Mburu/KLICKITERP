"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { useCostCenters } from "@/features/accounting/hooks/use-cost-centers";
import { useSupplier } from "@/features/procurement/hooks/use-suppliers";
import { useUsersLookup } from "@/features/departments/hooks/use-users-lookup";
import { useCategory } from "@/features/expenses/hooks/use-categories";
import { isDraftPlaceholderNumber, useVoucher, type VoucherResponseDto } from "@/features/expenses/hooks/use-vouchers";
import { VoucherStatusActions } from "@/features/expenses/components/voucher-status-actions";

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  DRAFT: "soft-secondary",
  PENDING_APPROVAL: "soft-warning",
  APPROVED: "soft-primary",
  PAID: "success",
  CANCELLED: "soft-destructive",
};

/**
 * Phase 6 Slice 20 Part 1 (Expenses Foundations, Module 14) — an expense
 * voucher's detail page: header Card (number — an honest "Not yet paid"
 * label while it's still the `DRAFT-<uuid-prefix>` placeholder, matching
 * Procurement's own POs/Payment Vouchers, Slice 18, treatment of the
 * identical pattern — payee, status badge, `<VoucherStatusActions>`), then a
 * details Card (payee type, category, cost center, amount, method,
 * narrative) and, once posted, a journal link. **No line items anywhere** —
 * `exp_voucher` is a flat header document, one amount/one category per
 * voucher (simpler than Procurement's requisitions/POs), per this part's own
 * brief.
 *
 * `payeeRef`'s polymorphic shape is resolved the same way
 * `vouchers/page.tsx`'s own `resolvePayee()` does: `SUPPLIER` via
 * `useSupplier()` (a real detail fetch here, since this is a single voucher,
 * not a list needing a bulk lookup map), `STAFF` via the same
 * `useUsersLookup()` wrapper `create-voucher-dialog.tsx` uses, `OTHER` read
 * directly off `payeeRef.name`/`.contact` (guarded with runtime `typeof`
 * checks — `payeeRef` is a genuinely untyped `Record<string, unknown>` on
 * the wire, never trusted blindly).
 */
function VoucherDetailBody({ voucher }: { voucher: VoucherResponseDto }) {
  const t = useTranslations("expenses.vouchers.detail");
  const tPayeeTypes = useTranslations("expenses.vouchers.payeeTypes");
  const tMethods = useTranslations("expenses.vouchers.methods");
  const tStatuses = useTranslations("expenses.vouchers.statuses");

  const categoryQuery = useCategory(voucher.categoryId);
  const costCentersQuery = useCostCenters();
  const usersQuery = useUsersLookup();

  const supplierId = voucher.payeeType === "SUPPLIER" && typeof voucher.payeeRef.supplierId === "string" ? voucher.payeeRef.supplierId : undefined;
  const supplierQuery = useSupplier(supplierId);

  const costCenter = React.useMemo(
    () => (costCentersQuery.data ?? []).find((c) => c.id === voucher.costCenterId),
    [costCentersQuery.data, voucher.costCenterId],
  );

  const payeeLabel = React.useMemo(() => {
    if (voucher.payeeType === "SUPPLIER") {
      return supplierQuery.data?.name ?? supplierId ?? "—";
    }
    if (voucher.payeeType === "STAFF") {
      const staffUserId = typeof voucher.payeeRef.staffUserId === "string" ? voucher.payeeRef.staffUserId : undefined;
      const user = (usersQuery.data?.items ?? []).find((u) => u.id === staffUserId);
      return user ? `${user.fullName} (${user.username})` : (staffUserId ?? "—");
    }
    const name = typeof voucher.payeeRef.name === "string" ? voucher.payeeRef.name : "—";
    const contact = typeof voucher.payeeRef.contact === "string" ? voucher.payeeRef.contact : "";
    return contact ? `${name} — ${contact}` : name;
  }, [voucher.payeeType, voucher.payeeRef, supplierQuery.data, supplierId, usersQuery.data]);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base text-foreground">
                {isDraftPlaceholderNumber(voucher.number) ? <span className="text-muted-foreground">{t("notYetPaid")}</span> : voucher.number}
              </CardTitle>
              <Badge variant={STATUS_BADGE_VARIANT[voucher.status] ?? "outline"}>{tStatuses(voucher.status)}</Badge>
            </div>
            <CardDescription>{payeeLabel}</CardDescription>
          </div>
          <VoucherStatusActions voucher={voucher} />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("payeeTypeLabel")}</p>
              <p className="text-sm text-foreground">{tPayeeTypes(voucher.payeeType)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("categoryLabel")}</p>
              <p className="text-sm text-foreground">{categoryQuery.data?.name ?? voucher.categoryId}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("costCenterLabel")}</p>
              <p className="text-sm text-foreground">{costCenter ? `${costCenter.code} — ${costCenter.name}` : t("noCostCenter")}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("amountLabel")}</p>
              <p className="text-sm font-semibold text-foreground">{formatMoney(voucher.amount)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("methodLabel")}</p>
              <p className="text-sm text-foreground">{tMethods(voucher.method)}</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("narrativeLabel")}</p>
            <p className="whitespace-pre-wrap text-sm text-foreground">{voucher.narrative}</p>
          </div>

          {voucher.journalId && (
            <p className="text-sm">
              <Link href={`/accounting/journals/${voucher.journalId}`} className="text-primary hover:underline">
                {t("viewJournal")}
              </Link>
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function VoucherDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("expenses.vouchers.detail");
  const voucherQuery = useVoucher(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/expenses/vouchers">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={voucherQuery}>{(voucher) => <VoucherDetailBody voucher={voucher} />}</QueryBoundary>
    </div>
  );
}
