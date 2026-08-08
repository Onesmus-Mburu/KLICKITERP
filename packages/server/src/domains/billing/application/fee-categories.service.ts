import { Injectable } from "@nestjs/common";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { GlAccountRepository } from "../../../accounting";
import { BillFeeCategoryEntity } from "../domain/bill-fee-category.entity";
import { BillFeeCategoryRepository } from "../infrastructure/bill-fee-category.repository";

export interface CreateFeeCategoryInput {
  name: string;
  glIncomeAccountId: string;
  taxable?: boolean;
  priority?: number;
}

export interface UpdateFeeCategoryInput {
  name?: string;
  glIncomeAccountId?: string;
  taxable?: boolean;
  priority?: number;
}

/**
 * CRUD for `bill_fee_category` — straightforward per the task brief.
 * `glIncomeAccountId` is validated to resolve to a real `gl_account` (via
 * `GlAccountRepository`, imported through `accounting`'s public barrel) on
 * both create and update, mirroring `ChartOfAccountsService`'s own
 * parent-account existence check — the FK itself would catch this at INSERT
 * time regardless, but a pre-check gives a clearer, earlier error.
 */
@Injectable()
export class FeeCategoriesService {
  constructor(
    private readonly feeCategoryRepository: BillFeeCategoryRepository,
    private readonly glAccountRepository: GlAccountRepository,
  ) {}

  async create(input: CreateFeeCategoryInput, actorId: string | null): Promise<BillFeeCategoryEntity> {
    if (await this.feeCategoryRepository.findByName(input.name)) {
      throw new ConflictException(`bill_fee_category name already in use: ${input.name}`);
    }
    await this.glAccountRepository.findByIdOrFail(input.glIncomeAccountId);

    return this.feeCategoryRepository.create({
      name: input.name,
      glIncomeAccountId: input.glIncomeAccountId,
      taxable: input.taxable ?? false,
      priority: input.priority ?? 0,
      isActive: true,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async findByIdOrFail(id: string): Promise<BillFeeCategoryEntity> {
    return this.feeCategoryRepository.findByIdOrFail(id);
  }

  async list(): Promise<BillFeeCategoryEntity[]> {
    return this.feeCategoryRepository.list();
  }

  async update(id: string, changes: UpdateFeeCategoryInput, actorId: string | null): Promise<BillFeeCategoryEntity> {
    const category = await this.feeCategoryRepository.findByIdOrFail(id);
    if (changes.glIncomeAccountId !== undefined) {
      await this.glAccountRepository.findByIdOrFail(changes.glIncomeAccountId);
      category.glIncomeAccountId = changes.glIncomeAccountId;
    }
    if (changes.name !== undefined) category.name = changes.name;
    if (changes.taxable !== undefined) category.taxable = changes.taxable;
    if (changes.priority !== undefined) category.priority = changes.priority;
    category.updatedBy = actorId;
    return this.feeCategoryRepository.save(category);
  }

  async deactivate(id: string, actorId: string | null): Promise<BillFeeCategoryEntity> {
    const category = await this.feeCategoryRepository.findByIdOrFail(id);
    category.isActive = false;
    category.updatedBy = actorId;
    return this.feeCategoryRepository.save(category);
  }

  async activate(id: string, actorId: string | null): Promise<BillFeeCategoryEntity> {
    const category = await this.feeCategoryRepository.findByIdOrFail(id);
    category.isActive = true;
    category.updatedBy = actorId;
    return this.feeCategoryRepository.save(category);
  }
}
