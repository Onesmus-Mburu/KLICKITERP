import { Injectable } from "@nestjs/common";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { Money } from "../../../shared/money/money";
import { GlAccountRepository } from "../../../accounting";
import { BillConcessionCalc, BillConcessionKind, BillConcessionSchemeEntity } from "../domain/bill-concession-scheme.entity";
import { BillConcessionSchemeRepository } from "../infrastructure/bill-concession-scheme.repository";

export interface CreateConcessionSchemeInput {
  name: string;
  kind: BillConcessionKind;
  calc: BillConcessionCalc;
  value: Money;
  categoryScope?: string[] | null;
  allowsStacking?: boolean;
  glAccountId: string;
}

export interface UpdateConcessionSchemeInput {
  name?: string;
  kind?: BillConcessionKind;
  calc?: BillConcessionCalc;
  value?: Money;
  categoryScope?: string[] | null;
  allowsStacking?: boolean;
  glAccountId?: string;
}

/**
 * CRUD for `bill_concession_scheme` — straightforward per the task brief.
 * `glAccountId` is the contra-income (WAIVER/DISCOUNT, P-02) or expense
 * (school-funded SCHOLARSHIP/BURSARY, P-04) account `InvoicingService`/
 * `ConcessionsService` debit when a concession backed by this scheme is
 * posted — validated to resolve to a real `gl_account` on create/update, same
 * pattern as `FeeCategoriesService`.
 */
@Injectable()
export class ConcessionSchemesService {
  constructor(
    private readonly schemeRepository: BillConcessionSchemeRepository,
    private readonly glAccountRepository: GlAccountRepository,
  ) {}

  async create(input: CreateConcessionSchemeInput, actorId: string | null): Promise<BillConcessionSchemeEntity> {
    if (await this.schemeRepository.findByName(input.name)) {
      throw new ConflictException(`bill_concession_scheme name already in use: ${input.name}`);
    }
    await this.glAccountRepository.findByIdOrFail(input.glAccountId);

    return this.schemeRepository.create({
      name: input.name,
      kind: input.kind,
      calc: input.calc,
      value: input.value,
      categoryScope: input.categoryScope ?? null,
      allowsStacking: input.allowsStacking ?? false,
      glAccountId: input.glAccountId,
      isActive: true,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async findByIdOrFail(id: string): Promise<BillConcessionSchemeEntity> {
    return this.schemeRepository.findByIdOrFail(id);
  }

  async list(): Promise<BillConcessionSchemeEntity[]> {
    return this.schemeRepository.list();
  }

  async update(id: string, changes: UpdateConcessionSchemeInput, actorId: string | null): Promise<BillConcessionSchemeEntity> {
    const scheme = await this.schemeRepository.findByIdOrFail(id);
    if (changes.glAccountId !== undefined) {
      await this.glAccountRepository.findByIdOrFail(changes.glAccountId);
      scheme.glAccountId = changes.glAccountId;
    }
    if (changes.name !== undefined) scheme.name = changes.name;
    if (changes.kind !== undefined) scheme.kind = changes.kind;
    if (changes.calc !== undefined) scheme.calc = changes.calc;
    if (changes.value !== undefined) scheme.value = changes.value;
    if (changes.categoryScope !== undefined) scheme.categoryScope = changes.categoryScope;
    if (changes.allowsStacking !== undefined) scheme.allowsStacking = changes.allowsStacking;
    scheme.updatedBy = actorId;
    return this.schemeRepository.save(scheme);
  }

  async deactivate(id: string, actorId: string | null): Promise<BillConcessionSchemeEntity> {
    const scheme = await this.schemeRepository.findByIdOrFail(id);
    scheme.isActive = false;
    scheme.updatedBy = actorId;
    return this.schemeRepository.save(scheme);
  }

  async activate(id: string, actorId: string | null): Promise<BillConcessionSchemeEntity> {
    const scheme = await this.schemeRepository.findByIdOrFail(id);
    scheme.isActive = true;
    scheme.updatedBy = actorId;
    return this.schemeRepository.save(scheme);
  }
}
