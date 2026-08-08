import { Injectable } from "@nestjs/common";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { Money } from "../../../shared/money/money";
import { BillStudentOptionalItemEntity } from "../domain/bill-student-optional-item.entity";
import { BillStudentOptionalItemRepository } from "../infrastructure/bill-student-optional-item.repository";

export interface CreateStudentOptionalItemInput {
  studentId: string;
  termId: string;
  feeCategoryId: string;
  amountOverride?: Money | null;
}

export interface UpdateStudentOptionalItemInput {
  amountOverride?: Money | null;
}

/**
 * CRUD for `bill_student_optional_item` (FR-BILL-013) — a per-student,
 * per-term opt-in to an optional `bill_fee_structure_line`. The row's mere
 * existence for `(student_id, term_id, fee_category_id)` is what
 * `InvoicingService.generateInvoice()` reads to decide whether to include an
 * `is_optional=true` structure line at all; `amount_override` (nullable)
 * lets the opted-in amount differ from the structure line's own default.
 */
@Injectable()
export class StudentOptionalItemsService {
  constructor(private readonly optionalItemRepository: BillStudentOptionalItemRepository) {}

  async create(input: CreateStudentOptionalItemInput, actorId: string | null): Promise<BillStudentOptionalItemEntity> {
    const existing = await this.optionalItemRepository.listByStudentAndTerm(input.studentId, input.termId);
    if (existing.some((row) => row.feeCategoryId === input.feeCategoryId)) {
      throw new ConflictException(
        `A bill_student_optional_item already exists for student ${input.studentId}/term ${input.termId}/category ${input.feeCategoryId}`,
      );
    }
    return this.optionalItemRepository.create({
      studentId: input.studentId,
      termId: input.termId,
      feeCategoryId: input.feeCategoryId,
      amountOverride: input.amountOverride ?? null,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async findByIdOrFail(id: string): Promise<BillStudentOptionalItemEntity> {
    return this.optionalItemRepository.findByIdOrFail(id);
  }

  async listByStudentAndTerm(studentId: string, termId: string): Promise<BillStudentOptionalItemEntity[]> {
    return this.optionalItemRepository.listByStudentAndTerm(studentId, termId);
  }

  async update(
    id: string,
    changes: UpdateStudentOptionalItemInput,
    actorId: string | null,
  ): Promise<BillStudentOptionalItemEntity> {
    const item = await this.optionalItemRepository.findByIdOrFail(id);
    if (changes.amountOverride !== undefined) item.amountOverride = changes.amountOverride;
    item.updatedBy = actorId;
    return this.optionalItemRepository.save(item);
  }

  /** Opting back out — only meaningful before the term's invoice has been generated for this student (not itself enforced here, see class doc comment). */
  async remove(id: string): Promise<void> {
    await this.optionalItemRepository.findByIdOrFail(id);
    await this.optionalItemRepository.delete(id);
  }
}
