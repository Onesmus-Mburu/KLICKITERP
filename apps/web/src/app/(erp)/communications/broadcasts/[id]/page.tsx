"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import type { BroadcastResponseDto } from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useBroadcast } from "@/features/comms/hooks/use-broadcasts";
import { useRoles } from "@/features/roles/hooks/use-roles";
import { BroadcastStatusBadge } from "@/features/comms/components/broadcast-status-badge";
import { ChannelBadge } from "@/features/comms/components/channel-badge";
import { BroadcastActions } from "@/features/comms/components/broadcast-actions";
import { formatMoney } from "@/lib/money";

interface StaffRoleAudience {
  kind: "STAFF_ROLE";
  roleId: string;
}
interface ExplicitUserIdsAudience {
  kind: "EXPLICIT_USER_IDS";
  userIds: string[];
}

/**
 * `BroadcastResponseDto.audienceDef` is typed `unknown` at this layer
 * (`@ApiProperty({ type: Object })` server-side — `openapi-typescript` can't
 * infer a real shape from that, the same class of codegen gap
 * `templates.api.ts`'s own doc comment documents for `comm_template
 * .variables`). The real runtime shape is always ONE of `AudienceDefDto`'s
 * two real kinds (server-validated at create time by that DTO's own
 * `ValidateIf` rules) — this narrows it defensively rather than casting
 * blindly, so a genuinely malformed value degrades to "unknown audience"
 * instead of throwing.
 */
function parseAudienceDef(value: unknown): StaffRoleAudience | ExplicitUserIdsAudience | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  if (obj.kind === "STAFF_ROLE" && typeof obj.roleId === "string") {
    return { kind: "STAFF_ROLE", roleId: obj.roleId };
  }
  if (obj.kind === "EXPLICIT_USER_IDS" && Array.isArray(obj.userIds)) {
    return { kind: "EXPLICIT_USER_IDS", userIds: obj.userIds.filter((v): v is string => typeof v === "string") };
  }
  return null;
}

/** Resolves a `STAFF_ROLE` audience's `roleId` to its real role NAME via `useRoles()` (the same cross-feature reuse `audience-picker.tsx` already establishes) — never shows a raw uuid to an admin when a real name is available. */
function AudienceSummary({ broadcast }: { broadcast: BroadcastResponseDto }) {
  const t = useTranslations("communications.broadcasts.detail");
  const rolesQuery = useRoles();
  const audience = parseAudienceDef(broadcast.audienceDef);

  if (!audience) return <>{t("audienceUnknown")}</>;
  if (audience.kind === "STAFF_ROLE") {
    const roleName = rolesQuery.data?.find((r) => r.id === audience.roleId)?.name ?? audience.roleId;
    return <>{t("audienceStaffRole", { roleName })}</>;
  }
  return <>{t("audienceExplicitUsers", { count: audience.userIds.length })}</>;
}

/**
 * Phase 6 Slice 15 Part 2 — the Broadcast detail page: a header `Card`
 * (title/channel/status/body/audience/cost/recipient count) plus an actions
 * `Card` (`<BroadcastActions>`, the status-contextual submit/approve/cancel/
 * send cluster). Direct structural mirror of `app/(erp)/roles/[id]/page.tsx`
 * (back-to-list button + `<QueryBoundary>`-wrapped header `Card`) — read
 * first as the cited precedent. Unlike Roles' detail page, there is no edit
 * dialog here — a broadcast's own editable fields end at DRAFT (no
 * `UpdateBroadcastDto` exists at all, confirmed by reading
 * `BroadcastsController` directly: only create/list/get/submit-for-approval/
 * approve/cancel/send), so the whole page is read-only content plus the
 * action cluster, not a read/write split.
 */
export default function BroadcastDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("communications.broadcasts.detail");
  const broadcastQuery = useBroadcast(id);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/communications/broadcasts">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>

      <QueryBoundary query={broadcastQuery}>
        {(broadcast) => (
          <>
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                  <CardTitle className="text-base text-foreground">{broadcast.title}</CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <ChannelBadge channel={broadcast.channel} />
                    <BroadcastStatusBadge status={broadcast.status} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-foreground">{t("bodyLabel")}</p>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{broadcast.body}</p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">{t("audienceLabel")}</p>
                    <p className="text-sm text-muted-foreground">
                      <AudienceSummary broadcast={broadcast} />
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">{t("estCostLabel")}</p>
                    <p className="text-sm text-muted-foreground">{formatMoney(broadcast.estCostAmount)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">{t("recipientCountLabel")}</p>
                    <p className="text-sm text-muted-foreground">{broadcast.recipientCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base text-foreground">{t("actionsTitle")}</CardTitle>
                <CardDescription>{t("actionsDescription")}</CardDescription>
              </CardHeader>
              <CardContent>
                <BroadcastActions broadcast={broadcast} />
              </CardContent>
            </Card>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
