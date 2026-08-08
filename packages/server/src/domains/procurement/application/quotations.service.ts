import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { ProcQuotationEntity } from "../domain/proc-quotation.entity";
import { ProcQuotationLineEntity } from "../domain/proc-quotation-line.entity";
import { ProcQuotationLineRepository } from "../infrastructure/proc-quotation-line.repository";
import { ProcQuotationRepository } from "../infrastructure/proc-quotation.repository";
import { ProcRequisitionRepository } from "../infrastructure/proc-requisition.repository";

const PG_UNIQUE_VIOLATION = "23505";

export interface CreateQuotationLineInput {
  itemId?: string | null;
  description: string;
  qty: string;
  unitPrice: Money;
}

export interface CreateQuotationInput {
  requisitionId: string;
  supplierId: string;
  quoteDate: string;
  validUntil?: string | null;
  documentFileId?: string | null;
  terms?: string | null;
  lines: CreateQuotationLineInput[];
}

/**
 * CRUD for `proc_quotation` + `proc_quotation_line` against an `APPROVED`
 * requisition, plus `award()`.
 *
 * **`create()` writes quotation + lines atomically, with no separate
 * add/update/remove-line surface** — `ProcQuotationLineEntity` is a
 * deliberately plain `BaseEntity` (append-only), not `MutableBaseEntity`:
 * `proc_quotation` carries no `DRAFT` lifecycle, so a captured quote and its
 * lines represent a point-in-time record of what a supplier quoted, written
 * once at data-entry time (see that entity's own doc comment) — there is no
 * legitimate later moment to edit a line, so this service doesn't offer one;
 * a data-entry mistake means creating a fresh `proc_quotation` row, not
 * mutating the wrong one.
 *
 * **`award()`** enforces `uq_proc_quotation_award_p` (`WHERE is_awarded`) by
 * catching the DB unique-violation on the UPDATE, per the task brief's
 * explicit instruction — no pre-check query.
 */
@Injectable()
export class QuotationsService {
  constructor(
    private readonly quotationRepository: ProcQuotationRepository,
    private readonly quotationLineRepository: ProcQuotationLineRepository,
    private readonly requisitionRepository: ProcRequisitionRepository,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async create(input: CreateQuotationInput, actorId: string | null): Promise<ProcQuotationEntity> {
    if (input.lines.length === 0) {
      throw new ValidationException("A quotation needs at least one line");
    }
    const requisition = await this.requisitionRepository.findByIdOrFail(input.requisitionId);
    if (requisition.status !== "APPROVED") {
      throw new ValidationException(
        `Quotations may only be captured against an APPROVED requisition (requisition ${input.requisitionId} status=${requisition.status})`,
      );
    }
    const total = input.lines.reduce((sum, line) => sum.add(line.unitPrice.multiply(line.qty)), Money.ZERO);

    return runInTransaction(this.dataSource, async (manager) => {
      const quotation = await this.quotationRepository.create(
        {
          requisitionId: input.requisitionId,
          supplierId: input.supplierId,
          quoteDate: input.quoteDate,
          validUntil: input.validUntil ?? null,
          documentFileId: input.documentFileId ?? null,
          total,
          terms: input.terms ?? null,
          isAwarded: false,
          awardReason: null,
          createdBy: actorId,
          updatedBy: actorId,
        },
        manager,
      );

      for (const line of input.lines) {
        await this.quotationLineRepository.create(
          {
            quotationId: quotation.id,
            itemId: line.itemId ?? null,
            description: line.description,
            qty: line.qty,
            unitPrice: line.unitPrice,
            createdBy: actorId,
            updatedBy: actorId,
          },
          manager,
        );
      }

      return quotation;
    });
  }

  async findByIdOrFail(id: string): Promise<ProcQuotationEntity> {
    return this.quotationRepository.findByIdOrFail(id);
  }

  async listByRequisition(requisitionId: string): Promise<ProcQuotationEntity[]> {
    return this.quotationRepository.findByRequisitionId(requisitionId);
  }

  async listLines(quotationId: string): Promise<ProcQuotationLineEntity[]> {
    return this.quotationLineRepository.findByQuotationId(quotationId);
  }

  /** See class doc comment "award()". */
  async award(
    em: EntityManager,
    quotationId: string,
    awardReason: string,
    actorId: string | null = null,
  ): Promise<ProcQuotationEntity> {
    const quotation = await this.quotationRepository.findByIdOrFail(quotationId, em);
    if (quotation.isAwarded) {
      throw new ValidationException(`Quotation ${quotationId} is already awarded`);
    }
    if (!awardReason || awardReason.trim().length === 0) {
      throw new ValidationException("award() requires a non-empty awardReason");
    }
    quotation.isAwarded = true;
    quotation.awardReason = awardReason;
    quotation.updatedBy = actorId;
    try {
      return await this.quotationRepository.save(quotation, em);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `uq_award_p: requisition ${quotation.requisitionId} already has an awarded quotation`,
        );
      }
      throw error;
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: string; driverError?: { code?: string } })?.code ??
    (error as { driverError?: { code?: string } })?.driverError?.code;
  return code === PG_UNIQUE_VIOLATION;
}
