import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { ConflictException } from "../../shared/exceptions/conflict.exception";
import { GlCostCenterEntity } from "../domain/gl-cost-center.entity";
import { GlCostCenterRepository } from "../infrastructure/gl-cost-center.repository";

export interface CreateCostCenterInput {
  code: string;
  name: string;
}

/** CRUD for `gl_cost_center` — the dimension `gl_journal_line`/`gl_period_account_total`/`gl_budget_line` optionally tag. */
@Injectable()
export class CostCentersService {
  constructor(
    private readonly costCenterRepository: GlCostCenterRepository,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async create(input: CreateCostCenterInput, actorId: string | null): Promise<GlCostCenterEntity> {
    if (await this.costCenterRepository.findByCode(input.code)) {
      throw new ConflictException(`gl_cost_center code already in use: ${input.code}`);
    }
    return this.costCenterRepository.create(
      { code: input.code, name: input.name, isActive: true, createdBy: actorId, updatedBy: actorId },
      this.dataSource.manager,
    );
  }

  async findByIdOrFail(id: string): Promise<GlCostCenterEntity> {
    return this.costCenterRepository.findByIdOrFail(id);
  }

  async list(activeOnly = false): Promise<GlCostCenterEntity[]> {
    return this.costCenterRepository.list(activeOnly);
  }

  async update(id: string, changes: { name?: string }, actorId: string | null): Promise<GlCostCenterEntity> {
    const costCenter = await this.costCenterRepository.findByIdOrFail(id);
    if (changes.name !== undefined) costCenter.name = changes.name;
    costCenter.updatedBy = actorId;
    return this.costCenterRepository.save(costCenter);
  }

  async deactivate(id: string, actorId: string | null): Promise<GlCostCenterEntity> {
    const costCenter = await this.costCenterRepository.findByIdOrFail(id);
    costCenter.isActive = false;
    costCenter.updatedBy = actorId;
    return this.costCenterRepository.save(costCenter);
  }

  async activate(id: string, actorId: string | null): Promise<GlCostCenterEntity> {
    const costCenter = await this.costCenterRepository.findByIdOrFail(id);
    costCenter.isActive = true;
    costCenter.updatedBy = actorId;
    return this.costCenterRepository.save(costCenter);
  }
}
