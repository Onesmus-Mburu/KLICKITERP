"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { ApiError } from "@/lib/api-error";
import { useReactivateSupplier, useSupplier } from "@/features/procurement/hooks/use-suppliers";
import { EditSupplierDialog } from "@/features/procurement/components/edit-supplier-dialog";
import { BlacklistSupplierDialog } from "@/features/procurement/components/blacklist-supplier-dialog";
import { SupplierRatingsPanel } from "@/features/procurement/components/supplier-ratings-panel";

const SUPPLIER_STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  ACTIVE: "soft-success",
  BLACKLISTED: "soft-destructive",
  INACTIVE: "soft-secondary",
};

/**
 * Phase 6 Slice 18 Part 1 (Procurement, Module 12) — a supplier's detail
 * page: header `Card` (name/trading name/KRA PIN/payment terms/categories,
 * a status badge, `blacklistReason` shown only when `status === "BLACKLISTED"`),
 * `<EditSupplierDialog>`, blacklist/reactivate actions, and
 * `<SupplierRatingsPanel>` — same `useParams<{id:string}>()` +
 * `<QueryBoundary>` header-card shape `app/(erp)/roles/[id]/page.tsx`/
 * `app/(erp)/accounting/fiscal-years/[id]/page.tsx` already established.
 *
 * Reactivate is a direct-click button here (no confirm dialog — a no-body
 * POST with no destructive/hard-to-undo consequence, the same "no-body
 * action = direct click" precedent `period-status-actions.tsx`'s own Open/
 * Soft-Close buttons and `cost-centers/page.tsx`'s own Activate button
 * already establish); Blacklist is the one requiring a confirm dialog with a
 * required reason (`<BlacklistSupplierDialog>`), since
 * `BlacklistSupplierDto.reason` is a real, required field, not a stylistic
 * choice.
 */
export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("procurement.suppliers.detail");
  const tStatuses = useTranslations("procurement.suppliers.statuses");
  const supplierQuery = useSupplier(id);
  const reactivateMutation = useReactivateSupplier();
  const [reactivateError, setReactivateError] = React.useState<string | null>(null);

  async function handleReactivate() {
    setReactivateError(null);
    try {
      await reactivateMutation.mutateAsync(id);
    } catch (err) {
      setReactivateError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/procurement/suppliers">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={supplierQuery}>
        {(supplier) => (
          <>
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base text-foreground">{supplier.name}</CardTitle>
                    <Badge variant={SUPPLIER_STATUS_BADGE_VARIANT[supplier.status] ?? "outline"}>{tStatuses(supplier.status)}</Badge>
                  </div>
                  {supplier.tradingName && <CardDescription>{t("tradingNamePrefix", { tradingName: supplier.tradingName })}</CardDescription>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <EditSupplierDialog supplier={supplier} />
                  {supplier.status === "BLACKLISTED" ? (
                    <Button type="button" variant="outline" onClick={() => void handleReactivate()} disabled={reactivateMutation.isPending}>
                      <RotateCcw className="size-4" />
                      {reactivateMutation.isPending ? t("reactivating") : t("reactivateButton")}
                    </Button>
                  ) : (
                    <BlacklistSupplierDialog supplier={supplier} />
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {reactivateError && (
                  <Alert variant="destructive">
                    <AlertDescription>{reactivateError}</AlertDescription>
                  </Alert>
                )}

                {supplier.status === "BLACKLISTED" && supplier.blacklistReason && (
                  <Alert variant="destructive">
                    <AlertDescription>{t("blacklistReasonPrefix", { reason: supplier.blacklistReason })}</AlertDescription>
                  </Alert>
                )}

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("kraPinLabel")}</p>
                    <p className="text-sm text-foreground">{supplier.kraPin ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("paymentTermsDaysLabel")}</p>
                    <p className="text-sm text-foreground">{t("paymentTermsDaysValue", { days: supplier.paymentTermsDays })}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("emailLabel")}</p>
                    <p className="text-sm text-foreground">{typeof supplier.contacts.email === "string" ? supplier.contacts.email : "—"}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("categoriesLabel")}</p>
                  {supplier.categories.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {supplier.categories.map((c) => (
                        <Badge key={c} variant="soft-secondary">
                          {c}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-foreground">—</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <SupplierRatingsPanel supplier={supplier} />
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
