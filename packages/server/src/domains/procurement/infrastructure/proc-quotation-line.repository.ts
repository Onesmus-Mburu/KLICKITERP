import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ProcQuotationLineEntity } from "../domain/proc-quotation-line.entity";

/** Plain repository wrapper for `proc_quotation_line`. */
@Injectable()
export class ProcQuotationLineRepository {
  constructor(
    @InjectRepository(ProcQuotationLineEntity)
    private readonly repo: Repository<ProcQuotationLineEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<ProcQuotationLineEntity | null> {
    return (manager?.getRepository(ProcQuotationLineEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<ProcQuotationLineEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("ProcQuotationLine", id);
    return row;
  }

  async findByQuotationId(quotationId: string, manager?: EntityManager): Promise<ProcQuotationLineEntity[]> {
    return (manager?.getRepository(ProcQuotationLineEntity) ?? this.repo).find({
      where: { quotationId },
      order: { createdAt: "ASC" },
    });
  }

  async create(data: Partial<ProcQuotationLineEntity>, manager?: EntityManager): Promise<ProcQuotationLineEntity> {
    const repo = manager?.getRepository(ProcQuotationLineEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: ProcQuotationLineEntity, manager?: EntityManager): Promise<ProcQuotationLineEntity> {
    return (manager?.getRepository(ProcQuotationLineEntity) ?? this.repo).save(entity);
  }
}
