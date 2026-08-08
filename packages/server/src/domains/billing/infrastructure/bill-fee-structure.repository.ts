import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BillFeeStructureEntity } from "../domain/bill-fee-structure.entity";

/**
 * Plain repository wrapper for `bill_fee_structure`, plus
 * `findCurrentPublished()` — the fee-resolution lookup `InvoicingService`
 * needs: given a (year, class) scope and optional stream/boarding/fee-group
 * scope, find the single `PUBLISHED` structure matching that scope (falls
 * back to the more general row when a scope-specific one doesn't exist —
 * narrowest-match-first via `ORDER BY` scope specificity, then highest
 * `version`).
 *
 * **Phase 6 Slice 3b (2026-07-29, migration `0210`)**: `listByTermAndClass`
 * renamed to `listByYearAndClass`/`findCurrentPublished` takes
 * `academicYearId` in place of `termId` — a structure now spans a whole
 * academic year, not a single term (see `BillFeeStructureEntity`'s doc
 * comment). Added `delete()` for the new `FeeStructuresService.delete()`.
 */
@Injectable()
export class BillFeeStructureRepository {
  constructor(
    @InjectRepository(BillFeeStructureEntity)
    private readonly repo: Repository<BillFeeStructureEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BillFeeStructureEntity | null> {
    return (manager?.getRepository(BillFeeStructureEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BillFeeStructureEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BillFeeStructure", id);
    return row;
  }

  async listByYearAndClass(
    academicYearId: string,
    classId: string,
    manager?: EntityManager,
  ): Promise<BillFeeStructureEntity[]> {
    return (manager?.getRepository(BillFeeStructureEntity) ?? this.repo).find({
      where: { academicYearId, classId },
      order: { version: "DESC" },
    });
  }

  async create(data: Partial<BillFeeStructureEntity>, manager?: EntityManager): Promise<BillFeeStructureEntity> {
    const repo = manager?.getRepository(BillFeeStructureEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BillFeeStructureEntity, manager?: EntityManager): Promise<BillFeeStructureEntity> {
    return (manager?.getRepository(BillFeeStructureEntity) ?? this.repo).save(entity);
  }

  /** `bill_fee_structure_line` cascades automatically (`fk_bill_fee_structure_line_fee_structure_id ON DELETE CASCADE`, migration `0070`). */
  async delete(id: string, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(BillFeeStructureEntity) ?? this.repo).delete(id);
  }

  /**
   * FR-BILL/BR-BILL-02 lookup: the single `PUBLISHED` structure for a
   * (academic year, class) scope, preferring the most specific stream/
   * boarding/fee-group match over a more general one, and the highest
   * `version` among ties. Returns `null` when no `PUBLISHED` structure
   * matches at all (a `DRAFT`-only structure cannot bill, BR-BILL-02).
   */
  async findCurrentPublished(
    academicYearId: string,
    classId: string,
    streamId?: string | null,
    boarding?: string | null,
    feeGroupId?: string | null,
    manager?: EntityManager,
  ): Promise<BillFeeStructureEntity | null> {
    const source = manager ?? this.repo.manager;
    const rows: BillFeeStructureEntity[] = await source.getRepository(BillFeeStructureEntity).find({
      where: { academicYearId, classId, status: "PUBLISHED" },
      order: { version: "DESC" },
    });
    if (rows.length === 0) return null;

    // Narrowest match first: an exact match on every provided scope dimension wins;
    // a structure row with a NULL scope dimension matches any value for that dimension.
    const scoped = rows.filter(
      (row) =>
        (row.streamId === null || row.streamId === (streamId ?? null)) &&
        (row.boarding === null || row.boarding === (boarding ?? null)) &&
        (row.feeGroupId === null || row.feeGroupId === (feeGroupId ?? null)),
    );
    if (scoped.length === 0) return null;

    scoped.sort((a, b) => {
      const specificity = (row: BillFeeStructureEntity): number =>
        (row.streamId !== null ? 1 : 0) + (row.boarding !== null ? 1 : 0) + (row.feeGroupId !== null ? 1 : 0);
      const diff = specificity(b) - specificity(a);
      return diff !== 0 ? diff : b.version - a.version;
    });
    return scoped[0];
  }
}
