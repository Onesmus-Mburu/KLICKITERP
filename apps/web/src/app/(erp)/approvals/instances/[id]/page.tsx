"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { ActionTrail } from "@/features/approvals/components/action-trail";
import { DecideButtons } from "@/features/approvals/components/decide-buttons";
import { EntityLabel } from "@/features/approvals/components/entity-label";
import { InstanceStatusBadge } from "@/features/approvals/components/status-badges";
import { UserName } from "@/features/approvals/components/user-name";
import { useInstance } from "@/features/approvals/hooks/use-instances";
import type { InstanceDetail } from "@/features/approvals/types";

function ProfileRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

/** The decide screen: full detail + the `actions` trail rendered as a real audit log, Approve/Reject/Return. */
function InstanceDetailView({ instance }: { instance: InstanceDetail }) {
  const t = useTranslations("approvals.detail");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t("summaryTitle")}</h1>
        <InstanceStatusBadge status={instance.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("summaryTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileRow label={t("domainLabel")} value={instance.domainCode} />
          <ProfileRow label={t("entityLabel")} value={<EntityLabel entityType={instance.entityType} entityId={instance.entityId} />} />
          <ProfileRow label={t("amountLabel")} value={instance.amount ? formatMoney(instance.amount) : "—"} />
          <ProfileRow label={t("initiatorLabel")} value={<UserName id={instance.initiatorId} />} />
          <ProfileRow label={t("submittedLabel")} value={new Date(instance.submittedAt).toLocaleString()} />
          <ProfileRow label={t("currentLevelLabel")} value={instance.currentLevel} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("decideTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <DecideButtons instance={instance} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("actionTrail.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionTrail actions={instance.actions} />
        </CardContent>
      </Card>
    </>
  );
}

export default function InstanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("approvals.detail");
  const instanceQuery = useInstance(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/approvals">
          <ArrowLeft className="size-4" />
          {t("backToInbox")}
        </Link>
      </Button>

      <QueryBoundary query={instanceQuery}>{(instance) => <InstanceDetailView instance={instance} />}</QueryBoundary>
    </div>
  );
}
