"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Award } from "lucide-react";
import type { QuotationResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { ApiError } from "@/lib/api-error";
import { useSuppliers } from "../hooks/use-suppliers";
import { useAwardQuotation, useQuotationsByRequisition } from "../hooks/use-quotations";

/**
 * Phase 6 Slice 18 Part 3 (Procurement, Module 12) — there is no dedicated
 * "compare quotations" backend endpoint (confirmed by reading
 * `QuotationsController` directly — the plan's own explicit call-out); this
 * builds the comparison entirely from `GET /quotations?requisitionId=X`'s own
 * response, rendered as a card grid, one per quotation, so a user can
 * eyeball totals/terms side by side before awarding one.
 *
 * Supplier NAMES (not just ids) are resolved via a plain, unfiltered
 * `useSuppliers()` (no status filter — an inactive/blacklisted supplier can
 * still have a real historical quotation on file, and hiding its name here
 * would be worse than showing it) — `QuotationResponseDto` only carries
 * `supplierId`, the same "no denormalized name field, resolve client-side"
 * shape `requisitions/[id]/page.tsx` already established for
 * `departmentId`/`useDepartment()`.
 */
export function QuotationComparison({ requisitionId }: { requisitionId: string }) {
  const quotationsQuery = useQuotationsByRequisition(requisitionId);
  const suppliersQuery = useSuppliers();

  const supplierNameById = React.useMemo(
    () => new Map((suppliersQuery.data ?? []).map((s) => [s.id, s.name])),
    [suppliersQuery.data],
  );

  const alreadyAwarded = (quotationsQuery.data ?? []).some((q) => q.isAwarded);

  return (
    <QueryBoundary query={quotationsQuery} isEmpty={(d) => d.length === 0}>
      {(quotations) => (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quotations.map((quotation) => (
            <QuotationCard
              key={quotation.id}
              quotation={quotation}
              supplierName={supplierNameById.get(quotation.supplierId) ?? quotation.supplierId}
              alreadyAwarded={alreadyAwarded}
            />
          ))}
        </div>
      )}
    </QueryBoundary>
  );
}

function QuotationCard({
  quotation,
  supplierName,
  alreadyAwarded,
}: {
  quotation: QuotationResponseDto;
  supplierName: string;
  alreadyAwarded: boolean;
}) {
  const t = useTranslations("procurement.quotations.comparison");

  return (
    <Card className={quotation.isAwarded ? "border-success/50" : undefined}>
      <CardHeader className="space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base text-foreground">{supplierName}</CardTitle>
          {quotation.isAwarded && (
            <Badge variant="soft-success">
              <Award className="mr-1 size-3" />
              {t("awardedBadge")}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t("totalLabel")}</span>
          <span className="font-semibold text-foreground">{formatMoney(quotation.total)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{t("quoteDateLabel")}</span>
          <span className="text-foreground">{quotation.quoteDate}</span>
        </div>
        {quotation.validUntil && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("validUntilLabel")}</span>
            <span className="text-foreground">{quotation.validUntil}</span>
          </div>
        )}
        {quotation.terms && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("termsLabel")}</p>
            <p className="text-sm text-foreground">{quotation.terms}</p>
          </div>
        )}
        {quotation.isAwarded && quotation.awardReason && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("awardReasonLabel")}</p>
            <p className="text-sm text-foreground">{quotation.awardReason}</p>
          </div>
        )}
      </CardContent>
      {!quotation.isAwarded && (
        <CardFooter>
          <AwardQuotationDialog quotation={quotation} disabled={alreadyAwarded} />
        </CardFooter>
      )}
    </Card>
  );
}

function AwardQuotationDialog({ quotation, disabled }: { quotation: QuotationResponseDto; disabled: boolean }) {
  const t = useTranslations("procurement.quotations.comparison");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [awardReason, setAwardReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const awardMutation = useAwardQuotation();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setAwardReason("");
      setError(null);
    }
  }

  const canSubmit = awardReason.trim().length > 0 && !awardMutation.isPending;

  async function handleAward() {
    if (!canSubmit) return;
    setError(null);
    try {
      await awardMutation.mutateAsync({ id: quotation.id, awardReason: awardReason.trim() });
      setOpen(false);
    } catch (err) {
      // BR-PROC (implicit): `uq_proc_quotation_award_p` — at most one awarded
      // quotation per requisition, enforced as a real DB unique-violation and
      // surfaced here as a 409. Client-side `disabled` already prevents most
      // of this (see `QuotationComparison`'s own `alreadyAwarded`), but a
      // second browser tab / another user racing this same requisition can
      // still hit it for real, so this is handled explicitly, not assumed
      // unreachable.
      if (err instanceof ApiError && err.status === 409) {
        setError(t("alreadyAwardedError"));
      } else {
        setError(err instanceof ApiError ? err.message : t("genericError"));
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" className="w-full" disabled={disabled}>
          <Award className="size-4" />
          {t("awardTrigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("awardDialogTitle")}</DialogTitle>
          <DialogDescription>{t("awardDialogDescription")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label required>{t("awardReasonLabel")}</Label>
          <Input value={awardReason} onChange={(e) => setAwardReason(e.target.value)} placeholder={t("awardReasonPlaceholder")} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleAward()} disabled={!canSubmit}>
            {awardMutation.isPending ? t("awarding") : t("awardConfirmButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
