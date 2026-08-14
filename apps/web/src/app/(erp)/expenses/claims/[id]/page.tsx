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
import { useUsersLookup } from "@/features/departments/hooks/use-users-lookup";
import { isDraftPlaceholderNumber } from "@/features/expenses/api/vouchers.api";
import { useClaim, useClaimLines, type ClaimResponseDto } from "@/features/expenses/hooks/use-claims";
import { ClaimLineEditor } from "@/features/expenses/components/claim-line-editor";
import { ClaimStatusActions } from "@/features/expenses/components/claim-status-actions";

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  DRAFT: "soft-secondary",
  PENDING_APPROVAL: "soft-warning",
  APPROVED: "soft-primary",
  REIMBURSED: "success",
  REJECTED: "soft-destructive",
  CANCELLED: "outline",
};

/**
 * Phase 6 Slice 20 Part 3 (Staff Claims, Module 14) — a claim's detail page:
 * header Card (number — an honest "Not yet allocated" label while it's still
 * the `DRAFT-<uuid-prefix>` placeholder, matching Part 1's own Vouchers
 * treatment of the identical pattern — staff name, status badge,
 * `reimburseVia` shown READ-ONLY per this part's own scope, `total`,
 * `<ClaimStatusActions>`), then a lines Card wrapping `<ClaimLineEditor>`
 * (add/edit/delete while DRAFT, read-only table once submitted).
 *
 * **`reimburseVia` has no edit affordance anywhere on this page** — it's set
 * once at creation and can never change (no PATCH exists on the claim header
 * at all, confirmed by reading `ClaimsController` directly — see
 * `claims.api.ts`'s own doc comment); rendering it as plain text here (not a
 * `<Select>`) is a deliberate reflection of that real backend constraint, not
 * an oversight.
 *
 * Staff name is resolved the same way `create-claim-dialog.tsx`'s/
 * `create-float-dialog.tsx`'s own STAFF pickers already do:
 * `useUsersLookup()`, matched by `staffUserId` — `ClaimResponseDto` only
 * carries the id, no denormalized name field.
 *
 * `hasLines` is computed here (a page-level `useClaimLines(id)` call,
 * deduped against `<ClaimLineEditor>`'s own identical query by React Query's
 * shared cache — the same "page fetches lines too, just for this one derived
 * boolean" pattern `requisitions/[id]/page.tsx` (Procurement, Slice 18 Part
 * 2) already establishes for its own `<RequisitionStatusActions
 * hasLines={...}>`) and threaded into `<ClaimStatusActions>` so Submit can be
 * client-side disabled on a zero-line DRAFT claim — the server's own real 422
 * remains the actual source of truth regardless.
 */
function ClaimDetailBody({ claim, hasLines }: { claim: ClaimResponseDto; hasLines: boolean }) {
  const t = useTranslations("expenses.claims.detail");
  const tStatuses = useTranslations("expenses.claims.statuses");
  const tReimburseVia = useTranslations("expenses.claims.reimburseVia");
  const usersQuery = useUsersLookup();

  const staffLabel = React.useMemo(() => {
    const user = (usersQuery.data?.items ?? []).find((u) => u.id === claim.staffUserId);
    return user ? `${user.fullName} (${user.username})` : claim.staffUserId;
  }, [usersQuery.data, claim.staffUserId]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base text-foreground">
                {isDraftPlaceholderNumber(claim.number) ? <span className="text-muted-foreground">{t("notYetAllocated")}</span> : claim.number}
              </CardTitle>
              <Badge variant={STATUS_BADGE_VARIANT[claim.status] ?? "outline"}>{tStatuses(claim.status)}</Badge>
            </div>
            <CardDescription>{staffLabel}</CardDescription>
          </div>
          <ClaimStatusActions claim={claim} hasLines={hasLines} />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("reimburseViaLabel")}</p>
              <p className="text-sm text-foreground">{tReimburseVia(claim.reimburseVia)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("linesTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ClaimLineEditor claim={claim} />
        </CardContent>
      </Card>
    </div>
  );
}

export default function ClaimDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("expenses.claims.detail");
  const claimQuery = useClaim(id);
  const linesQuery = useClaimLines(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/expenses/claims">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={claimQuery}>
        {(claim) => <ClaimDetailBody claim={claim} hasLines={(linesQuery.data ?? []).length > 0} />}
      </QueryBoundary>
    </div>
  );
}
