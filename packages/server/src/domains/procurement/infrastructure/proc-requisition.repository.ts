import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ProcRequisitionEntity, ProcRequisitionStatus } from "../domain/proc-requisition.entity";

export interface ListProcRequisitionsFilter {
  status?: ProcRequisitionStatus;
  departmentId?: string;
  requestedBy?: string;
}

/** Plain repository wrapper for `proc_requisition`. */
@Injectable()
export class ProcRequisitionRepository {
  constructor(
    @InjectRepository(ProcRequisitionEntity)
    private readonly repo: Repository<ProcRequisitionEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<ProcRequisitionEntity | null> {
    return (manager?.getRepository(ProcRequisitionEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<ProcRequisitionEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("ProcRequisition", id);
    return row;
  }

  async findByNumber(number: string, manager?: EntityManager): Promise<ProcRequisitionEntity | null> {
    return (manager?.getRepository(ProcRequisitionEntity) ?? this.repo).findOne({ where: { number } });
  }

  async list(filter: ListProcRequisitionsFilter = {}, manager?: EntityManager): Promise<ProcRequisitionEntity[]> {
    const where: Record<string, unknown> = {};
    if (filter.status !== undefined) where.status = filter.status;
    if (filter.departmentId !== undefined) where.departmentId = filter.departmentId;
    if (filter.requestedBy !== undefined) where.requestedBy = filter.requestedBy;
    return (manager?.getRepository(ProcRequisitionEntity) ?? this.repo).find({
      where,
      order: { createdAt: "DESC" },
    });
  }

  async create(data: Partial<ProcRequisitionEntity>, manager?: EntityManager): Promise<ProcRequisitionEntity> {
    const repo = manager?.getRepository(ProcRequisitionEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: ProcRequisitionEntity, manager?: EntityManager): Promise<ProcRequisitionEntity> {
    return (manager?.getRepository(ProcRequisitionEntity) ?? this.repo).save(entity);
  }
}
