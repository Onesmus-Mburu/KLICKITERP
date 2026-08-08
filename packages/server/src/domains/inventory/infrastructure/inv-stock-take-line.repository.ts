import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { InvStockTakeLineEntity } from "../domain/inv-stock-take-line.entity";

/** Plain repository wrapper for `inv_stock_take_line`, plus `findByStockTakeId()`. */
@Injectable()
export class InvStockTakeLineRepository {
  constructor(
    @InjectRepository(InvStockTakeLineEntity)
    private readonly repo: Repository<InvStockTakeLineEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<InvStockTakeLineEntity | null> {
    return (manager?.getRepository(InvStockTakeLineEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<InvStockTakeLineEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("InvStockTakeLine", id);
    return row;
  }

  /** All counted lines of a stock-take — the variance-report/posting entry point the next pass needs. */
  async findByStockTakeId(stockTakeId: string, manager?: EntityManager): Promise<InvStockTakeLineEntity[]> {
    return (manager?.getRepository(InvStockTakeLineEntity) ?? this.repo).find({ where: { stockTakeId } });
  }

  async create(data: Partial<InvStockTakeLineEntity>, manager?: EntityManager): Promise<InvStockTakeLineEntity> {
    const repo = manager?.getRepository(InvStockTakeLineEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: InvStockTakeLineEntity, manager?: EntityManager): Promise<InvStockTakeLineEntity> {
    return (manager?.getRepository(InvStockTakeLineEntity) ?? this.repo).save(entity);
  }
}
