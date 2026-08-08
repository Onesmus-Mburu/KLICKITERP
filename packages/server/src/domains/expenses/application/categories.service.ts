import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { GlAccountRepository } from "../../../accounting";
import { ExpCategoryEntity } from "../domain/exp-category.entity";
import { ExpCategoryRepository } from "../infrastructure/exp-category.repository";

export interface CreateCategoryInput {
  name: string;
  parentId?: string | null;
  glExpenseAccountId: string;
  budgetRequired?: boolean;
  isActive?: boolean;
}

export interface UpdateCategoryInput {
  name?: string;
  parentId?: string | null;
  glExpenseAccountId?: string;
  budgetRequired?: boolean;
  isActive?: boolean;
}

/**
 * CRUD for `exp_category`. `create()`/`update()` enforce BR-EXP-01's "every
 * expense maps to a category with a valid GL expense account" half — the
 * DDL's own NOT NULL FK on `gl_expense_account_id` guarantees a *referenced*
 * account exists, but not that it is a real, active, postable EXPENSE-class
 * leaf (a header/inactive/wrong-class account would still satisfy the bare
 * FK) — so this service re-validates `class='EXPENSE'`/`is_postable`/
 * `is_active` against `GlAccountRepository`, the same defense-in-depth shape
 * `PostingService.post()`'s own account validation follows.
 *
 * `budget_required`'s OTHER half of BR-EXP-01 (an actual budget-availability
 * check) is deliberately NOT enforced here — it only applies once a real
 * expense amount exists (a voucher/claim line), so it lives in
 * `VouchersService.submit()`/`onApprovalDecided()` instead, per this
 * module's own honest-simplification precedent (`RequisitionsService`,
 * Module 12).
 */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly categoryRepository: ExpCategoryRepository,
    private readonly glAccountRepository: GlAccountRepository,
  ) {}

  async create(input: CreateCategoryInput, actorId: string | null, em?: EntityManager): Promise<ExpCategoryEntity> {
    await this.assertValidExpenseAccount(input.glExpenseAccountId, em);
    if (input.parentId) {
      await this.categoryRepository.findByIdOrFail(input.parentId, em);
    }
    return this.categoryRepository.create(
      {
        name: input.name,
        parentId: input.parentId ?? null,
        glExpenseAccountId: input.glExpenseAccountId,
        budgetRequired: input.budgetRequired ?? false,
        isActive: input.isActive ?? true,
        createdBy: actorId,
        updatedBy: actorId,
      },
      em,
    );
  }

  async findByIdOrFail(id: string, em?: EntityManager): Promise<ExpCategoryEntity> {
    return this.categoryRepository.findByIdOrFail(id, em);
  }

  async list(parentId?: string | null): Promise<ExpCategoryEntity[]> {
    if (parentId !== undefined) {
      return this.categoryRepository.listByParent(parentId);
    }
    return this.categoryRepository.listAll();
  }

  async update(id: string, changes: UpdateCategoryInput, actorId: string | null): Promise<ExpCategoryEntity> {
    const category = await this.categoryRepository.findByIdOrFail(id);
    if (changes.glExpenseAccountId !== undefined) {
      await this.assertValidExpenseAccount(changes.glExpenseAccountId);
      category.glExpenseAccountId = changes.glExpenseAccountId;
    }
    if (changes.name !== undefined) category.name = changes.name;
    if (changes.parentId !== undefined) {
      if (changes.parentId === id) {
        throw new ValidationException(`ExpCategory ${id} cannot be its own parent`);
      }
      if (changes.parentId) {
        await this.categoryRepository.findByIdOrFail(changes.parentId);
      }
      category.parentId = changes.parentId;
    }
    if (changes.budgetRequired !== undefined) category.budgetRequired = changes.budgetRequired;
    if (changes.isActive !== undefined) category.isActive = changes.isActive;
    category.updatedBy = actorId;
    return this.categoryRepository.save(category);
  }

  /** BR-EXP-01 — see class doc comment. */
  private async assertValidExpenseAccount(accountId: string, em?: EntityManager): Promise<void> {
    const account = await this.glAccountRepository.findByIdOrFail(accountId, em);
    if (account.class !== "EXPENSE") {
      throw new ValidationException(
        `BR-EXP-01: gl_account ${account.code} (class=${account.class}) is not an EXPENSE-class account`,
      );
    }
    if (!account.isPostable) {
      throw new ValidationException(`BR-EXP-01: gl_account ${account.code} is not postable (header account)`);
    }
    if (!account.isActive) {
      throw new ValidationException(`BR-EXP-01: gl_account ${account.code} is inactive`);
    }
  }
}
