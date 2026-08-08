import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BillFeeStructureLineEntity } from "../domain/bill-fee-structure-line.entity";

@Injectable()
export class BillFeeStructureLineRepository {
  constructor(
    @InjectRepository(BillFeeStructureLineEntity)
    private readonly repo: Repository<BillFeeStructureLineEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BillFeeStructureLineEntity | null> {
    return (manager?.getRepository(BillFeeStructureLineEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BillFeeStructureLineEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BillFeeStructureLine", id);
    return row;
  }

  async listByStructure(feeStructureId: string, manager?: EntityManager): Promise<BillFeeStructureLineEntity[]> {
    return (manager?.getRepository(BillFeeStructureLineEntity) ?? this.repo).find({ where: { feeStructureId } });
  }

  /**
   * Phase 6 Slice 3b — `InvoicingService.generateInvoice()`'s STRUCTURE
   * branch uses this (not `listByStructure()`) to resolve only the lines
   * that apply to the term being billed, now that one structure spans a
   * whole academic year. `listByStructure()` itself is kept — still needed
   * for `publish()`'s all-lines check and any year-wide line-list view.
   */
  async listByStructureAndTerm(
    feeStructureId: string,
    termId: string,
    manager?: EntityManager,
  ): Promise<BillFeeStructureLineEntity[]> {
    return (manager?.getRepository(BillFeeStructureLineEntity) ?? this.repo).find({
      where: { feeStructureId, termId },
    });
  }

  async create(
    data: Partial<BillFeeStructureLineEntity>,
    manager?: EntityManager,
  ): Promise<BillFeeStructureLineEntity> {
    const repo = manager?.getRepository(BillFeeStructureLineEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BillFeeStructureLineEntity, manager?: EntityManager): Promise<BillFeeStructureLineEntity> {
    return (manager?.getRepository(BillFeeStructureLineEntity) ?? this.repo).save(entity);
  }

  async delete(id: string, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(BillFeeStructureLineEntity) ?? this.repo).delete(id);
  }
}
