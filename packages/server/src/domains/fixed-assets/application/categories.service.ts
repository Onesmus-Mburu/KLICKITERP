import { Injectable } from "@nestjs/common";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { GlAccountRepository } from "../../../accounting";
import { FaCategoryEntity, FaCategoryMethod } from "../domain/fa-category.entity";
import { FaCategoryRepository } from "../infrastructure/fa-category.repository";

const DEFAULT_RESIDUAL_PCT = "0.0000";

/** Postgres unique_violation SQLSTATE — see `DisposalService`/`BankAccountsService` for the same pattern. */
const PG_UNIQUE_VIOLATION = "23505";

export interface CreateFaCategoryInput {
  name: string;
  method: FaCategoryMethod;
  lifeMonths: number;
  /** Required (and must be > 0) when `method='RB'` — see `assertRatePresentForRb()`. */
  rate?: string | null;
  /** Fraction 0..1, e.g. "0.1000" = 10%. Defaults to 0 if omitted. */
  residualPct?: string;
  glCostAccountId: string;
  glAccumDepAccountId: string;
  glDepExpenseAccountId: string;
}

export interface UpdateFaCategoryInput {
  name?: string;
  method?: FaCategoryMethod;
  lifeMonths?: number;
  rate?: string | null;
  residualPct?: string;
  glCostAccountId?: string;
  glAccumDepAccountId?: string;
  glDepExpenseAccountId?: string;
}

/**
 * CRUD for `fa_category` — the depreciation-policy bucket every `fa_asset`
 * belongs to. **Requires all 3 GL account mappings at creation** (cost/
 * accum-dep/dep-expense — the entity's own NOT NULL FKs already enforce this
 * at the DB layer; this service validates each referenced `gl_account`
 * actually exists BEFORE the insert, so a bad id fails with a clear
 * `NotFoundException` rather than a raw FK-violation). **BR-FA-01-adjacent
 * defense**: `residual_pct` must be between 0 and 1 inclusive (the DDL gives
 * this column no CHECK constraint of its own — see `FaCategoryEntity`'s doc
 * comment — so this is this service's own defense-in-depth, ahead of the
 * depreciation engine ever computing a nonsensical residual value from it).
 * `rate` is required (and must be > 0) whenever `method='RB'` — same
 * service-layer defense the entity's own doc comment flags as not
 * DB-enforced.
 */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly categoryRepository: FaCategoryRepository,
    private readonly glAccountRepository: GlAccountRepository,
  ) {}

  async create(input: CreateFaCategoryInput, actorId: string | null): Promise<FaCategoryEntity> {
    const residualPct = input.residualPct ?? DEFAULT_RESIDUAL_PCT;
    this.assertResidualPctInRange(residualPct);
    this.assertRatePresentForRb(input.method, input.rate ?? null);
    if (input.lifeMonths <= 0) {
      throw new ValidationException("fa_category.life_months must be > 0");
    }

    await this.glAccountRepository.findByIdOrFail(input.glCostAccountId);
    await this.glAccountRepository.findByIdOrFail(input.glAccumDepAccountId);
    await this.glAccountRepository.findByIdOrFail(input.glDepExpenseAccountId);

    try {
      return await this.categoryRepository.create({
        name: input.name,
        method: input.method,
        lifeMonths: input.lifeMonths,
        rate: input.method === "RB" ? (input.rate ?? null) : null,
        residualPct,
        glCostAccountId: input.glCostAccountId,
        glAccumDepAccountId: input.glAccumDepAccountId,
        glDepExpenseAccountId: input.glDepExpenseAccountId,
        createdBy: actorId,
        updatedBy: actorId,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`fa_category: name "${input.name}" already exists`);
      }
      throw error;
    }
  }

  async update(id: string, changes: UpdateFaCategoryInput, actorId: string | null): Promise<FaCategoryEntity> {
    const category = await this.categoryRepository.findByIdOrFail(id);

    const nextMethod = changes.method ?? category.method;
    const nextRate = changes.rate !== undefined ? changes.rate : category.rate;
    this.assertRatePresentForRb(nextMethod, nextRate);

    if (changes.residualPct !== undefined) {
      this.assertResidualPctInRange(changes.residualPct);
      category.residualPct = changes.residualPct;
    }
    if (changes.lifeMonths !== undefined) {
      if (changes.lifeMonths <= 0) {
        throw new ValidationException("fa_category.life_months must be > 0");
      }
      category.lifeMonths = changes.lifeMonths;
    }
    if (changes.name !== undefined) category.name = changes.name;
    if (changes.method !== undefined) category.method = changes.method;
    if (changes.rate !== undefined) category.rate = changes.rate;
    if (changes.glCostAccountId !== undefined) {
      await this.glAccountRepository.findByIdOrFail(changes.glCostAccountId);
      category.glCostAccountId = changes.glCostAccountId;
    }
    if (changes.glAccumDepAccountId !== undefined) {
      await this.glAccountRepository.findByIdOrFail(changes.glAccumDepAccountId);
      category.glAccumDepAccountId = changes.glAccumDepAccountId;
    }
    if (changes.glDepExpenseAccountId !== undefined) {
      await this.glAccountRepository.findByIdOrFail(changes.glDepExpenseAccountId);
      category.glDepExpenseAccountId = changes.glDepExpenseAccountId;
    }

    category.updatedBy = actorId;
    try {
      return await this.categoryRepository.save(category);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`fa_category: name "${category.name}" already exists`);
      }
      throw error;
    }
  }

  async findByIdOrFail(id: string): Promise<FaCategoryEntity> {
    return this.categoryRepository.findByIdOrFail(id);
  }

  async list(): Promise<FaCategoryEntity[]> {
    return this.categoryRepository.list();
  }

  private assertResidualPctInRange(residualPct: string): void {
    const value = Number(residualPct);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new ValidationException(`fa_category.residual_pct must be between 0 and 1 (got ${residualPct})`);
    }
  }

  private assertRatePresentForRb(method: FaCategoryMethod, rate: string | null): void {
    if (method === "RB" && (rate === null || Number(rate) <= 0)) {
      throw new ValidationException("fa_category.rate is required and must be > 0 when method='RB'");
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: string; driverError?: { code?: string } })?.code ??
    (error as { driverError?: { code?: string } })?.driverError?.code;
  return code === PG_UNIQUE_VIOLATION;
}
