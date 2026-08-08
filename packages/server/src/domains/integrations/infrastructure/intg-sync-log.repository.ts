import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { IntgSyncLogEntity } from "../domain/intg-sync-log.entity";

export interface ListSyncLogOptions {
  kind?: IntgSyncLogEntity["kind"];
  entityType?: string;
  entityId?: string;
  status?: IntgSyncLogEntity["status"];
  limit?: number;
  offset?: number;
}

/** Append-only writer/reader for `intg_sync_log` — no `save()`/update method, matching `IntgSyncLogEntity extends BaseEntity` (no update path, see that entity's own doc comment). */
@Injectable()
export class IntgSyncLogRepository {
  constructor(
    @InjectRepository(IntgSyncLogEntity)
    private readonly repo: Repository<IntgSyncLogEntity>,
  ) {}

  async create(data: Partial<IntgSyncLogEntity>, manager?: EntityManager): Promise<IntgSyncLogEntity> {
    const repo = manager?.getRepository(IntgSyncLogEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async list(options: ListSyncLogOptions, manager?: EntityManager): Promise<[IntgSyncLogEntity[], number]> {
    const repo = manager?.getRepository(IntgSyncLogEntity) ?? this.repo;
    return repo.findAndCount({
      where: {
        ...(options.kind ? { kind: options.kind } : {}),
        ...(options.entityType ? { entityType: options.entityType } : {}),
        ...(options.entityId ? { entityId: options.entityId } : {}),
        ...(options.status ? { status: options.status } : {}),
      },
      order: { at: "DESC" },
      take: options.limit ?? 50,
      skip: options.offset ?? 0,
    });
  }
}
