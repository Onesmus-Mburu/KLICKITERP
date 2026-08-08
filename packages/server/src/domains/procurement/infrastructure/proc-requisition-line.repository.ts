import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ProcRequisitionLineEntity } from "../domain/proc-requisition-line.entity";

/** Plain repository wrapper for `proc_requisition_line`. */
@Injectable()
export class ProcRequisitionLineRepository {
  constructor(
    @InjectRepository(ProcRequisitionLineEntity)
    private readonly repo: Repository<ProcRequisitionLineEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<ProcRequisitionLineEntity | null> {
    return (manager?.getRepository(ProcRequisitionLineEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<ProcRequisitionLineEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("ProcRequisitionLine", id);
    return row;
  }

  async findByRequisitionId(requisitionId: string, manager?: EntityManager): Promise<ProcRequisitionLineEntity[]> {
    return (manager?.getRepository(ProcRequisitionLineEntity) ?? this.repo).find({
      where: { requisitionId },
      order: { createdAt: "ASC" },
    });
  }

  async create(
    data: Partial<ProcRequisitionLineEntity>,
    manager?: EntityManager,
  ): Promise<ProcRequisitionLineEntity> {
    const repo = manager?.getRepository(ProcRequisitionLineEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: ProcRequisitionLineEntity, manager?: EntityManager): Promise<ProcRequisitionLineEntity> {
    return (manager?.getRepository(ProcRequisitionLineEntity) ?? this.repo).save(entity);
  }

  async delete(id: string, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(ProcRequisitionLineEntity) ?? this.repo).delete(id);
  }
}
