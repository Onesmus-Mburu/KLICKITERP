import { Injectable, Logger } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { NotificationsService } from "../../../platform/comms";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { RptScheduleEntity, RptScheduleFormat } from "../domain/rpt-schedule.entity";
import { RptScheduleRepository } from "../infrastructure/rpt-schedule.repository";
import { ExportJobsService } from "./export-jobs.service";
import { ReportRegistryService } from "./report-registry.service";

export interface CreateScheduleInput {
  reportCode: string;
  params: Record<string, unknown>;
  cron: string;
  recipients: unknown;
  format: RptScheduleFormat;
  ownerUserId: string;
}

export interface UpdateScheduleInput {
  params?: Record<string, unknown>;
  cron?: string;
  recipients?: unknown;
  format?: RptScheduleFormat;
  isActive?: boolean;
}

export interface RunDueResult {
  scheduleId: string;
  reportCode: string;
  ok: boolean;
  exportJobId: string | null;
}

/**
 * `schedule_cron` due-date matching — replicates (does NOT import; see
 * `module-deps.json`'s `domains/reporting` note for why) the exact same
 * documented 5-field subset `domains/expenses`' `RecurringService` supports:
 * `"minute hour day-of-month month day-of-week"`, each field either `"*"`
 * or a single exact integer. `RecurringService` exports `computeNextRunOn()`
 * (a cursor-advancing "what's the NEXT matching date after X" function, for
 * `exp_recurring.next_run_on`'s stored-cursor design) but not the narrower
 * "does date D match this cron's day-of-month/month/day-of-week fields"
 * predicate this service actually needs — `rpt_schedule` carries no
 * `next_run_on` cursor column at all (only `cron`/`last_run_at`/`last_ok`),
 * so due-ness here is evaluated by directly matching `asOfDate` against the
 * cron fields on every `runDue()` call, not by walking a stored cursor
 * forward. `minute`/`hour` are validated for shape but (same as
 * `RecurringService`) never consulted — this system has no time-of-day
 * granularity for scheduled reports, only day-of-month/month/day-of-week.
 */
function validateCronShape(cronExpr: string): void {
  const fields = cronExpr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new ValidationException(
      `rpt_schedule.cron "${cronExpr}" must have exactly 5 space-separated fields (minute hour day-of-month month day-of-week) — ` +
        'only an exact integer or "*" per field is supported, no ranges/lists/steps',
    );
  }
  for (const field of fields) {
    if (field !== "*" && !/^\d+$/.test(field)) {
      throw new ValidationException(`rpt_schedule.cron field "${field}" must be "*" or an exact non-negative integer`);
    }
  }
}

function isDueOn(cronExpr: string, dateIso: string): boolean {
  const fields = cronExpr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const [, , domField, monthField, dowField] = fields;
  const matches = (field: string, value: number): boolean => field === "*" || Number(field) === value;
  const d = new Date(`${dateIso}T00:00:00Z`);
  return matches(domField, d.getUTCDate()) && matches(monthField, d.getUTCMonth() + 1) && matches(dowField, d.getUTCDay());
}

/**
 * `rpt_schedule` CRUD (FR-RPT-007.1: cron + params + recipients + format)
 * plus `runDue()` — a MANUAL trigger only, same documented gap as every
 * other cron-shaped placeholder in this codebase (no scheduler/worker
 * process exists anywhere — see `MvRefreshService`'s own doc comment for
 * the identical caveat). A real deployment needs an external cron/
 * systemd-timer/CI-scheduled-job hitting a `POST .../schedules/run-due`
 * endpoint.
 *
 * **Delivery is a real, best-effort attempt**, mirroring
 * `domains/procurement`'s own `PaymentVouchersService.attemptRemittanceAdvice()`
 * pattern exactly: `rpt_schedule.recipients` is opaque `jsonb` with no
 * documented shape from the foundation pass onward (see that entity's own
 * doc comment) — resolved here as an array of raw email-address strings
 * (the simplest well-defined shape reachable without adding a new
 * `platform/users` email-lookup call this pass didn't scope); any entry
 * that isn't a string containing `"@"` is skipped and logged, never thrown.
 * A schedule with zero resolvable recipients still runs (the export job is
 * still created) — delivery is a separate, independently-failable concern
 * from execution, same separation `PaymentVouchersService.execute()`
 * establishes between "the payment happened" and "the remittance email
 * sent."
 */
