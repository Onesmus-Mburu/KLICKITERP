import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { ApprovalEngineService } from "../../../platform/approvals";
import { BillInvoiceEntity } from "../domain/bill-invoice.entity";
import { BillLateFeeBatchEntity } from "../domain/bill-late-fee-batch.entity";
import { BillLateFeePolicyEntity } from "../domain/bill-late-fee-policy.entity";
import { BillFeeCategoryRepository } from "../infrastructure/bill-fee-category.repository";
import { BillLateFeeBatchRepository } from "../infrastructure/bill-late-fee-batch.repository";
import { BillLateFeePolicyRepository } from "../infrastructure/bill-late-fee-policy.repository";
import { BillInvoiceRepository } from "../infrastructure/bill-invoice.repository";
import { InvoicingService } from "./invoicing.service";

/** `appr_workflow_def.domain_code` this module registers for late-fee-batch approval (`bill_late_fee_policy.requires_approval=true`). */
export const BILLING_LATE_FEE_APPROVAL_DOMAIN_CODE = "BILLING_LATE_FEE";

/** `bill_fee_category.name` the 0900 seed migration upserts for late-fee income — `post()`'s designated fee category (see class doc comment "post()"). Exported so the seed migration and this service never drift apart, same pattern as Branding's `INFONEY_DEFAULT_THEME_NAME`. */
export const LATE_FEE_INCOME_CATEGORY_NAME = "Late Fee Income";

interface LateFeeInvoiceBreakdown {
  invoiceId: string;
  daysOverdue: number;
  amount: string;
}

interface LateFeeBatchEntry {
  studentId: string;
  termId: string;
  amount: string;
  invoices: LateFeeInvoiceBreakdown[];
}

/** `bill_late_fee_batch.summary`'s jsonb shape — see class doc comment "runBatch()". */
export interface LateFeeBatchSummary {
  totalAssessed: string;
  studentCount: number;
  entries: LateFeeBatchEntry[];
}

/**
 * `bill_late_fee_batch` — one run of a `bill_late_fee_policy` across the
 * overdue population (FR-BILL-025.1/FR-BILL-026.1, the nightly late-fee job's
 * execution half; no scheduler/worker exists in this codebase to trigger it
 * automatically, same "config/engine exists, dispatcher doesn't" pattern as
 * `comm_trigger_binding`/`appr_level.sla_hours` — a controller action is this
 * pass's manual trigger).
 *
 * **`runBatch(policyId, runDate, initiatedBy)`** — note the 3-arg signature
 * (a documented, necessary deviation from the task brief's 2-arg
 * `runBatch(policyId, runDate)`, same shape as `FeeStructuresService.findApplicableFor()`'s
 * own documented signature deviation): `ApprovalEngineService.submit()`
 * requires a non-null `initiatorId`, and the batch row's own `created_by`/
 * `updated_by` audit columns need a real actor — a "nightly job" still runs
 * as SOME actor (a system/service-account user id, or whoever triggered it
 * manually via this pass's controller), so the caller supplies one.
 *
 * Algorithm: (1) resolve the overdue population via
 * `BillInvoiceRepository.findOverdueOpen(runDate - policy.graceDays)`
 * (`due_date < cutoff`, `balance > 0`, `status <> 'VOID'`); (2) for each
 * invoice, compute its charge per `policy.mode`
 * (`computeCharge()` — see `LateFeePoliciesService`'s doc comment for the
 * `params` shape per mode) using `daysOverdue = runDate - invoice.due_date`;
 * (3) aggregate into `LateFeeBatchSummary` — grouped by `(studentId, termId)`
 * rather than `studentId` alone (a necessary refinement of the task brief's
 * "per-student breakdown": `bill_invoice.term_id` is NOT NULL, so a student
 * with overdue invoices spanning two different terms needs two separate
 * late-fee invoices at `post()` time — one per term — each entry below is
 * still keyed primarily by student, just further split by term when needed);
 * (4) create the `bill_late_fee_batch` row `DRAFT` with this `summary`; (5) if
 * the batch total is zero (nothing overdue, or every computed charge was
 * zero), leave it `DRAFT` with an empty `summary` and return without
 * submitting for approval or posting — nothing to do; (6) else, if
 * `policy.requires_approval`, submit via `ApprovalEngineService.submit(em,
 * {domainCode: 'BILLING_LATE_FEE', amount: total, ...})`, `status =
 * 'PENDING_APPROVAL'`; (7) else, post immediately (`postInternal()`).
 *
 * **`post()` / `onApprovalDecided()`** — `BillLateFeeBatchStatus` has only
 * three values (`DRAFT`/`PENDING_APPROVAL`/`POSTED`, no distinct `APPROVED`
 * state, unlike `BillNoteStatus`), so `onApprovalDecided(approved=true)`
 * calls `postInternal()` directly from `PENDING_APPROVAL` (no intermediate
 * state to land on); `onApprovalDecided(approved=false)` reverts to `DRAFT`
 * (same "no REJECTED/CANCELLED value exists" reasoning
 * `CreditNotesService.onApprovalDecided()` documents). `post()` (the public
 * entry point PASS B's controller calls for the non-approval-required path,
 * and the same method `onApprovalDecided()` delegates to internally) accepts
 * a batch in EITHER `DRAFT` or `PENDING_APPROVAL` — both mean "not yet
 * posted" — and only rejects an already-`POSTED` batch.
 *
 * **`postInternal()` — P-05, reusing `InvoicingService`, same design as
 * `DebitNotesService.post()`.** For each `(studentId, termId)` entry in the
 * batch's `summary`, generates a small `ADHOC` invoice via
 * `InvoicingService.generateInvoice()` — ONE line, using the designated
 * late-fee-income `bill_fee_category` (`LATE_FEE_INCOME_CATEGORY_NAME`,
 * looked up by name; the 0900 seed migration upserts this category once,
 * reusing the already-seeded `4030 Other Income` `gl_account` rather than
 * minting a new GL leaf — see that migration's doc comment) — then
 * `.postInvoice()`s it, realizing P-05
 * (docs/phase-2/01-functional-requirements.md: "Late fee/interest applied |
 * Debit: AR–Student control | Credit: Late fee income") through the exact
 * same posting-map machinery `InvoicingService.postInvoice()` already
 * implements for P-01 — not a duplicated posting algorithm, same reasoning
 * `DebitNotesService.post()`'s doc comment gives for P-07. Marks the batch
 * `POSTED` once every entry's invoice has posted.
 */
