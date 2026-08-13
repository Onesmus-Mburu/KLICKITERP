"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { useSupplier } from "@/features/procurement/hooks/use-suppliers";
import { useContract, type ContractResponseDto } from "@/features/procurement/hooks/use-contracts";
import { EditContractDialog } from "@/features/procurement/components/edit-contract-dialog";
import { ContractStatusActions } from "@/features/procurement/components/contract-status-actions";

const STATUS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  ACTIVE: "soft-success",
  EXPIRED: "soft-secondary",
  TERMINATED: "soft-destructive",
};

/**
 * Phase 6 Slice 18 Part 5 (Procurement, Module 12) — a contract's detail
 * page: header Card (title, status badge, supplier name, `<EditContractDialog>`,
 * `<ContractStatusActions>`), then starts/ends/value/renewal-alert-days —
 * same `useParams<{id:string}>()` + `<QueryBoundary>` header-card shape
 * every other detail page in this feature folder already established. No
 * approval/history section — this entity has no approval workflow and no
 * revision chain (unlike Purchase Orders' own revision history card), so
 * this detail page stays deliberately simple, matching Suppliers' (Part 1)
 * own detail-page shape more than any approval-gated entity's.
 */
function ContractDetailBody({ contract }: { contract: ContractResponseDto }) {
  const t = useTranslations("procurement.contracts.detail");
  const tStatuses = useTranslations("procurement.contracts.statuses");
  const supplierQuery = useSupplier(contract.supplierId);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base text-foreground">{contract.title}</CardTitle>
            <Badge variant={STATUS_BADGE_VARIANT[contract.status] ?? "outline"}>{tStatuses(contract.status)}</Badge>
          </div>
          <CardDescription>{supplierQuery.data?.name ?? contract.supplierId}</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EditContractDialog contract={contract} />
          <ContractStatusActions contract={contract} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("startsOnLabel")}</p>
            <p className="text-sm text-foreground">{contract.startsOn}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("endsOnLabel")}</p>
            <p className="text-sm text-foreground">{contract.endsOn}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("valueLabel")}</p>
            <p className="text-sm text-foreground">{contract.value ? formatMoney(contract.value) : "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("renewalAlertDaysLabel")}</p>
            <p className="text-sm text-foreground">{t("renewalAlertDaysValue", { days: contract.renewalAlertDays })}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("procurement.contracts.detail");
  const contractQuery = useContract(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/procurement/contracts">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={contractQuery}>{(contract) => <ContractDetailBody contract={contract} />}</QueryBoundary>
    </div>
  );
}
