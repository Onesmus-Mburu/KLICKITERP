import { Injectable } from "@nestjs/common";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { BillSponsorAwardEntity } from "../domain/bill-sponsor-award.entity";
import { BillSponsorAwardRepository } from "../infrastructure/bill-sponsor-award.repository";
import { BillSponsorRepository } from "../infrastructure/bill-sponsor.repository";

export interface CreateSponsorAwardInput {
  sponsorId: string;
  studentId: string;
  termId: string;
  amount: Money;
  categoryScope?: string[] | null;
}

export interface UpdateSponsorAwardInput {
  amount?: Money;
  categoryScope?: string[] | null;
}

/** One `bill_sponsor_award` with its unapplied balance — `InvoicingService.postInvoice()`'s P-03 auto-coverage input. */
export interface SponsorAwardCoverage {
  award: BillSponsorAwardEntity;
  remainingAmount: Money;
  categoryScope: string[] | null;
}

/**
 * CRUD for `bill_sponsor_award`, plus `findActiveCoverage()` — the lookup
 * `InvoicingService.postInvoice()` calls to auto-move sponsor-covered amounts
 * to AR-Sponsor via P-03 (FR-BILL-042.1: "on invoice posting, covered
 * amounts auto-move to sponsor via P-03").
 */
@Injectable()
export class SponsorAwardsService {
  constructor(
    private readonly sponsorAwardRepository: BillSponsorAwardRepository,
    private readonly sponsorRepository: BillSponsorRepository,
  ) {}

  async create(input: CreateSponsorAwardInput, actorId: string | null): Promise<BillSponsorAwardEntity> {
    await this.sponsorRepository.findByIdOrFail(input.sponsorId);
    if (!input.amount.isPositive()) {
      throw new ValidationException("bill_sponsor_award.amount must be positive (ck_bill_sponsor_award_amount_positive)");
    }
    return this.sponsorAwardRepository.create({
      sponsorId: input.sponsorId,
      studentId: input.studentId,
      termId: input.termId,
      amount: input.amount,
      categoryScope: input.categoryScope ?? null,
      appliedAmount: Money.ZERO,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async findByIdOrFail(id: string): Promise<BillSponsorAwardEntity> {
    return this.sponsorAwardRepository.findByIdOrFail(id);
  }

  async listByStudent(studentId: string): Promise<BillSponsorAwardEntity[]> {
    return this.sponsorAwardRepository.listByStudent(studentId);
  }

  /** Only the still-unapplied portion of an award may be revised — mirrors `ck_bill_sponsor_award_applied_le_amount`. */
  async update(id: string, changes: UpdateSponsorAwardInput, actorId: string | null): Promise<BillSponsorAwardEntity> {
    const award = await this.sponsorAwardRepository.findByIdOrFail(id);
    if (changes.amount !== undefined) {
      if (changes.amount.compare(award.appliedAmount) < 0) {
        throw new ValidationException(
          `bill_sponsor_award ${id}: new amount ${changes.amount.toDecimalString()} is below already-applied ${award.appliedAmount.toDecimalString()}`,
        );
      }
      award.amount = changes.amount;
    }
    if (changes.categoryScope !== undefined) award.categoryScope = changes.categoryScope;
    award.updatedBy = actorId;
    return this.sponsorAwardRepository.save(award);
  }

  /**
   * Awards for `(studentId, termId)` with unapplied balance
   * (`applied_amount < amount`), each paired with its remaining amount and
   * category scope — `InvoicingService.postInvoice()` consumes this in
   * invoice-line order, capped at each award's own remaining balance
   * (BR-BILL-13).
   */
  async findActiveCoverage(studentId: string, termId: string): Promise<SponsorAwardCoverage[]> {
    const awards = await this.sponsorAwardRepository.findActiveForStudent(studentId, termId);
    return awards.map((award) => ({
      award,
      remainingAmount: award.amount.subtract(award.appliedAmount),
      categoryScope: award.categoryScope,
    }));
  }
}
