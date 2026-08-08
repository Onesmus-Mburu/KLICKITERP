import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { ConflictException } from "../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../shared/exceptions/validation.exception";
import { GlAccountClass, GlAccountControlDomain, GlAccountEntity } from "../domain/gl-account.entity";
import { GlAccountRepository, ListGlAccountsFilter } from "../infrastructure/gl-account.repository";

export interface CreateGlAccountInput {
  code: string;
  name: string;
  class: GlAccountClass;
  parentId?: string | null;
  isPostable: boolean;
  isControl?: boolean;
  controlDomain?: GlAccountControlDomain | null;
  taxTreatment?: string | null;
}

/** Fields `update()` refuses to change once an account exists — see class doc comment "locked fields". */
export interface UpdateGlAccountInput {
  name?: string;
  isControl?: boolean;
  controlDomain?: GlAccountControlDomain | null;
  taxTreatment?: string | null;
}

/**
 * Plain data shape, deliberately NOT `extends GlAccountEntity` — the entity
 * is a class (its `BaseEntity`/`MutableBaseEntity` ancestors carry methods
 * like `assignId()`), so a spread-built plain object (`{ ...account,
 * children: [] }`) structurally satisfies this interface but not the class
 * itself. `getTree()` only ever needs the account's own columns plus the
 * assembled `children` array.
 */
export interface GlAccountTreeNode {
  id: string;
  code: string;
  name: string;
  class: GlAccountClass;
  parentId: string | null;
  isPostable: boolean;
  isControl: boolean;
  controlDomain: GlAccountControlDomain | null;
  isActive: boolean;
  taxTreatment: string | null;
  children: GlAccountTreeNode[];
}

/**
 * CRUD for `gl_account`, the chart of accounts.
 *
 * **Locked fields (a documented judgement call — the task brief only names
 * `code`/`class` as examples)**: `update()` accepts only `name`,
 * `isControl`, `controlDomain`, `taxTreatment`. `code` and `class` are
 * identity fields other systems/reports key off; `parentId` and
 * `isPostable` are structural — changing either after postings may exist
 * against the account could silently invalidate `ck_gl_account_postable_needs_parent`'s
 * intent ("roots are headers") or move a leaf's historical activity under a
 * different branch of the hierarchy. An account that needs to move in the
 * tree or change its postable-ness is deactivated and recreated, not edited
 * in place.
 *
 * `deactivate()` (soft, `is_active=false`) is always the preferred path
 * (BR-ACC-01). `remove()` (hard DELETE) is only ever safe for an account
 * that was created by mistake and never posted to — `trg_gl_account_deactivation_only`
 * (migration `0060`) is the real enforcement; this service just translates
 * that trigger's rejection into a client-facing `ConflictException` pointing
 * at `deactivate()` instead.
 */
@Injectable()
export class ChartOfAccountsService {
  constructor(
    private readonly accountRepository: GlAccountRepository,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async create(input: CreateGlAccountInput, actorId: string | null): Promise<GlAccountEntity> {
    if (await this.accountRepository.findByCode(input.code)) {
      throw new ConflictException(`gl_account code already in use: ${input.code}`);
    }
    // Defense-in-depth mirroring ck_gl_account_postable_needs_parent.
    if (input.isPostable && !input.parentId) {
      throw new ValidationException(
        "A postable account must have a parent — roots are headers (mirrors ck_gl_account_postable_needs_parent)",
      );
    }
    if (input.parentId) {
      await this.accountRepository.findByIdOrFail(input.parentId);
    }

    return this.accountRepository.create(
      {
        code: input.code,
        name: input.name,
        class: input.class,
        parentId: input.parentId ?? null,
        isPostable: input.isPostable,
        isControl: input.isControl ?? false,
        controlDomain: input.controlDomain ?? null,
        isActive: true,
        taxTreatment: input.taxTreatment ?? null,
        createdBy: actorId,
        updatedBy: actorId,
      },
      this.dataSource.manager,
    );
  }

  async findByIdOrFail(id: string): Promise<GlAccountEntity> {
    return this.accountRepository.findByIdOrFail(id);
  }

  async list(filter: ListGlAccountsFilter = {}): Promise<GlAccountEntity[]> {
    return this.accountRepository.list(filter);
  }

  async update(id: string, changes: UpdateGlAccountInput, actorId: string | null): Promise<GlAccountEntity> {
    const account = await this.accountRepository.findByIdOrFail(id);
    if (changes.name !== undefined) account.name = changes.name;
    if (changes.isControl !== undefined) account.isControl = changes.isControl;
    if (changes.controlDomain !== undefined) account.controlDomain = changes.controlDomain;
    if (changes.taxTreatment !== undefined) account.taxTreatment = changes.taxTreatment;
    account.updatedBy = actorId;
    return this.accountRepository.save(account);
  }

  /** The always-preferred path (BR-ACC-01) — soft, reversible, never rejected by the DB trigger. */
  async deactivate(id: string, actorId: string | null): Promise<GlAccountEntity> {
    const account = await this.accountRepository.findByIdOrFail(id);
    account.isActive = false;
    account.updatedBy = actorId;
    return this.accountRepository.save(account);
  }

  async activate(id: string, actorId: string | null): Promise<GlAccountEntity> {
    const account = await this.accountRepository.findByIdOrFail(id);
    account.isActive = true;
    account.updatedBy = actorId;
    return this.accountRepository.save(account);
  }

  /** Hard DELETE — see class doc comment. Rethrows `trg_gl_account_deactivation_only`'s rejection as `ConflictException`. */
  async remove(id: string): Promise<void> {
    await this.accountRepository.findByIdOrFail(id);
    try {
      await this.accountRepository.delete(id);
    } catch (error) {
      if (isDeactivationOnlyRejection(error)) {
        throw new ConflictException(
          `gl_account ${id} has postings and cannot be deleted — use deactivate() instead (BR-ACC-01)`,
        );
      }
      throw error;
    }
  }

  /** Assembles the parent/child hierarchy for UI display — one pass over the full (usually small) chart of accounts. */
  async getTree(): Promise<GlAccountTreeNode[]> {
    const all = await this.accountRepository.list();
    const nodes = new Map<string, GlAccountTreeNode>(all.map((account) => [account.id, { ...account, children: [] }]));
    const roots: GlAccountTreeNode[] = [];

    for (const account of all) {
      const node = nodes.get(account.id)!;
      if (account.parentId) {
        const parent = nodes.get(account.parentId);
        if (parent) {
          parent.children.push(node);
          continue;
        }
      }
      roots.push(node);
    }

    return roots;
  }
}

/** `trg_gl_account_deactivation_only` (migration `0060`) raises with ERRCODE 23514 and a message containing "BR-ACC-01". */
function isDeactivationOnlyRejection(error: unknown): boolean {
  const message = (error as { message?: string })?.message ?? "";
  return /BR-ACC-01/.test(message);
}
