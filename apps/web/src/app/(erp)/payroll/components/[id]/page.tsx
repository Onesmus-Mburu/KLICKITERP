"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Info } from "lucide-react";
import type { PyrlComponentResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useAccount as useGlAccount } from "@/features/accounting/hooks/use-accounts";
import { useComponent } from "@/features/payroll/hooks/use-components";
import { EditComponentDialog } from "@/features/payroll/components/edit-component-dialog";

/**
 * Phase 6 Slice 22 Part 1 (Payroll foundations, Module 15) — a payroll
 * component's detail page: header `Card` (code, kind badge,
 * `<EditComponentDialog>`) + a details grid (name, taxable/statutory
 * badges, the linked GL account resolved to a human `code — name` label) —
 * the same `useParams<{id:string}>()` + `<QueryBoundary>` header-card shape
 * `app/(erp)/banking/accounts/[id]/page.tsx` (Slice 21 Part 1) establishes.
 *
 * Repeats the "code is permanent and load-bearing" notice from the list page
 * — real, user-facing context on every one of the 8 real seeded rows and any
 * component created here, not decorative copy.
 */
export default function PayrollComponentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("payroll.components.detail");
  const componentQuery = useComponent(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/payroll/components">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={componentQuery}>{(component) => <ComponentDetailCard component={component} />}</QueryBoundary>
    </div>
  );
}

function ComponentDetailCard({ component }: { component: PyrlComponentResponseDto }) {
  const t = useTranslations("payroll.components.detail");
  const tKinds = useTranslations("payroll.components.kinds");
  const tList = useTranslations("payroll.components.list");
  const glAccountQuery = useGlAccount(component.glAccountId);
  const glAccountLabel = glAccountQuery.data ? `${glAccountQuery.data.code} — ${glAccountQuery.data.name}` : component.glAccountId;

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="size-4" />
        <AlertDescription>{tList("codePermanentNotice")}</AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base text-foreground">{component.name}</CardTitle>
              <Badge variant="outline">{component.code}</Badge>
              <Badge variant="soft-secondary">{tKinds(component.kind)}</Badge>
            </div>
          </div>
          <EditComponentDialog component={component} />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("isTaxableLabel")}</p>
              <p className="text-sm text-foreground">
                <Badge variant={component.isTaxable ? "soft-success" : "soft-secondary"}>{component.isTaxable ? t("yes") : t("no")}</Badge>
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("isStatutoryLabel")}</p>
              <p className="text-sm text-foreground">
                <Badge variant={component.isStatutory ? "soft-warning" : "soft-secondary"}>{component.isStatutory ? t("yes") : t("no")}</Badge>
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("glAccountLabel")}</p>
              <p className="text-sm text-foreground">{glAccountLabel}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
