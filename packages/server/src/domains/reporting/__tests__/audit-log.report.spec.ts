import { AuditLogReport } from "../application/audit-log.report";
import { AuditLogRepository } from "../infrastructure/audit-log.repository";
import type { AuditLogEntity } from "../../../shared/audit/audit-log.entity";

function entry(overrides: Partial<AuditLogEntity>): AuditLogEntity {
  return {
    id: "log-1",
    seq: "1",
    actorId: "user-1",
    actorLabel: "Jane Admin",
    entityType: "bill_invoice",
    entityId: "inv-1",
    action: "UPDATE",
    before: null,
    after: null,
    ip: "10.0.0.1",
    sessionId: null,
    at: new Date("2026-01-05T10:00:00Z"),
    prevHash: null,
    hash: "hash1",
    ...overrides,
  } as AuditLogEntity;
}

describe("AuditLogReport", () => {
  let auditLogRepository: { search: jest.Mock };
  let report: AuditLogReport;

  beforeEach(() => {
    auditLogRepository = { search: jest.fn(async () => []) };
    report = new AuditLogReport(auditLogRepository as unknown as AuditLogRepository);
  });

  it("maps audit_log entries to rows and passes filters through to the repository", async () => {
    auditLogRepository.search.mockResolvedValue([entry({}), entry({ id: "log-2", seq: "2", action: "DELETE" })]);

    const result = await report.execute({
      entityType: "bill_invoice",
      fromDate: "2026-01-01",
      toDate: "2026-01-31",
    });

    expect(result.rows).toHaveLength(2);
    expect((result.rows[1] as { action: string }).action).toBe("DELETE");
    const totals = result.totals as { count: number };
    expect(totals.count).toBe(2);

    expect(auditLogRepository.search).toHaveBeenCalledWith({
      entityType: "bill_invoice",
      entityId: undefined,
      actorId: undefined,
      fromDate: "2026-01-01",
      toDate: "2026-01-31",
    });
  });

  it("returns an empty result with count 0 when nothing matches", async () => {
    const result = await report.execute({ fromDate: "2026-01-01", toDate: "2026-01-31" });
    expect(result.rows).toEqual([]);
    expect((result.totals as { count: number }).count).toBe(0);
  });
});
