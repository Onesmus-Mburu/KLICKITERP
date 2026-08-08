import { Injectable } from "@nestjs/common";
import { AuditLogRepository } from "../infrastructure/audit-log.repository";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export interface AuditLogReportParams {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  fromDate: string;
  toDate: string;
}

/**
 * A filtered listing over `audit.audit_log` (FR-AUD-002's hash-chained
 * append-only trail), via the new `AuditLogRepository` this pass adds
 * (`infrastructure/audit-log.repository.ts`).
 *
 * **Distinctly privileged permission code** — `reports:audit-log:view`
 * (never bundled with plain `reports:*:view` access) — because audit
 * visibility is genuinely sensitive: it exposes WHO changed WHAT, across
 * every module, including `before`/`after` diffs. This mirrors this
 * codebase's own established payroll-data-sensitivity precedent
 * (`EmployeesController`'s `payroll:employee:manage`-gated decrypted-fields
 * endpoint, kept separate from the ordinary `payroll:employee:view` read) —
 * a distinct code so a role can be granted ordinary report access WITHOUT
 * also granting audit-trail visibility.
 */
@Injectable()
export class AuditLogReport implements ReportDefinition<AuditLogReportParams> {
  readonly code = "audit-log";
  readonly name = "Audit Log";
  readonly domain = "audit";
  readonly permissionCode = "reports:audit-log:view";
  readonly paramsShape = {
    entityType: "string",
    entityId: "uuid",
    actorId: "uuid",
    fromDate: "date",
    toDate: "date",
  } as const;
  readonly columns: ReportColumnDef[] = [
    { key: "at", label: "Timestamp", type: "date" },
    { key: "actorLabel", label: "Actor", type: "string" },
    { key: "entityType", label: "Entity Type", type: "string" },
    { key: "entityId", label: "Entity Id", type: "string" },
    { key: "action", label: "Action", type: "string" },
    { key: "ip", label: "IP", type: "string" },
  ];

  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  async execute(params: AuditLogReportParams): Promise<ReportResult> {
    const entries = await this.auditLogRepository.search({
      entityType: params.entityType,
      entityId: params.entityId,
      actorId: params.actorId,
      fromDate: params.fromDate,
      toDate: params.toDate,
    });

    const rows = entries.map((entry) => ({
      seq: entry.seq,
      at: entry.at,
      actorId: entry.actorId,
      actorLabel: entry.actorLabel,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      ip: entry.ip,
    }));

    return {
      rows,
      totals: { count: rows.length },
      generatedAt: new Date(),
    };
  }
}
