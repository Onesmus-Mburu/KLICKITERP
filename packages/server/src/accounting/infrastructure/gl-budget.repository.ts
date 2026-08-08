import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../shared/exceptions/not-found.exception";
import { GlBudgetEntity } from "../domain/gl-budget.entity";

@Injectable()
export class GlBudgetRepository {
  constructor(
    @InjectRepository(GlBudgetEntity)
    private readonly repo: Repository<GlBudgetEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<GlBudgetEntity | null> {
    return (manager?.getRepository(GlBudgetEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<GlBudgetEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("GlBudget", id);
    return row;
  }

  /** The `uq_gl_budget_active_p`-backed lookup — at most one ACTIVE budget per fiscal year. */
  async findActiveForFiscalYear(fiscalYearId: string, manager?: EntityManager): Promise<GlBudgetEntity | null> {
    return (manager?.getRepository(GlBudgetEntity) ?? this.repo).findOne({
      where: { fiscalYearId, status: "ACTIVE" },
    });
  }

  async listByFiscalYear(fiscalYearId: string, manager?: EntityManager): Promise<GlBudgetEntity[]> {
    return (manager?.getRepository(GlBudgetEntity) ?? this.repo).find({
      where: { fiscalYearId },
      order: { createdAt: "DESC" },
    });
  }

  async create(data: Partial<GlBudgetEntity>, manager: EntityManager): Promise<GlBudgetEntity> {
    const repo = manager.getRepository(GlBudgetEntity);
    return repo.save(repo.create(data));
  }

  async save(entity: GlBudgetEntity, manager?: EntityManager): Promise<GlBudgetEntity> {
    return (manager?.getRepository(GlBudgetEntity) ?? this.repo).save(entity);
  }
}
