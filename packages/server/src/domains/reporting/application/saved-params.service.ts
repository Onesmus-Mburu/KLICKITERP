import { Injectable } from "@nestjs/common";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { RptSavedParamsEntity } from "../domain/rpt-saved-params.entity";
import { RptSavedParamsRepository } from "../infrastructure/rpt-saved-params.repository";

export interface CreateSavedParamsInput {
  userId: string;
  reportCode: string;
  name: string;
  params: Record<string, unknown>;
}

export interface UpdateSavedParamsInput {
  name?: string;
  params?: Record<string, unknown>;
}

/**
 * CRUD for `rpt_saved_params` — a user's own named, reusable filter/parameter
 * set for a given report (e.g. "My Term 2 Class 4 Fee Statement"), per the
 * task brief. Every read/update/delete is scoped to the caller's own
 * `userId` — `rpt_saved_params` carries no sharing/visibility column at all
 * (see the entity's own doc comment), so "not mine" and "doesn't exist" are
 * deliberately indistinguishable from the outside: `get()`/`update()`/
 * `delete()` all raise the same `NotFoundException` for a saved-params row
 * that exists but belongs to a different user as for one that doesn't exist
 * at all, rather than a `403`, so a caller can never probe for another
 * user's saved report names by id.
 *
 * The `uq_rpt_saved_params_user_report_name` unique index (entity doc
 * comment) is DB-enforced, not re-checked here — `create()` lets a duplicate
 * `(userId, reportCode, name)` insert surface as whatever constraint-
 * violation translation the shared TypeORM error interceptor already
 * provides for every other unique-index violation in this codebase, the same
 * "DB is the source of truth for this invariant" treatment
 * `BillInvoiceRepository`/`GlAccountRepository`'s own unique columns get.
 */
@Injectable()
export class SavedParamsService {
  constructor(private readonly repository: RptSavedParamsRepository) {}

  async create(input: CreateSavedParamsInput): Promise<RptSavedParamsEntity> {
    return this.repository.create({
      userId: input.userId,
      reportCode: input.reportCode,
      name: input.name,
      params: input.params,
    });
  }

  async get(id: string, userId: string): Promise<RptSavedParamsEntity> {
    const row = await this.repository.findByIdOrFail(id);
    this.assertOwnedBy(row, id, userId);
    return row;
  }

  async listMine(userId: string): Promise<RptSavedParamsEntity[]> {
    return this.repository.listByUser(userId);
  }

  async update(id: string, userId: string, input: UpdateSavedParamsInput): Promise<RptSavedParamsEntity> {
    const row = await this.repository.findByIdOrFail(id);
    this.assertOwnedBy(row, id, userId);
    if (input.name !== undefined) row.name = input.name;
    if (input.params !== undefined) row.params = input.params;
    return this.repository.save(row);
  }

  async delete(id: string, userId: string): Promise<void> {
    const row = await this.repository.findByIdOrFail(id);
    this.assertOwnedBy(row, id, userId);
    await this.repository.delete(id);
  }

  /** See class doc comment — cross-user access is reported identically to "not found". */
  private assertOwnedBy(row: RptSavedParamsEntity, id: string, userId: string): void {
    if (row.userId !== userId) {
      throw new NotFoundException("RptSavedParams", id);
    }
  }
}
