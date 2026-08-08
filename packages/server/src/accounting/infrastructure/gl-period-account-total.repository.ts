import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, IsNull, Repository } from "typeorm";
import { GlPeriodAccountTotalEntity } from "../domain/gl-period-account-total.entity";

/**
 * Plain repository wrapper. Writable only by the future `PostingService`
 * under `trg_gl_writer_guard`'s `application_name` gate (N-6 — see the
 * entity's doc comment); this repository exposes the finders a trial-
 * balance/statement query and the hourly integrity sweep will need.
 */
@Injectable()
export class GlPeriodAccountTotalRepository {
  constructor(
    @InjectRepository(GlPeriodAccountTotalEntity)
    private readonly repo: Repository<GlPeriodAccountTotalEntity>,
  ) {}

  async findOne(
    periodId: string,
    accountId: string,
    costCenterId: string | null,
    manager?: EntityManager,
  ): Promise<GlPeriodAccountTotalEntity | null> {
    return (manager?.getRepository(GlPeriodAccountTotalEntity) ?? this.repo).findOne({
      where: { periodId, accountId, costCenterId: costCenterId ?? IsNull() },
    });
  }

  async listByPeriod(periodId: string, manager?: EntityManager): Promise<GlPeriodAccountTotalEntity[]> {
    return (manager?.getRepository(GlPeriodAccountTotalEntity) ?? this.repo).find({ where: { periodId } });
  }

  async listByAccount(accountId: string, manager?: EntityManager): Promise<GlPeriodAccountTotalEntity[]> {
    return (manager?.getRepository(GlPeriodAccountTotalEntity) ?? this.repo).find({ where: { accountId } });
  }

  /** `IntegritySweepService.runSweep()`'s "every stored aggregate row" side of the NFR-INT-002 comparison. */
  async listAll(manager?: EntityManager): Promise<GlPeriodAccountTotalEntity[]> {
    return (manager?.getRepository(GlPeriodAccountTotalEntity) ?? this.repo).find();
  }

  /**
   * `SELECT ... FOR UPDATE` variant of `findOne()` — `PostingService`'s
   * increment-in-place step (N-6) needs this so two concurrent postings to
   * the same `(period_id, account_id, cost_center_id)` triple serialize
   * correctly, the same reasoning as `NumberingService.allocate()`'s row
   * lock on `set_numbering_series`. Requires an `EntityManager` (not
   * optional) — a lock only means something inside a transaction.
   */
  async findOneForUpdate(
    periodId: string,
    accountId: string,
    costCenterId: string | null,
    manager: EntityManager,
  ): Promise<GlPeriodAccountTotalEntity | null> {
    return manager.getRepository(GlPeriodAccountTotalEntity).findOne({
      where: { periodId, accountId, costCenterId: costCenterId ?? IsNull() },
      lock: { mode: "pessimistic_write" },
    });
  }

  async create(
    data: Partial<GlPeriodAccountTotalEntity>,
    manager: EntityManager,
  ): Promise<GlPeriodAccountTotalEntity> {
    const repo = manager.getRepository(GlPeriodAccountTotalEntity);
    return repo.save(repo.create(data));
  }

  async save(entity: GlPeriodAccountTotalEntity, manager: EntityManager): Promise<GlPeriodAccountTotalEntity> {
    return manager.getRepository(GlPeriodAccountTotalEntity).save(entity);
  }
}
