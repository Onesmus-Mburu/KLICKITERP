"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useRequisition, useRequisitions } from "@/features/procurement/hooks/use-requisitions";
import { CreateQuotationDialog } from "@/features/procurement/components/create-quotation-dialog";
import { QuotationComparison } from "@/features/procurement/components/quotation-comparison";

/**
 * Phase 6 Slice 18 Part 3 (Procurement, Module 12) — deliberately
 * requisition-scoped, per the task brief's own explicit question: "consider
 * whether this needs a requisition-id query param or is better reached FROM
 * a requisition's own detail page." `QuotationsController_list`'s
 * `requisitionId` query param is genuinely REQUIRED, not optional (confirmed
 * by reading the controller directly — no "list every quotation" endpoint
 * exists at all), so a top-level, unscoped quotations screen has nothing
 * meaningful to show; this route mirrors `billing/collect/page.tsx`'s own
 * `?studentId=` shape instead (client-side `useSearchParams()` inside a
 * `<Suspense>` boundary, per Next.js App Router's own requirement for that
 * hook).
 *
 * **No dedicated top-level nav entry for Quotations** (see `nav-links.tsx`'s
 * own Part 3 doc comment for the full reasoning) — the real, intended entry
 * point is `requisitions/[id]/page.tsx`'s new "Quotations" link, shown once a
 * requisition is APPROVED. This page ALSO works as a standalone landing spot
 * (bookmarked, or reached with no `?requisitionId=` at all): it offers a
 * plain picker over every APPROVED requisition and pushes the query param
 * once one is chosen, rather than a dead-end empty state — a requisition
 * with an awarded quotation can still usefully be revisited here even after
 * it's converted into a PO, so this isn't narrowed to APPROVED-only in the
 * comparison view itself, only in the PICKER (a CONVERTED/CANCELLED
 * requisition is reached via its own detail page's link, which always
 * supplies the id directly).
 */
function QuotationsPageContent() {
  const t = useTranslations("procurement.quotations.comparison");
  const router = useRouter();
  const searchParams = useSearchParams();
  const requisitionId = searchParams.get("requisitionId") ?? undefined;

  const requisitionQuery = useRequisition(requisitionId);
  const approvedRequisitionsQuery = useRequisitions({ status: "APPROVED" });

  if (!requisitionId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">{t("pickRequisitionTitle")}</CardTitle>
            <CardDescription>{t("pickRequisitionDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <QueryBoundary query={approvedRequisitionsQuery} isEmpty={(d) => d.length === 0}>
              {(requisitions) => (
                <Select onValueChange={(id) => router.push(`/procurement/quotations?requisitionId=${id}`)}>
                  <SelectTrigger className="max-w-sm">
                    <SelectValue placeholder={t("selectRequisitionPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {requisitions.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </QueryBoundary>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/procurement/requisitions/${requisitionId}`}>
          <ArrowLeft className="size-4" />
          {t("backToRequisition")}
        </Link>
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
          <p className="text-sm text-muted-foreground">
            {requisitionQuery.data ? t("pageSubtitleForRequisition", { number: requisitionQuery.data.number }) : t("pageSubtitle")}
          </p>
        </div>
        <CreateQuotationDialog requisitionId={requisitionId} />
      </div>

      <QuotationComparison requisitionId={requisitionId} />
    </div>
  );
}

export default function QuotationsPage() {
  return (
    <React.Suspense fallback={null}>
      <QuotationsPageContent />
    </React.Suspense>
  );
}
