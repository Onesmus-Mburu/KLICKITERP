import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { Money } from "../../../shared/money/money";
import { ExpRecurringEntity } from "../domain/exp-recurring.entity";
import { ExpVoucherEntity, ExpVoucherMethod, ExpVoucherPayeeType } from "../domain/exp-voucher.entity";
import { ExpCategoryRepository } from "../infrastructure/exp-category.repository";
import { ExpRecurringRepository } from "../infrastructure/exp-recurring.repository";
import { ExpVoucherRepository } from "../infrastructure/exp-voucher.repository";

/**
 * `exp_recurring.template` jsonb shape — everything `ExpVoucherEntity` needs
 * minus the fields only assignable at materialization time
 * (`number`/`status`/`approval_ref`/`journal_id`), per that entity's own doc
 * comment.
 */
export interface RecurringVoucherTemplate {
  payeeType: ExpVoucherPayeeType;
  payeeRef: Record<string, unknown>;
  categoryId: string;
  costCenterId?: string | null;
  /** Decimal string — `template` is opaque jsonb, so `Money` isn't stored directly. */
  amount: string;
  method: ExpVoucherMethod;
  narrative: string;
}

export interface CreateRecurringInput {
  template: RecurringVoucherTemplate;
  scheduleCron: string;
  nextRunOn: string;
}

export interface RunDueResult {
  recurringId: string;
  voucherId: string;
  nextRunOn: string;
}

/**
 * CRUD for `exp_recurring` plus `runDue()` — a MANUAL trigger only (task
 * brief's own instruction: "no scheduler/worker exists anywhere in this
 * codebase", confirmed true for every prior module too —
 * `docs/phase-5/PROGRESS.md`'s environment status/Communications module's
 * design notes both document the same gap). A real deployment would need an
 * external cron/systemd-timer/CI-scheduled-job hitting
 * `POST /expenses/recurring/run-due` — out of this pass's scope, same
 * "detection logic exists, dispatcher doesn't" pattern as `WalletTransactionsService.
 * reconcile()`/`comm_trigger_binding`.
 *
 * **`schedule_cron` next-run-date approach** — a REAL, correct (for its
 * supported subset) 5-field cron evaluator, not a half-implemented one:
 * `"minute hour day-of-month month day-of-week"`, where each of the 5
 * fields must be either `"*"` or a single exact integer (no ranges/lists/
 * steps/named values). `minute`/`hour` are validated for shape but never
 * consulted — `next_run_on` is a plain `date` column with no time-of-day
 * component (per `ExpRecurringEntity`'s own doc comment), so only
 * `day-of-month`/`month`/`day-of-week` matter for computing the next date.
 * `computeNextRunOn()` walks forward day-by-day (capped at 366 days) from
 * the day after `fromDate`, returning the first date whose UTC
 * day-of-month/month/day-of-week all match. This correctly and exactly
 * supports the two patterns the task brief names as this system's real
 * use case — MONTHLY (`"0 0 1 * *"` = the 1st of every month) and WEEKLY
 * (`"0 0 * * 1"` = every Monday) — plus any other exact-day/exact-month/
 * exact-weekday combination, without pretending to support the full cron
 * grammar (ranges like `1-5`, lists like `1,15`, step expressions) that
 * this system has no documented need for; an out-of-shape expression is a
 * clear `ValidationException`, never a silent misinterpretation.
 */
@Injectable()
export class RecurringService {
  constructor(
    private readonly recurringRepository: ExpRecurringRepository,
    private readonly categoryRepository: ExpCategoryRepository,
    private readonly voucherRepository: ExpVoucherRepository,
  ) {}

