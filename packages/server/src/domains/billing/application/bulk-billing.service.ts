import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
// Barrel import (application-layer service, not an entity file) — safe, see
// billing.module.ts's doc comment on import ordering.
import { StdStudentRepository } from "../../students";
import { InvoicingService } from "./invoicing.service";

export interface BulkGenerateFilter {
  classIds?: string[];
  streamIds?: string[];
}

export interface BulkGenerateFailure {
  studentId: string;
  error: string;
}

export interface BulkGenerateResult {
  succeeded: string[];
  failed: BulkGenerateFailure[];
}

/**
 * FR-BILL-020.1 bulk billing wizard's execution half (the preview-grid UI is
 * a Pass B/frontend concern — this service is the "confirm" step). Iterates
 * every `ACTIVE` student matching `filter.classIds`/`.streamIds` (an empty
 * filter means every active student), and for each one calls
 * `InvoicingService.generateInvoice()` then `.postInvoice()` inside that
 * student's OWN `tx()` transaction — one student's failure (no applicable
 * PUBLISHED structure, BR-BILL-04 already-billed conflict, a GL
 * configuration error, ...) is caught and recorded in `failed`, never
 * aborting the batch, the same partial-failure-tolerant shape as Module 8's
 * `PromotionService.promoteBatch()` (though `promoteBatch()` validates
 * up-front inside ONE transaction, while this method genuinely runs one
 * transaction PER student — each invoice is its own atomic
 * generate-then-post unit, and a later student's failure must never roll
 * back an earlier student's already-committed invoice).
 *
 * Re-running the same scope is naturally idempotent per BR-BILL-04: a
 * student already billed for the term/structure lands in `failed` with the
 * `ConflictException` message, not a duplicate invoice.
 *
 * No `bill_late_fee_batch`-style tracking row exists for bulk-billing runs
 * — no DDL table backs one (the foundation pass's `bill_late_fee_batch` is
 * specific to the late-fee engine, Pass B) — so this method returns the
 * summary object directly with no persisted audit trail; a future pass could
 * add a dedicated table if bulk-billing run history needs to be queryable
 * later.
 */
@Injectable()
export class BulkBillingService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly studentRepository: StdStudentRepository,
    private readonly invoicingService: InvoicingService,
  ) {}

  async bulkGenerate(termId: string, filter: BulkGenerateFilter, initiatedBy: string): Promise<BulkGenerateResult> {
    const students = await this.resolveStudents(filter);
    const succeeded: string[] = [];
    const failed: BulkGenerateFailure[] = [];

    for (const student of students) {
      try {
        await runInTransaction(this.dataSource, async (manager) => {
          const invoice = await this.invoicingService.generateInvoice(manager, {
            studentId: student.id,
            termId,
            source: "STRUCTURE",
            createdBy: initiatedBy,
          });
          await this.invoicingService.postInvoice(manager, invoice.id, initiatedBy);
        });
        succeeded.push(student.id);
      } catch (error) {
        failed.push({ studentId: student.id, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return { succeeded, failed };
  }

  /**
   * Phase 6 Slice 2c — `StdStudentRepository.list()` now returns
   * `[items, total]` (real server-side pagination for `StudentsController`'s
   * list endpoint, `findAndCount()` over the old plain `find()`) — every
   * call site here omits `skip`/`take`, so the row SET returned is
   * unchanged (still every matching row, unbounded), only the return SHAPE
   * changed from a plain array to a tuple; `total` is discarded here, this
   * method only ever wanted the rows.
   */
  private async resolveStudents(filter: BulkGenerateFilter): Promise<{ id: string; streamId: string | null }[]> {
    const classIds = filter.classIds ?? [];
    const streamIds = filter.streamIds ?? [];

    if (classIds.length > 0) {
      const rowsByClass = await Promise.all(
        classIds.map((classId) => this.studentRepository.list({ classId, status: "ACTIVE" })),
      );
      const rows = rowsByClass.flatMap(([items]) => items);
      return streamIds.length > 0 ? rows.filter((row) => row.streamId && streamIds.includes(row.streamId)) : rows;
    }

    if (streamIds.length > 0) {
      const rowsByStream = await Promise.all(
        streamIds.map((streamId) => this.studentRepository.list({ streamId, status: "ACTIVE" })),
      );
      return rowsByStream.flatMap(([items]) => items);
    }

    const [items] = await this.studentRepository.list({ status: "ACTIVE" });
    return items;
  }
}
