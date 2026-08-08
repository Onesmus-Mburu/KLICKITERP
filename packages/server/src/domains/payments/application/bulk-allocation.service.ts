import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { StdStudentRepository } from "../../students";
import { PayBulkAllocationBatchEntity } from "../domain/pay-bulk-allocation-batch.entity";
import { PayBulkAllocationBatchLineEntity } from "../domain/pay-bulk-allocation-batch-line.entity";
import { PayBulkAllocationBatchRepository } from "../infrastructure/pay-bulk-allocation-batch.repository";
import { PayBulkAllocationBatchLineRepository } from "../infrastructure/pay-bulk-allocation-batch-line.repository";
import { PaySuspenseItemRepository } from "../infrastructure/pay-suspense-item.repository";
import { ReceiptsService } from "./receipts.service";

export interface CreateBulkAllocationLineInput {
  admissionNo: string;
  amount: Money;
}

/**
 * Bulk bank-statement / M-Pesa bulk-payment allocation (Module 10 PASS B).
 *
 * **`createBatch()`** — the task brief describes line-level "student
 * resolution deferred to matching", but `pay_bulk_allocation_batch_line.student_id`
 * is a real NOT NULL FK to `std_student` (no "unresolved" placeholder exists
 * in the DDL — see that entity's own doc comment). A documented, necessary
 * deviation: `admission_no -> student_id` resolution happens synchronously
 * HERE, at batch-creation time, not later at `matchAndPost()` time — any
 * admission number that doesn't resolve to a student is rejected up front
 * with a clear error listing every offending value, rather than silently
 * dropped or given a fabricated id. "Deferred to matching" instead describes
 * whether a RECEIPT gets created for each line (that part genuinely is
 * `matchAndPost()`'s job). `bankAccountId` (a real FK, migration `0220`,
 * Phase 6 Slice 7) is likewise collected up front, ONE real bank account for
 * the whole batch — every line is captured as a `BANK_TRANSFER` split
 * against it. This closes a real, verification-blocking bug found live in
 * Slice 6: `matchAndPost()` previously fabricated a non-UUID
 * `bulk-batch-${batchId}` placeholder string for this exact field, which
 * failed every capture attempt outright against
 * `pay_receipt_split.bank_account_id`'s real `uuid` FK.
 *
 * **`matchAndPost()`** — for each unprocessed line (`receipt_id IS NULL`,
 * safe to re-run), captures a receipt inside its OWN transaction (partial-
 * failure-tolerant, same pattern `PromotionService.promoteBatch()`/
 * `BulkBillingService.bulkGenerate()` establish) via
 * `ReceiptsService.captureReceipt()`. A per-line failure (e.g. a GL
 * configuration error, not a student-resolution one — that already happened
 * at `createBatch()` time) does not abort the batch; the line's amount is
 * instead parked as a `pay_suspense_item` (`source='BANK'`) so the money is
 * never lost track of (BR-PAY-07's "never silently write off" spirit,
 * applied here even though this isn't a C2B suspense case) — a documented
 * judgement call, not mandated by the task brief but consistent with this
 * module's own suspense discipline. Final `status` is `COMPLETED` only if
 * every line got a receipt; `FAILED` if any line fell through to suspense.
 */