@Injectable()
export class LateFeeBatchesService {
  constructor(
    private readonly batchRepository: BillLateFeeBatchRepository,
    private readonly policyRepository: BillLateFeePolicyRepository,
    private readonly invoiceRepository: BillInvoiceRepository,
    private readonly feeCategoryRepository: BillFeeCategoryRepository,
    private readonly invoicingService: InvoicingService,
    private readonly approvalEngine: ApprovalEngineService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async runBatch(policyId: string, runDate: string, initiatedBy: string): Promise<BillLateFeeBatchEntity> {
    return runInTransaction(this.dataSource, async (manager) => {
      const policy = await this.policyRepository.findByIdOrFail(policyId, manager);
      if (!policy.isActive) {
        throw new ValidationException(`bill_late_fee_policy ${policyId} is not active`);
      }

      const cutoffDate = subtractDays(runDate, policy.graceDays);
      const overdueInvoices = await this.invoiceRepository.findOverdueOpen(cutoffDate, manager);

      const buckets = new Map<string, LateFeeBatchEntry>();
      for (const invoice of overdueInvoices) {
        const daysOverdue = diffDays(runDate, invoice.dueDate);
        const charge = this.computeCharge(policy, invoice, daysOverdue);
        if (!charge.isPositive()) continue;

        const key = `${invoice.studentId}|${invoice.termId}`;
        const bucket = buckets.get(key) ?? {
          studentId: invoice.studentId,
          termId: invoice.termId,
          amount: Money.ZERO.toDecimalString(),
          invoices: [],
        };
        const newAmount = Money.fromDecimalString(bucket.amount).add(charge);
        bucket.amount = newAmount.toDecimalString();
        bucket.invoices.push({ invoiceId: invoice.id, daysOverdue, amount: charge.toDecimalString() });
        buckets.set(key, bucket);
      }

      const entries = [...buckets.values()];
      const total = entries.reduce((sum, entry) => sum.add(Money.fromDecimalString(entry.amount)), Money.ZERO);
      const studentIds = new Set(entries.map((entry) => entry.studentId));
      const summary: LateFeeBatchSummary = {
        totalAssessed: total.toDecimalString(),
        studentCount: studentIds.size,
        entries,
      };

      let batch = await this.batchRepository.create(
        {
          policyId,
          runDate,
          status: "DRAFT",
          approvalRef: null,
          summary: summary as unknown as Record<string, unknown>,
          createdBy: initiatedBy,
          updatedBy: initiatedBy,
        },
        manager,
      );

      if (!total.isPositive()) {
        return batch;
      }

      if (policy.requiresApproval) {
        const instance = await this.approvalEngine.submit(manager, {
          domainCode: BILLING_LATE_FEE_APPROVAL_DOMAIN_CODE,
          entityType: "bill_late_fee_batch",
          entityId: batch.id,
          amount: total,
          initiatorId: initiatedBy,
        });
        batch.status = "PENDING_APPROVAL";
        batch.approvalRef = instance.id;
        batch.updatedBy = initiatedBy;
        batch = await this.batchRepository.save(batch, manager);
        return batch;
      }

      return this.postInternal(manager, batch, initiatedBy);
    });
  }

  async findByIdOrFail(id: string): Promise<BillLateFeeBatchEntity> {
    return this.batchRepository.findByIdOrFail(id);
  }

  async listByPolicy(policyId: string): Promise<BillLateFeeBatchEntity[]> {
    return this.batchRepository.listByPolicy(policyId);
  }

  /** See class doc comment "post()/onApprovalDecided()". */
  async post(em: EntityManager, batchId: string, postedBy: string): Promise<BillLateFeeBatchEntity> {
    const batch = await this.batchRepository.findByIdOrFail(batchId, em);
    if (batch.status === "POSTED") {
      throw new ValidationException(`bill_late_fee_batch ${batchId} is already POSTED`);
    }
    return this.postInternal(em, batch, postedBy);
  }

  async onApprovalDecided(batchId: string, approved: boolean, actorId: string): Promise<BillLateFeeBatchEntity> {
    return runInTransaction(this.dataSource, async (manager) => {
      const batch = await this.batchRepository.findByIdOrFail(batchId, manager);
      if (batch.status !== "PENDING_APPROVAL") {
        throw new ValidationException(`bill_late_fee_batch ${batchId} is not PENDING_APPROVAL (status=${batch.status})`);
      }
      if (!approved) {
        batch.status = "DRAFT";
        batch.updatedBy = actorId;
        return this.batchRepository.save(batch, manager);
      }
      return this.postInternal(manager, batch, actorId);
    });
  }

  private async postInternal(
    em: EntityManager,
    batch: BillLateFeeBatchEntity,
    postedBy: string,
  ): Promise<BillLateFeeBatchEntity> {
    const summary = batch.summary as unknown as LateFeeBatchSummary;
    const category = await this.feeCategoryRepository.findByName(LATE_FEE_INCOME_CATEGORY_NAME, em);
    if (!category) {
      throw new NotFoundException(
        "BillFeeCategory",
        `${LATE_FEE_INCOME_CATEGORY_NAME} — expected the 0900 seed migration to have upserted it`,
      );
    }

    for (const entry of summary.entries ?? []) {
      const invoice = await this.invoicingService.generateInvoice(em, {
        studentId: entry.studentId,
        termId: entry.termId,
        source: "ADHOC",
        adhocLines: [
          {
            feeCategoryId: category.id,
            description: `Late fee (batch ${batch.id})`,
            amount: Money.fromDecimalString(entry.amount),
          },
        ],
        issueDate: batch.runDate,
        createdBy: postedBy,
      });
      await this.invoicingService.postInvoice(em, invoice.id, postedBy);
    }

    batch.status = "POSTED";
    batch.updatedBy = postedBy;
    return this.batchRepository.save(batch, em);
  }

  /** See `LateFeePoliciesService`'s doc comment for `params`' per-mode shape. */
  private computeCharge(policy: BillLateFeePolicyEntity, invoice: BillInvoiceEntity, daysOverdue: number): Money {
    const params = policy.params as Record<string, unknown>;
    switch (policy.mode) {
      case "FLAT": {
        const amount = params.amount;
        if (typeof amount !== "string") {
          throw new ValidationException(`bill_late_fee_policy ${policy.id} (FLAT) requires params.amount as a decimal string`);
        }
        return Money.fromDecimalString(amount);
      }
      case "PERCENT": {
        const rate = params.rate;
        if (typeof rate !== "string") {
          throw new ValidationException(`bill_late_fee_policy ${policy.id} (PERCENT) requires params.rate as a decimal string`);
        }
        return invoice.balance.multiply(rate);
      }
      case "TIERED": {
        const tiers = Array.isArray(params.tiers) ? (params.tiers as Array<Record<string, unknown>>) : [];
        const tier = tiers.find((candidate) => {
          const min = typeof candidate.minDaysOverdue === "number" ? candidate.minDaysOverdue : 0;
          const max = typeof candidate.maxDaysOverdue === "number" ? candidate.maxDaysOverdue : Number.POSITIVE_INFINITY;
          return daysOverdue >= min && daysOverdue <= max;
        });
        if (!tier) return Money.ZERO;
        if (typeof tier.amount === "string") return Money.fromDecimalString(tier.amount);
        if (typeof tier.rate === "string") return invoice.balance.multiply(tier.rate);
        return Money.ZERO;
      }
      default:
        return Money.ZERO;
    }
  }
}

/** `dateStr` minus `days` calendar days, `YYYY-MM-DD` in, `YYYY-MM-DD` out (UTC). */
function subtractDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/** Whole calendar days between `dueDate` and `runDate` (`runDate - dueDate`), both `YYYY-MM-DD`. */
function diffDays(runDate: string, dueDate: string): number {
  const runMs = Date.parse(`${runDate}T00:00:00Z`);
  const dueMs = Date.parse(`${dueDate}T00:00:00Z`);
  return Math.floor((runMs - dueMs) / 86_400_000);
}
