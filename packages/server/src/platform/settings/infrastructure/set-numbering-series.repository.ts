import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SetNumberingSeriesEntity } from "../domain/set-numbering-series.entity";

/**
 * Read/inspection + raise-only-edit CRUD for `NumberingService`. The actual
 * gapless-allocation locking (`SELECT ... FOR UPDATE` inside the caller's
 * transaction) bypasses this repository entirely and works directly off the
 * `EntityManager` `NumberingService.allocate()` is given — that path can
 * never use this class's own injected `Repository` (it belongs to a
 * different `DataSource`/transaction context than the caller's).
 */
@Injectable()
export class SetNumberingSeriesRepository {
  constructor(
    @InjectRepository(SetNumberingSeriesEntity)
    private readonly repo: Repository<SetNumberingSeriesEntity>,
  ) {}

  async findById(id: string): Promise<SetNumberingSeriesEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async list(): Promise<SetNumberingSeriesEntity[]> {
    return this.repo.find({ order: { docType: "ASC", seriesCode: "ASC", periodKey: "ASC" } });
  }

  async save(entity: SetNumberingSeriesEntity): Promise<SetNumberingSeriesEntity> {
    return this.repo.save(entity);
  }
}