@Injectable()
export class BulkAllocationService {
  constructor(
    private readonly batchRepository: PayBulkAllocationBatchRepository,
    private readonly lineRepository: PayBulkAllocationBatchLineRepository,
    private readonly studentRepository: StdStudentRepository,
    private readonly suspenseRepository: PaySuspenseItemRepository,
    private readonly receiptsService: ReceiptsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async createBatch(
    instrument: Record<string, unknown>,
    lines: CreateBulkAllocationLineInput[],
    bankAccountId: string,
    initiatedBy: string,
  ): Promise<PayBulkAllocationBatchEntity> {
    if (lines.length === 0) {
      throw new ValidationException("BulkAllocationService.createBatch: at least one line is required");
    }
    for (const line of lines) {
      if (!line.amount.isPositive()) {
        throw new ValidationException(`BulkAllocationService.createBatch: line amount for ${line.admissionNo} must be positive`);
      }
    }
    const total = lines.reduce((sum, line) => sum.add(line.amount), Money.ZERO);

    return runInTransaction(this.dataSource, async (manager) => {
      const resolved: Array<{ studentId: string; amount: Money }> = [];
      const unresolved: string[] = [];
      for (const line of lines) {
        const student = await this.studentRepository.findByAdmissionNo(line.admissionNo, manager);
        if (!student) {
          unresolved.push(line.admissionNo);
          continue;
        }
        resolved.push({ studentId: student.id, amount: line.amount });
      }
      if (unresolved.length > 0) {
        throw new ValidationException(
          `BulkAllocationService.createBatch: could not resolve admission_no(s) to a student — ${unresolved.join(", ")} ` +
            "(pay_bulk_allocation_batch_line.student_id is NOT NULL; fix the input and resubmit)",
        );
      }

      const batch = await this.batchRepository.create(
        { instrument, total, bankAccountId, status: "DRAFT", createdReceipts: 0, createdBy: initiatedBy, updatedBy: initiatedBy },
        manager,
      );
      for (const line of resolved) {
        await this.lineRepository.create(
          { batchId: batch.id, studentId: line.studentId, amount: line.amount, receiptId: null },
          manager,
        );
      }
      return batch;
    });
  }

  async findByIdOrFail(id: string): Promise<PayBulkAllocationBatchEntity> {
    return this.batchRepository.findByIdOrFail(id);
  }

  async listLines(batchId: string): Promise<PayBulkAllocationBatchLineEntity[]> {
    return this.lineRepository.listByBatch(batchId);
  }

  async matchAndPost(batchId: string, initiatedBy: string): Promise<PayBulkAllocationBatchEntity> {
    let batch = await this.batchRepository.findByIdOrFail(batchId);
    if (batch.status !== "DRAFT" && batch.status !== "MATCHING") {
      throw new ValidationException(`pay_bulk_allocation_batch ${batchId} is not DRAFT/MATCHING (status=${batch.status})`);
    }
    batch.status = "MATCHING";
    batch.updatedBy = initiatedBy;
    batch = await this.batchRepository.save(batch);

    const lines = await this.lineRepository.listByBatch(batchId);
    let createdCount = 0;
    let anyFailure = false;

    for (const line of lines) {
      if (line.receiptId) {
        createdCount++;
        continue;
      }
      try {
        await runInTransaction(this.dataSource, async (manager) => {
          const student = await this.studentRepository.findByIdOrFail(line.studentId, manager);
          const receipt = await this.receiptsService.captureReceipt(manager, {
            studentId: line.studentId,
            payerName: `${student.firstName} ${student.lastName}`,
            receiptDate: new Date().toISOString().slice(0, 10),
            total: line.amount,
            splits: [
              {
                method: "BANK_TRANSFER",
                amount: line.amount,
                // Real FK (batch.bankAccountId, migration 0220) — was
                // previously a fabricated `bulk-batch-${batchId}` non-UUID
                // string that failed every capture outright against
                // pay_receipt_split.bank_account_id's real uuid FK. See
                // PayBulkAllocationBatchEntity's class doc comment.
                bankAccountId: batch.bankAccountId,
                // line.id alone (a globally-unique UUID, 36 chars) — was
                // previously `bulk-batch-${batchId}-line-${line.id}` (~89
                // chars), which exceeded pay_receipt_split.external_ref's
                // real varchar(60) limit.
                externalRef: line.id,
              },
            ],
            cashierId: initiatedBy,
            idempotencyKey: `bulk-alloc-${line.id}`,
          });
          line.receiptId = receipt.id;
          line.updatedBy = initiatedBy;
          await this.lineRepository.save(line, manager);
        });
        createdCount++;
      } catch (error) {
        anyFailure = true;
        await this.suspenseRepository.create({
          source: "BANK",
          amount: line.amount,
          // line.id alone — see the identical fix/comment above; the same
          // varchar(60) overflow previously made this fallback INSERT hit
          // the exact same failure it was meant to gracefully catch.
          externalRef: line.id,
          raw: { batchId, lineId: line.id, studentId: line.studentId, error: errorMessage(error) },
          receivedAt: new Date(),
          state: "OPEN",
          resolvedReceiptId: null,
          resolvedBy: null,
          resolvedAt: null,
          resolutionNote: null,
          createdBy: initiatedBy,
          updatedBy: initiatedBy,
        });
      }
    }

    let finalBatch = await this.batchRepository.findByIdOrFail(batchId);
    finalBatch.status = anyFailure ? "FAILED" : "COMPLETED";
    finalBatch.createdReceipts = createdCount;
    finalBatch.updatedBy = initiatedBy;
    finalBatch = await this.batchRepository.save(finalBatch);
    return finalBatch;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
