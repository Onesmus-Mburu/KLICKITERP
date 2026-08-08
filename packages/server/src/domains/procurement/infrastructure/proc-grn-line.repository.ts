import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ProcGrnLineEntity } from "../domain/proc-grn-line.entity";

/** Plain repository wrapper for `proc_grn_line`. */
@Injectable()
export class ProcGrnLineRepository {
  constructor(
    @InjectRepository(ProcGrnLineEntity)
    private readonly repo: Repository<ProcGrnLineEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<ProcGrnLineEntity | null> {
    return (manager?.getRepository(ProcGrnLineEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<ProcGrnLineEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("ProcGrnLine", id);
    return row;
  }

  async findByGrnId(grnId: string, manager?: EntityManager): Promise<ProcGrnLineEntity[]> {
    return (manager?.getRepository(ProcGrnLineEntity) ?? this.repo).find({
      where: { grnId },
      order: { createdAt: "ASC" },
    });
  }

  /** Every GRN line ever posted against a PO line — the raw input to `trg_proc_grn_qty_cap`'s own SUM check, exposed for application-layer pre-flight validation too. */
  async findByPoLineId(poLineId: string, manager?: EntityManager): Promise<ProcGrnLineEntity[]> {
    return (manager?.getRepository(ProcGrnLineEntity) ?? this.repo).find({
      where: { poLineId },
      order: { createdAt: "ASC" },
    });
  }

  async create(data: Partial<ProcGrnLineEntity>, manager?: EntityManager): Promise<ProcGrnLineEntity> {
    const repo = manager?.getRepository(ProcGrnLineEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: ProcGrnLineEntity, manager?: EntityManager): Promise<ProcGrnLineEntity> {
    return (manager?.getRepository(ProcGrnLineEntity) ?? this.repo).save(entity);
  }
}
