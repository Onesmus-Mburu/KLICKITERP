import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { RptScheduleEntity } from "../domain/rpt-schedule.entity";

/**
 * Plain repository wrapper for `rpt_schedule`. Module 18 (Reporting)
 * **foundation pass only** — the scheduler/dispatcher that reads
 * `findActive()`'s result set on a timer is a later pass's concern, see
 * docs/phase-5/PROGRESS.md.
 */
@Injectable()
export class RptScheduleRepository {
  constructor(
    @InjectRepository(RptScheduleEntity)
    private readonly repo: Repository<RptScheduleEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<RptScheduleEntity | null> {
    return (manager?.getRepository(RptScheduleEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<RptScheduleEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("RptSchedule", id);
    return row;
  }

  async listByOwner(ownerUserId: string, manager?: EntityManager): Promise<RptScheduleEntity[]> {
    return (manager?.getRepository(RptScheduleEntity) ?? this.repo).find({
      where: { ownerUserId },
      order: { reportCode: "ASC" },
    });
  }

  /** Every schedule with `is_active = true` — the next pass's scheduler poll query, backed by `ix_rpt_schedule_active_p`. */
  async findActive(manager?: EntityManager): Promise<RptScheduleEntity[]> {
    return (manager?.getRepository(RptScheduleEntity) ?? this.repo).find({
      where: { isActive: true },
      order: { reportCode: "ASC" },
    });
  }

  async create(data: Partial<RptScheduleEntity>, manager?: EntityManager): Promise<RptScheduleEntity> {
    const repo = manager?.getRepository(RptScheduleEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: RptScheduleEntity, manager?: EntityManager): Promise<RptScheduleEntity> {
    return (manager?.getRepository(RptScheduleEntity) ?? this.repo).save(entity);
  }

  async delete(id: string, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(RptScheduleEntity) ?? this.repo).delete({ id });
  }
}
