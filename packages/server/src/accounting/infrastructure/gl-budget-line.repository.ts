import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, IsNull, Repository } from "typeorm";
import { NotFoundException } from "../../shared/exceptions/not-found.exception";
import { GlBudgetLineEntity } from "../domain/gl-budget-line.entity";

@Injectable()
export class GlBudgetLineRepository {
  constructor(
    @InjectRepository(GlBudgetLineEntity)
    private readonly repo: Repository<GlBudgetLineEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<GlBudgetLineEntity | null> {
    return (manager?.getRepository(GlBudgetLineEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<GlBudgetLineEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("GlBudgetLine", id);
    return row;
  }

  async listByBudget(budgetId: string, manager?: EntityManager): Promise<GlBudgetLineEntity[]> {
    return (manager?.getRepository(GlBudgetLineEntity) ?? this.repo).find({ where: { budgetId } });
  }

  async findByBudgetAccountCostCenter(
    budgetId: string,
    accountId: string,
    costCenterId: string | null,
    manager?: EntityManager,
  ): Promise<GlBudgetLineEntity | null> {
    return (manager?.getRepository(GlBudgetLineEntity) ?? this.repo).findOne({
      where: { budgetId, accountId, costCenterId: costCenterId ?? IsNull() },
    });
  }

  async create(data: Partial<GlBudgetLineEntity>, manager: EntityManager): Promise<GlBudgetLineEntity> {
    const repo = manager.getRepository(GlBudgetLineEntity);
    return repo.save(repo.create(data));
  }

  async save(entity: GlBudgetLineEntity, manager?: EntityManager): Promise<GlBudgetLineEntity> {
    return (manager?.getRepository(GlBudgetLineEntity) ?? this.repo).save(entity);
  }

  /** `BudgetsService.removeLine()`'s only caller — `gl_budget_line` is not writer-guarded, an ordinary DELETE. */
  async delete(id: string, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(GlBudgetLineEntity) ?? this.repo).delete(id);
  }
}
