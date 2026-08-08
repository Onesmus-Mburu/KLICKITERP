import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BkpBackupRunEntity, BkpBackupRunKind } from "../domain/bkp-backup-run.entity";

export interface ListBackupRunsOptions {
  kind?: BkpBackupRunKind;
  status?: BkpBackupRunEntity["status"];
  limit?: number;
  offset?: number;
}

@Injectable()
export class BkpBackupRunRepository {
  constructor(
    @InjectRepository(BkpBackupRunEntity)
    private readonly repo: Repository<BkpBackupRunEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BkpBackupRunEntity | null> {
    return (manager?.getRepository(BkpBackupRunEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BkpBackupRunEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BkpBackupRun", id);
    return row;
  }

  async list(options: ListBackupRunsOptions, manager?: EntityManager): Promise<[BkpBackupRunEntity[], number]> {
    const repo = manager?.getRepository(BkpBackupRunEntity) ?? this.repo;
    return repo.findAndCount({
      where: {
        ...(options.kind ? { kind: options.kind } : {}),
        ...(options.status ? { status: options.status } : {}),
      },
      order: { startedAt: "DESC" },
      take: options.limit ?? 50,
      skip: options.offset ?? 0,
    });
  }

  /** `/ops` "last backup" badge (FR-BKP-005.1) — most recent SUCCESSFUL run, any kind. */
  async findLatest(manager?: EntityManager): Promise<BkpBackupRunEntity | null> {
    const repo = manager?.getRepository(BkpBackupRunEntity) ?? this.repo;
    return repo.findOne({ where: { status: "OK" }, order: { startedAt: "DESC" } });
  }

  /**
   * `BackupOrchestratorService.pruneOldBackups()`'s candidate set — every
   * SUCCESSFUL run of the given `kind`, newest first. Scoped to `status='OK'`
   * here (not left to the caller) since a `FAILED`/`RUNNING` run was never a
   * real recovery point and the GFS retention math
   * (`application/retention.util.ts`) only ever needs to reason about
   * completed backups. Scoped to ONE `kind` per call (always `'SCHEDULED'`
   * in practice — see `pruneOldBackups()`'s own doc comment for why
   * `MANUAL`/`PRE_UPDATE` runs deliberately opt out of GFS rotation).
   */
  async findForRetentionPruning(kind: BkpBackupRunKind, manager?: EntityManager): Promise<BkpBackupRunEntity[]> {
    const repo = manager?.getRepository(BkpBackupRunEntity) ?? this.repo;
    return repo.find({ where: { kind, status: "OK" }, order: { startedAt: "DESC" } });
  }

  async create(data: Partial<BkpBackupRunEntity>, manager?: EntityManager): Promise<BkpBackupRunEntity> {
    const repo = manager?.getRepository(BkpBackupRunEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BkpBackupRunEntity, manager?: EntityManager): Promise<BkpBackupRunEntity> {
    return (manager?.getRepository(BkpBackupRunEntity) ?? this.repo).save(entity);
  }

  async deleteById(id: string, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(BkpBackupRunEntity) ?? this.repo).delete({ id });
  }
}
