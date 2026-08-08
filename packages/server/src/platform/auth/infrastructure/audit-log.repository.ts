import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { AuditLogEntity } from "../../../shared/audit/audit-log.entity";
import { AuditHashableEntry, computeHash } from "../../../shared/audit/audit-hash.util";

/**
 * Narrow, explicit audit-entry writer for the one Module 1 case the task
 * calls out directly (`LockoutService.unlock` — FR-AUTH-007.1 "System Admin
 * unlock writes an audit entry"). A generic mutation-capturing
 * `AuditInterceptor` (auto before/after diffs on every write) is future
 * work, not part of this module's explicit deliverable list — see the
 * Module 1 report's "left out of scope" note.
 */
@Injectable()
export class AuthAuditLogRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async append(
    entry: Omit<AuditHashableEntry, "at"> & { ip?: string | null; sessionId?: string | null },
    manager?: EntityManager,
  ): Promise<AuditLogEntity> {
    const em = manager ?? this.dataSource.manager;
    const repo = em.getRepository(AuditLogEntity);

    const last = await repo.findOne({ where: {}, order: { seq: "DESC" } });
    const at = new Date();
    const hash = computeHash(last?.hash ?? null, { ...entry, at: at.toISOString() });

    return repo.save(
      repo.create({
        id: generateUuidV7(),
        actorId: entry.actorId,
        actorLabel: entry.actorLabel,
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        before: entry.before as Record<string, unknown> | null,
        after: entry.after as Record<string, unknown> | null,
        ip: entry.ip ?? null,
        sessionId: entry.sessionId ?? null,
        at,
        prevHash: last?.hash ?? null,
        hash,
      }),
    );
  }
}
