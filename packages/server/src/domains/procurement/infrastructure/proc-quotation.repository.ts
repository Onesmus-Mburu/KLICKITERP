import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ProcQuotationEntity } from "../domain/proc-quotation.entity";

/** Plain repository wrapper for `proc_quotation`. */
@Injectable()
export class ProcQuotationRepository {
  constructor(
    @InjectRepository(ProcQuotationEntity)
    private readonly repo: Repository<ProcQuotationEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<ProcQuotationEntity | null> {
    return (manager?.getRepository(ProcQuotationEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<ProcQuotationEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("ProcQuotation", id);
    return row;
  }

  async findByRequisitionId(requisitionId: string, manager?: EntityManager): Promise<ProcQuotationEntity[]> {
    return (manager?.getRepository(ProcQuotationEntity) ?? this.repo).find({
      where: { requisitionId },
      order: { total: "ASC" },
    });
  }

  /** The awarded quotation for a requisition, if any (`uq_proc_quotation_award_p`). */
  async findAwardedForRequisition(
    requisitionId: string,
    manager?: EntityManager,
  ): Promise<ProcQuotationEntity | null> {
    return (manager?.getRepository(ProcQuotationEntity) ?? this.repo).findOne({
      where: { requisitionId, isAwarded: true },
    });
  }

  async create(data: Partial<ProcQuotationEntity>, manager?: EntityManager): Promise<ProcQuotationEntity> {
    const repo = manager?.getRepository(ProcQuotationEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: ProcQuotationEntity, manager?: EntityManager): Promise<ProcQuotationEntity> {
    return (manager?.getRepository(ProcQuotationEntity) ?? this.repo).save(entity);
  }
}