  async create(input: CreateRecurringInput, actorId: string | null): Promise<ExpRecurringEntity> {
    validateTemplate(input.template);
    validateCronShape(input.scheduleCron);
    await this.categoryRepository.findByIdOrFail(input.template.categoryId);

    return this.recurringRepository.create({
      template: input.template as unknown as Record<string, unknown>,
      scheduleCron: input.scheduleCron,
      nextRunOn: input.nextRunOn,
      lastVoucherId: null,
      isActive: true,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async findByIdOrFail(id: string): Promise<ExpRecurringEntity> {
    return this.recurringRepository.findByIdOrFail(id);
  }

  async list(): Promise<ExpRecurringEntity[]> {
    return this.recurringRepository.listAll();
  }

  async update(
    id: string,
    changes: Partial<CreateRecurringInput> & { isActive?: boolean },
    actorId: string | null,
  ): Promise<ExpRecurringEntity> {
    const row = await this.recurringRepository.findByIdOrFail(id);
    if (changes.template !== undefined) {
      validateTemplate(changes.template);
      await this.categoryRepository.findByIdOrFail(changes.template.categoryId);
      row.template = changes.template as unknown as Record<string, unknown>;
    }
    if (changes.scheduleCron !== undefined) {
      validateCronShape(changes.scheduleCron);
      row.scheduleCron = changes.scheduleCron;
    }
    if (changes.nextRunOn !== undefined) row.nextRunOn = changes.nextRunOn;
    if (changes.isActive !== undefined) row.isActive = changes.isActive;
    row.updatedBy = actorId;
    return this.recurringRepository.save(row);
  }

  /** Manual "run due templates now" — see class doc comment. */
  async runDue(em: EntityManager, asOfDate: string, actorId: string): Promise<RunDueResult[]> {
    const due = await this.recurringRepository.findDueForRun(asOfDate, em);
    const results: RunDueResult[] = [];

    for (const row of due) {
      const template = row.template as unknown as RecurringVoucherTemplate;
      const voucherId = generateUuidV7();
      const voucher: Partial<ExpVoucherEntity> = {
        id: voucherId,
        // `number varchar(30)` (migration 0120) can't hold "DRAFT-" (6) + a full UUID (36) = 42
        // chars — truncate the hyphen-stripped UUID to fit.
        number: `DRAFT-${voucherId.replace(/-/g, "").slice(0, 24)}`,
        payeeType: template.payeeType,
        payeeRef: template.payeeRef,
        categoryId: template.categoryId,
        costCenterId: template.costCenterId ?? null,
        amount: Money.fromDecimalString(template.amount),
        method: template.method,
        narrative: `${template.narrative} (recurring, ${row.id})`,
        status: "DRAFT",
        approvalRef: null,
        journalId: null,
        createdBy: actorId,
        updatedBy: actorId,
      };
      const created = await this.voucherRepository.create(voucher, em);

      row.lastVoucherId = created.id;
      row.nextRunOn = computeNextRunOn(asOfDate, row.scheduleCron);
      row.updatedBy = actorId;
      await this.recurringRepository.save(row, em);

      results.push({ recurringId: row.id, voucherId: created.id, nextRunOn: row.nextRunOn });
    }

    return results;
  }
}

function validateTemplate(template: RecurringVoucherTemplate): void {
  if (!template.categoryId || !template.payeeType || !template.method || !template.narrative) {
    throw new ValidationException("exp_recurring.template must include payeeType, payeeRef, categoryId, method, narrative");
  }
  if (!Money.fromDecimalString(template.amount).isPositive()) {
    throw new ValidationException("exp_recurring.template.amount must be a positive decimal string");
  }
}

/** See class doc comment "schedule_cron next-run-date approach". */
function validateCronShape(cronExpr: string): void {
  const fields = cronExpr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new ValidationException(
      `schedule_cron "${cronExpr}" must have exactly 5 space-separated fields (minute hour day-of-month month day-of-week) — ` +
        "only an exact integer or \"*\" per field is supported, no ranges/lists/steps",
    );
  }
  for (const field of fields) {
    if (field !== "*" && !/^\d+$/.test(field)) {
      throw new ValidationException(`schedule_cron field "${field}" must be "*" or an exact non-negative integer`);
    }
  }
}

/** See class doc comment "schedule_cron next-run-date approach". */
export function computeNextRunOn(fromDateIso: string, cronExpr: string): string {
  validateCronShape(cronExpr);
  const [, , domField, monthField, dowField] = cronExpr.trim().split(/\s+/);
  const matches = (field: string, value: number): boolean => field === "*" || Number(field) === value;

  let candidate = addUtcDays(fromDateIso, 1);
  for (let i = 0; i < 366; i++) {
    const d = new Date(`${candidate}T00:00:00Z`);
    const dom = d.getUTCDate();
    const month = d.getUTCMonth() + 1;
    const dow = d.getUTCDay();
    if (matches(domField, dom) && matches(monthField, month) && matches(dowField, dow)) {
      return candidate;
    }
    candidate = addUtcDays(candidate, 1);
  }
  throw new ValidationException(`schedule_cron "${cronExpr}" matched no date within 366 days of ${fromDateIso}`);
}

function addUtcDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
