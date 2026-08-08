import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { InvStockTakeEntity, InvStockTakeStatus } from "../domain/inv-stock-take.entity";

export interface ListInvStockTakesFilter {
  status?: InvStockTakeStatus;
  storeId?: string;
}

/** Plain repository wrapper for `inv_stock_take`. */
@Injectable()
export class InvStockTakeRepository {
  constructor(
    @InjectRepository(InvStockTakeEntity)
    private readonly repo: Repository<InvStockTakeEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<InvStockTakeEntity | null> {
    return (manager?.getRepository(InvStockTakeEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<InvStockTakeEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("InvStockTake", id);
    return row;
  }

  async findByNumber(number: string, manager?: EntityManager): Promise<InvStockTakeEntity | null> {
    return (manager?.getRepository(InvStockTakeEntity) ?? this.repo).findOne({ where: { number } });
  }

  async list(filter: ListInvStockTakesFilter = {}, manager?: EntityManager): Promise<InvStockTakeEntity[]> {
    const where: Record<string, unknown> = {};
    if (filter.status !== undefined) where.status = filter.status;
    if (filter.storeId !== undefined) where.storeId = filter.storeId;
    return (manager?.getRepository(InvStockTakeEntity) ?? this.repo).find({ where, order: { createdAt: "DESC" } });
  }

  /** Open (not POSTED/CANCELLED) stock-takes for a store — the next pass's BR-INV-03 freeze check needs this. */
  async listOpenForStore(storeId: string, manager?: EntityManager): Promise<InvStockTakeEntity[]> {
    return (manager?.getRepository(InvStockTakeEntity) ?? this.repo)
      .createQueryBuilder("st")
      .where("st.storeId = :storeId", { storeId })
      .andWhere("st.status NOT IN (:...closedStatuses)", { closedStatuses: ["POSTED", "CANCELLED"] })
      .getMany();
  }

  async create(data: Partial<InvStockTakeEntity>, manager?: EntityManager): Promise<InvStockTakeEntity> {
    const repo = manager?.getRepository(InvStockTakeEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: InvStockTakeEntity, manager?: EntityManager): Promise<InvStockTakeEntity> {
    return (manager?.getRepository(InvStockTakeEntity) ?? this.repo).save(entity);
  }
}
