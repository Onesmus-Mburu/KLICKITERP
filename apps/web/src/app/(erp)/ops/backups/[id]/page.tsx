"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useBackupRun } from "@/features/backups-ops/hooks/use-backups";
import { BackupRunDetail } from "@/features/backups-ops/components/backup-run-detail";
import { VerifyRestoreDialog } from "@/features/backups-ops/components/verify-restore-dialog";

/**
 * Phase 6 Slice 25 (Backups/Ops, Module 20) — `GET /backups/:id`,
 * `backups:run:view`. One backup run's full detail (`<BackupRunDetail>`)
 * plus the restore-verify trigger (`<VerifyRestoreDialog>`,
 * `backups:restore:verify` — a genuinely separate, narrower permission, gated
 * client-side only on the run's own `status`, never on RBAC, matching this
 * codebase's own "coarse nav gate, granular in-screen gates, mutations fail
 * inline on a real 403" convention). Same `useParams<{id:string}>()` +
 * `<QueryBoundary>` shape `accounting/journals/[id]/page.tsx` already
 * established.
 */
export default function BackupRunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("backupsOps.detail");
  const runQuery = useBackupRun(id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/ops/backups">
            <ArrowLeft className="size-4" />
            {t("backToList")}
          </Link>
        </Button>
        {runQuery.data && <VerifyRestoreDialog runId={runQuery.data.id} runStatus={runQuery.data.status} />}
      </div>

      <QueryBoundary query={runQuery}>{(run) => <BackupRunDetail run={run} />}</QueryBoundary>
    </div>
  );
}