@Injectable()
export class ReportSchedulesService {
  private readonly logger = new Logger(ReportSchedulesService.name);

  constructor(
    private readonly scheduleRepository: RptScheduleRepository,
    private readonly registry: ReportRegistryService,
    private readonly exportJobsService: ExportJobsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(input: CreateScheduleInput): Promise<RptScheduleEntity> {
    this.registry.get(input.reportCode); // throws NotFoundException on an unknown report code
    validateCronShape(input.cron);
    return this.scheduleRepository.create({
      reportCode: input.reportCode,
      params: input.params,
      cron: input.cron,
      recipients: input.recipients,
      format: input.format,
      ownerUserId: input.ownerUserId,
      isActive: true,
      lastRunAt: null,
      lastOk: null,
      createdBy: input.ownerUserId,
      updatedBy: input.ownerUserId,
    });
  }

  async findByIdOrFail(id: string): Promise<RptScheduleEntity> {
    return this.scheduleRepository.findByIdOrFail(id);
  }

  async listByOwner(ownerUserId: string): Promise<RptScheduleEntity[]> {
    return this.scheduleRepository.listByOwner(ownerUserId);
  }

  async update(id: string, input: UpdateScheduleInput, actorId: string): Promise<RptScheduleEntity> {
    const row = await this.scheduleRepository.findByIdOrFail(id);
    if (input.params !== undefined) row.params = input.params;
    if (input.cron !== undefined) {
      validateCronShape(input.cron);
      row.cron = input.cron;
    }
    if (input.recipients !== undefined) row.recipients = input.recipients;
    if (input.format !== undefined) row.format = input.format;
    if (input.isActive !== undefined) row.isActive = input.isActive;
    row.updatedBy = actorId;
    return this.scheduleRepository.save(row);
  }

  async delete(id: string): Promise<void> {
    await this.scheduleRepository.findByIdOrFail(id);
    await this.scheduleRepository.delete(id);
  }

  /** Manual "run every due active schedule now" — see class doc comment. */
  async runDue(em: EntityManager, asOfDate: string): Promise<RunDueResult[]> {
    const active = await this.scheduleRepository.findActive(em);
    const results: RunDueResult[] = [];

    for (const schedule of active) {
      if (!isDueOn(schedule.cron, asOfDate)) continue;

      let ok = true;
      let exportJobId: string | null = null;
      try {
        const job = await this.exportJobsService.createJob(em, {
          reportCode: schedule.reportCode,
          params: schedule.params,
          format: schedule.format,
          requestedBy: schedule.ownerUserId,
        });
        exportJobId = job.id;
        await this.attemptDelivery(schedule, job.id);
      } catch (error) {
        ok = false;
        this.logger.warn(`Schedule ${schedule.id} (${schedule.reportCode}) run failed: ${(error as Error).message}`);
      }

      schedule.lastRunAt = new Date();
      schedule.lastOk = ok;
      await this.scheduleRepository.save(schedule, em);
      results.push({ scheduleId: schedule.id, reportCode: schedule.reportCode, ok, exportJobId });
    }

    return results;
  }

  /** Best-effort — see class doc comment "Delivery". Never throws; a failed/skipped delivery never fails `runDue()`. */
  private async attemptDelivery(schedule: RptScheduleEntity, exportJobId: string): Promise<void> {
    const recipients = Array.isArray(schedule.recipients)
      ? schedule.recipients.filter((r): r is string => typeof r === "string" && r.includes("@"))
      : [];

    if (recipients.length === 0) {
      this.logger.log(
        `Schedule ${schedule.id} (${schedule.reportCode}): no resolvable email recipients in rpt_schedule.recipients — delivery skipped (see ReportSchedulesService doc comment)`,
      );
      return;
    }

    for (const recipient of recipients) {
      try {
        await this.notificationsService.send({
          channel: "EMAIL",
          recipient,
          subject: `Scheduled report ready: ${schedule.reportCode}`,
          body: `Your scheduled report "${schedule.reportCode}" has run and its export job (${exportJobId}) is ready.`,
          entityType: "rpt_schedule",
          entityId: schedule.id,
        });
      } catch (error) {
        this.logger.warn(`Schedule ${schedule.id}: delivery to ${recipient} failed: ${(error as Error).message}`);
      }
    }
  }
}
