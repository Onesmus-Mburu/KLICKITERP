import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ProcContractEntity, ProcContractStatus } from "../domain/proc-contract.entity";

export interface ListProcContractsFilter {
  status?: ProcContractStatus;
  supplierId?: string;
}

/** Plain repository wrapper for `proc_contract`. */
@Injectable()
export class ProcContractRepository {
  constructor(
    @InjectRepository(ProcContractEntity)
    private readonly repo: Repository<ProcContractEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<ProcContractEntity | null> {
    return (manager?.getRepository(ProcContractEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<ProcContractEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("ProcContract", id);
    return row;
  }

  async list(filter: ListProcContractsFilter = {}, manager?: EntityManager): Promise<ProcContractEntity[]> {
    const where: Record<string, unknown> = {};
    if (filter.status !== undefined) where.status = filter.status;
    if (filter.supplierId !== undefined) where.supplierId = filter.supplierId;
    return (manager?.getRepository(ProcContractEntity) ?? this.repo).find({ where, order: { endsOn: "ASC" } });
  }

  /** Contracts whose `ends_on` falls within the next `withinDays` days and are still `ACTIVE` — the renewal-alert lookup (`renewal_alert_days`). */
  async findExpiringSoon(withinDays: number, manager?: EntityManager): Promise<ProcContractEntity[]> {
    return (manager?.getRepository(ProcContractEntity) ?? this.repo)
      .createQueryBuilder("c")
      .where("c.status = :status", { status: "ACTIVE" })
      .andWhere("c.endsOn <= (CURRENT_DATE + (:withinDays || ' days')::interval)", { withinDays })
      .orderBy("c.endsOn", "ASC")
      .getMany();
  }

  async create(data: Partial<ProcContractEntity>, manager?: EntityManager): Promise<ProcContractEntity> {
    const repo = manager?.getRepository(ProcContractEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: ProcContractEntity, manager?: EntityManager): Promise<ProcContractEntity> {
    return (manager?.getRepository(ProcContractEntity) ?? this.repo).save(entity);
  }
}
