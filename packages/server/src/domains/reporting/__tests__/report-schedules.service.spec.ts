import { EntityManager } from "typeorm";
import { ReportSchedulesService } from "../application/report-schedules.service";
import { ReportRegistryService, ReportDefinition } from "../application/report-registry.service";
import { RptScheduleRepository } from "../infrastructure/rpt-schedule.repository";
import { ExportJobsService } from "../application/export-jobs.service";
import { RptScheduleEntity } from "../domain/rpt-schedule.entity";
import type { NotificationsService } from "../../../platform/comms";

const FAKE_REPORT: ReportDefinition = {
  code: "fake-report",
  name: "Fake Report",
  domain: "test",
  permissionCode: "reports:fake-report:view",
  paramsShape: {},
  columns: [],
  execute: jest.fn(async () => ({ rows: [], totals: {}, generatedAt: new Date() })),
};

function schedule(overrides: Partial<RptScheduleEntity>): RptScheduleEntity {
  return {
    id: "sched-1",
    reportCode: "fake-report",
    params: {},
    cron: "0 0 * * *", // every day
    recipients: ["finance@school.example"],
    format: "CSV",
    ownerUserId: "owner-1",
    isActive: true,
    lastRunAt: null,
    lastOk: null,
    ...overrides,
  } as RptScheduleEntity;
}

describe("ReportSchedulesService.runDue", () => {
  let registry: ReportRegistryService;
  let scheduleRepository: { findActive: jest.Mock; save: jest.Mock };
  let exportJobsService: { createJob: jest.Mock };
  let notificationsService: { send: jest.Mock };
  let service: ReportSchedulesService;
  const em = {} as EntityManager;

  beforeEach(() => {
    registry = new ReportRegistryService();
    registry.register(FAKE_REPORT);
    scheduleRepository = {
      findActive: jest.fn(async () => []),
      save: jest.fn(async (entity: RptScheduleEntity) => entity),
    };
    exportJobsService = { createJob: jest.fn(async () => ({ id: "job-1" })) };
    notificationsService = { send: jest.fn(async () => ({ status: "SENT" })) };
    service = new ReportSchedulesService(
      scheduleRepository as unknown as RptScheduleRepository,
      registry,
      exportJobsService as unknown as ExportJobsService,
      notificationsService as unknown as NotificationsService,
    );
  });

  it("runs a schedule whose cron matches today's date and delivers to email-shaped recipients", async () => {
    scheduleRepository.findActive.mockResolvedValue([schedule({})]);

    const results = await service.runDue(em, "2026-07-20"); // "0 0 * * *" matches every date

    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    expect(results[0].exportJobId).toBe("job-1");
    expect(exportJobsService.createJob).toHaveBeenCalledWith(em, {
      reportCode: "fake-report",
      params: {},
      format: "CSV",
      requestedBy: "owner-1",
    });
    expect(notificationsService.send).toHaveBeenCalledTimes(1);
    expect(notificationsService.send.mock.calls[0][0].recipient).toBe("finance@school.example");

    const saved = scheduleRepository.save.mock.calls[0][0] as RptScheduleEntity;
    expect(saved.lastOk).toBe(true);
    expect(saved.lastRunAt).toBeInstanceOf(Date);
  });

  it("skips a schedule whose cron does not match the given date", async () => {
    // day-of-month = 1 only -> not due on the 20th.
    scheduleRepository.findActive.mockResolvedValue([schedule({ cron: "0 0 1 * *" })]);

    const results = await service.runDue(em, "2026-07-20");

    expect(results).toEqual([]);
    expect(exportJobsService.createJob).not.toHaveBeenCalled();
    expect(scheduleRepository.save).not.toHaveBeenCalled();
  });

  it("records ok=false and never throws when export job creation fails", async () => {
    exportJobsService.createJob.mockRejectedValue(new Error("execution failed"));
    scheduleRepository.findActive.mockResolvedValue([schedule({})]);

    const results = await service.runDue(em, "2026-07-20");

    expect(results[0].ok).toBe(false);
    expect(results[0].exportJobId).toBeNull();
    const saved = scheduleRepository.save.mock.calls[0][0] as RptScheduleEntity;
    expect(saved.lastOk).toBe(false);
  });

  it("skips delivery (but still runs) when recipients has no email-shaped entries", async () => {
    scheduleRepository.findActive.mockResolvedValue([schedule({ recipients: ["not-an-email", 123] })]);

    const results = await service.runDue(em, "2026-07-20");

    expect(results[0].ok).toBe(true);
    expect(notificationsService.send).not.toHaveBeenCalled();
  });

  it("never fails the whole run when NotificationsService.send() throws for one recipient", async () => {
    notificationsService.send.mockRejectedValue(new Error("smtp down"));
    scheduleRepository.findActive.mockResolvedValue([schedule({})]);

    const results = await service.runDue(em, "2026-07-20");

    expect(results[0].ok).toBe(true); // delivery failure doesn't fail the schedule run itself
  });
});
