import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, LessThanOrEqual, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ExpRecurringEntity } from "../domain/exp-recurring.entity";

/**
 * Plain repository wrapper for `exp_recurring`, plus `findDueForRun()` — the
 * forward-looking finder the next pass's manual "run due templates now"
 * endpoint needs (real cron scheduling is out of scope for this codebase,
 * see `ExpRecurringEntity`'s own doc comment): every active template whose
 * `next_run_on` has arrived, as of the given date.
 */
@Injectable()
export class ExpRecurringRepository {
  constructor(
    @InjectRepository(ExpRecurringEntity)
    private readonly repo: Repository<ExpRecurringEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<ExpRecurringEntity | null> {
    return (manager?.getRepository(ExpRecurringEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<ExpRecurringEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("ExpRecurring", id);
    return row;
  }

  /** Active templates whose `next_run_on <= asOfDate` (YYYY-MM-DD), ordered oldest-due-first. */
  async findDueForRun(asOfDate: string, manager?: EntityManager): Promise<ExpRecurringEntity[]> {
    return (manager?.getRepository(ExpRecurringEntity) ?? this.repo).find({
      where: { isActive: true, nextRunOn: LessThanOrEqual(asOfDate) },
      order: { nextRunOn: "ASC" },
    });
  }

  async listAll(manager?: EntityManager): Promise<ExpRecurringEntity[]> {
    return (manager?.getRepository(ExpRecurringEntity) ?? this.repo).find();
  }

  async create(data: Partial<ExpRecurringEntity>, manager?: EntityManager): Promise<ExpRecurringEntity> {
    const repo = manager?.getRepository(ExpRecurringEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: ExpRecurringEntity, manager?: EntityManager): Promise<ExpRecurringEntity> {
    return (manager?.getRepository(ExpRecurringEntity) ?? this.repo).save(entity);
  }
}
