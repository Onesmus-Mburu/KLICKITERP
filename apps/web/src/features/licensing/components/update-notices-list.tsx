"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { UpdateNoticeDecision, UpdateNoticeEntity, UpdateNoticeUrgency } from "../api/license.api";

const URGENCY_VARIANT: Record<UpdateNoticeUrgency, "soft-destructive" | "soft-secondary"> = {
  SECURITY: "soft-destructive",
  NORMAL: "soft-secondary",
};

const DECISION_VARIANT: Record<UpdateNoticeDecision, "soft-warning" | "soft-primary" | "soft-success" | "soft-destructive"> = {
  PENDING: "soft-warning",
  SCHEDULED: "soft-primary",
  APPLIED: "soft-success",
  DECLINED: "soft-destructive",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

/**
 * Read-only, deliberately — a real `UpdateNoticesService.decide()` exists and
 * is unit-tested server-side (`PENDING -> SCHEDULED/DECLINED`, `SCHEDULED ->
 * APPLIED/DECLINED`) but has NO HTTP route anywhere in this codebase
 * (confirmed by reading `LicenseStatusController`/`LicenseApiController`
 * directly — only this one `GET` route is reachable). No decide/schedule/
 * decline UI affordance is built here; there is nowhere for that click to
 * go. `notAvailableNote` states this plainly rather than silently omitting
 * any explanation.
 */
export function UpdateNoticesList({ notices }: { notices: UpdateNoticeEntity[] }) {
  const t = useTranslations("license.updateNotices");

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("notAvailableNote")}</p>
      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.releaseVersion")}</TableHead>
              <TableHead>{t("columns.urgency")}</TableHead>
              <TableHead>{t("columns.notes")}</TableHead>
              <TableHead>{t("columns.mandatoryBy")}</TableHead>
              <TableHead>{t("columns.receivedAt")}</TableHead>
              <TableHead>{t("columns.decision")}</TableHead>
              <TableHead>{t("columns.appliedAt")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {notices.map((notice) => (
              <TableRow key={notice.id}>
                <TableCell className="font-medium">{notice.releaseVersion}</TableCell>
                <TableCell>
                  <Badge variant={URGENCY_VARIANT[notice.urgency]}>{t(`urgencies.${notice.urgency}`)}</Badge>
                </TableCell>
                <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={notice.notes}>
                  {notice.notes}
                </TableCell>
                <TableCell>{formatDate(notice.mandatoryBy)}</TableCell>
                <TableCell>{new Date(notice.receivedAt).toLocaleString()}</TableCell>
                <TableCell>
                  <Badge variant={DECISION_VARIANT[notice.decision]}>{t(`decisions.${notice.decision}`)}</Badge>
                </TableCell>
                <TableCell>{notice.appliedAt ? new Date(notice.appliedAt).toLocaleString() : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
