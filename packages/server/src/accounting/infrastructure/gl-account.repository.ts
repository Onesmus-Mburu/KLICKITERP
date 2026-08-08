import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, FindOptionsWhere, IsNull, Repository } from "typeorm";
import { NotFoundException } from "../../shared/exceptions/not-found.exception";
import { GlAccountClass, GlAccountControlDomain, GlAccountEntity } from "../domain/gl-account.entity";

export interface ListGlAccountsFilter {
  class?: GlAccountClass;
  isActive?: boolean;
  parentId?: string | null;
}

/**
 * Plain repository wrapper — no services yet (that's the next pass, see
 * `docs/phase-5/PROGRESS.md`'s Module 7 row). `findByCode()` is the finder
 * a future `ChartOfAccountsService`/`PostingService` will use to resolve a
 * posting map's account codes to ids.
 */
@Injectable()
export class GlAccountRepository {
  constructor(
    @InjectRepository(GlAccountEntity)
    private readonly repo: Repository<GlAccountEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<GlAccountEntity | null> {
    return (manager?.getRepository(GlAccountEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<GlAccountEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("GlAccount", id);
    return row;
  }

  async findByCode(code: string, manager?: EntityManager): Promise<GlAccountEntity | null> {
    return (manager?.getRepository(GlAccountEntity) ?? this.repo).findOne({ where: { code } });
  }

  async findByCodeOrFail(code: string, manager?: EntityManager): Promise<GlAccountEntity> {
    const row = await this.findByCode(code, manager);
    if (!row) throw new NotFoundException("GlAccount", code);
    return row;
  }

  /**
   * Every `gl_account` row tagged with a given `control_domain` (e.g.
   * `AR_STUDENT`/`AR_SPONSOR`) — added for Module 9 (Billing)'s PASS A
   * control-account resolution (`domains/billing/application/gl-control-accounts.util.ts`):
   * the seeded CoA is expected to carry exactly one active, postable account
   * per control domain, and that caller is responsible for validating that
   * invariant (a config error otherwise) — this method just returns the raw
   * candidate set, active or not, postable or not, so the caller can produce
   * a precise error message.
   */
  async findByControlDomain(domain: GlAccountControlDomain, manager?: EntityManager): Promise<GlAccountEntity[]> {
    return (manager?.getRepository(GlAccountEntity) ?? this.repo).find({ where: { controlDomain: domain } });
  }

  async findChildren(parentId: string, manager?: EntityManager): Promise<GlAccountEntity[]> {
    return (manager?.getRepository(GlAccountEntity) ?? this.repo).find({ where: { parentId } });
  }

  async list(filter: ListGlAccountsFilter = {}, manager?: EntityManager): Promise<GlAccountEntity[]> {
    const where: FindOptionsWhere<GlAccountEntity> = {
      ...(filter.class ? { class: filter.class } : {}),
      ...(filter.isActive !== undefined ? { isActive: filter.isActive } : {}),
      ...(filter.parentId !== undefined ? { parentId: filter.parentId ?? IsNull() } : {}),
    };
    return (manager?.getRepository(GlAccountEntity) ?? this.repo).find({
      where,
      order: { code: "ASC" },
    });
  }

  async create(data: Partial<GlAccountEntity>, manager: EntityManager): Promise<GlAccountEntity> {
    const repo = manager.getRepository(GlAccountEntity);
    return repo.save(repo.create(data));
  }

  async save(entity: GlAccountEntity, manager?: EntityManager): Promise<GlAccountEntity> {
    return (manager?.getRepository(GlAccountEntity) ?? this.repo).save(entity);
  }

  /** BR-ACC-01 support: whether any gl_journal_line references this account (a future ChartOfAccountsService's pre-check before calling deactivate/delete). */
  async hasPostings(accountId: string, manager?: EntityManager): Promise<boolean> {
    const source = manager ?? this.repo.manager;
    const rows: Array<{ exists: boolean }> = await source.query(
      `SELECT EXISTS(SELECT 1 FROM app.gl_journal_line WHERE account_id = $1) AS exists`,
      [accountId],
    );
    return rows[0]?.exists ?? false;
  }

  /**
   * Hard DELETE — `ChartOfAccountsService.remove()`'s only caller. Never
   * bypasses `trg_gl_account_deactivation_only` (migration `0060`); that
   * trigger is the real enforcement, this just issues the DELETE and lets
   * the service layer translate a rejection into `ConflictException`.
   */
  async delete(id: string, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(GlAccountEntity) ?? this.repo).delete(id);
  }
}
