import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { OutboxWriterService } from "../../../shared/events/outbox-writer.service";
import { StdPromotionBatchEntity } from "../domain/std-promotion-batch.entity";
import { StdClassRepository } from "../infrastructure/std-class.repository";
import { StdPromotionBatchRepository } from "../infrastructure/std-promotion-batch.repository";
import { StdStreamRepository } from "../infrastructure/std-stream.repository";
import { StdStudentRepository } from "../infrastructure/std-student.repository";
import { PromotionBatchExecutedEvent } from "../events/promotion-batch-executed.event";

export interface PromoteStudentInput {
  studentId: string;
  toClassId: string;
  toStreamId?: string | null;
}

export interface PromoteBatchInput {
  fromYearId: string;
  toYearId: string;
  promotions: PromoteStudentInput[];
  executedBy: string | null;
}

interface PromotionFailure {
  studentId: string;
  reason: string;
}

/** `std_promotion_batch.summary` shape — counts + per-student failures (FR-BILL-005 audit of rollover). */
export interface PromotionBatchSummary extends Record<string, unknown> {
  totalRequested: number;
  promotedCount: number;
  failedCount: number;
  failures: PromotionFailure[];
}

/**
 * `promoteBatch()` performs a year-rollover promotion run (FR-BILL-005):
 * bulk-updates each listed student's `class_id`/`stream_id`, then records one
 * `std_promotion_batch` audit row with a `summary` jsonb.
 *
 * **Own transaction, not the caller's `EntityManager`** — unlike
 * `PostingService.post()`/`StudentLedgerService.appendEntry()`, this is a
 * top-level workflow entry point (invoked directly from
 * `promotion.controller.ts`, `POST /students/promotion-batches`), not a
 * building block another module's service composes inside its own posting
 * transaction. It opens its own `tx()` via the injected `DataSource`, same
 * shape as `StudentsService.changeStatus()`/`GuardiansService.linkToStudent()`.
 *
 * **Partial-failure handling (a documented judgement call — the task brief
 * leaves this open)**: every promotion in the batch is first *validated*
 * (student exists, target class exists, target stream — if given — belongs
 * to the target class) entirely in application code, with zero DB writes,
 * BEFORE any UPDATE is issued. A validation failure is recorded in
 * `summary.failures` and that student is skipped — it never touches the
 * database, so it can never leave the single Postgres transaction in an
 * aborted state (a real mid-transaction constraint violation on an
 * already-validated row would still abort the whole batch; this pass
 * accepts that narrower guarantee rather than adding per-student SAVEPOINTs,
 * which the task's own scope doesn't call for). Every promotion that passes
 * validation is applied, and the batch commits atomically with the
 * `std_promotion_batch` audit row in the same transaction.
 */
@Injectable()
export class PromotionService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly studentRepository: StdStudentRepository,
    private readonly classRepository: StdClassRepository,
    private readonly streamRepository: StdStreamRepository,
    private readonly promotionBatchRepository: StdPromotionBatchRepository,
    private readonly outboxWriter: OutboxWriterService,
  ) {}

  async promoteBatch(input: PromoteBatchInput): Promise<StdPromotionBatchEntity> {
    return runInTransaction(this.dataSource, async (manager) => {
      const failures: PromotionFailure[] = [];
      const validated: PromoteStudentInput[] = [];

      for (const promotion of input.promotions) {
        const failure = await this.validatePromotion(manager, promotion);
        if (failure) {
          failures.push(failure);
        } else {
          validated.push(promotion);
        }
      }

      for (const promotion of validated) {
        const student = await this.studentRepository.findByIdOrFail(promotion.studentId, manager);
        student.classId = promotion.toClassId;
        student.streamId = promotion.toStreamId ?? null;
        student.updatedBy = input.executedBy;
        await this.studentRepository.save(student, manager);
      }

      const summary: PromotionBatchSummary = {
        totalRequested: input.promotions.length,
        promotedCount: validated.length,
        failedCount: failures.length,
        failures,
      };

      const batch = await this.promotionBatchRepository.create(
        {
          fromYearId: input.fromYearId,
          toYearId: input.toYearId,
          executedAt: new Date(),
          summary,
          createdBy: input.executedBy,
          updatedBy: input.executedBy,
        },
        manager,
      );

      await this.outboxWriter.write(
        manager,
        new PromotionBatchExecutedEvent(batch.id, {
          batchId: batch.id,
          fromYearId: input.fromYearId,
          toYearId: input.toYearId,
          promotedCount: validated.length,
          failedCount: failures.length,
          actorId: input.executedBy,
        }),
      );

      return batch;
    });
  }

  async findByIdOrFail(id: string): Promise<StdPromotionBatchEntity> {
    return this.promotionBatchRepository.findByIdOrFail(id);
  }

  async list(): Promise<StdPromotionBatchEntity[]> {
    return this.promotionBatchRepository.list();
  }

  private async validatePromotion(
    manager: EntityManager,
    promotion: PromoteStudentInput,
  ): Promise<PromotionFailure | null> {
    const student = await this.studentRepository.findById(promotion.studentId, manager);
    if (!student) {
      return { studentId: promotion.studentId, reason: `student not found: ${promotion.studentId}` };
    }

    const targetClass = await this.classRepository.findById(promotion.toClassId, manager);
    if (!targetClass) {
      return { studentId: promotion.studentId, reason: `target class not found: ${promotion.toClassId}` };
    }

    if (promotion.toStreamId) {
      const targetStream = await this.streamRepository.findById(promotion.toStreamId, manager);
      if (!targetStream) {
        return { studentId: promotion.studentId, reason: `target stream not found: ${promotion.toStreamId}` };
      }
      if (targetStream.classId !== promotion.toClassId) {
        return {
          studentId: promotion.studentId,
          reason: `target stream ${promotion.toStreamId} does not belong to target class ${promotion.toClassId}`,
        };
      }
    }

    return null;
  }
}
