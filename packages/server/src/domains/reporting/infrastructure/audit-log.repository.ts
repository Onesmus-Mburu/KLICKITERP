import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { AuditLogEntity } from "../../../shared/audit/audit-log.entity";

export interface AuditLogSearchFilter {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  /** Inclusive, UTC day boundary — `at >= fromDate 00:00:00.000Z`. */
  fromDate: string;
  /** Inclusive, UTC day boundary — `at <= toDate 23:59:59.999Z`. */
  toDate: string;
}

/**
 * A NEW, lightweight, READ-ONLY repository wrapper for `audit.audit_log`
 * (`shared/audit/audit-log.entity.ts`), built for `AuditLogReport`
 * (`application/audit-log.report.ts`). `shared/audit` is shared-kernel
 * (importable by every module without a `module-deps.json` exception), so
 * this file adds no new cross-module dependency at all.
 *
 * This is deliberately a SEPARATE repository from `platform/auth`'s own
 * `AuthAuditLogRepository` (`platform/auth/infrastructure/audit-log.repository.ts`)
 * rather than a reuse of it — that repository is a narrow, WRITE-ONLY
 * (`append()`) helper scoped to Module 1's own single documented use case
 * (`LockoutService.unlock`), not exported from `platform/auth`'s barrel, and
 * genuinely the wrong shape for this report's filtered, paginated-in-spirit
 * READ path. `usr_permission` (`kfe_app` role) has UPDATE/DELETE revoked on
 * `audit.audit_log` at the DB layer (migration `0020`) — this repository
 * exposes no write method at all, matching that DB-level guarantee at the
 * application layer too.
 */
@Injectable()
export class AuditLogRepository {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly repo: Repository<AuditLogEntity>,
  ) {}

  async search(filter: AuditLogSearchFilter, manager?: EntityManager): Promise<AuditLogEntity[]> {
    const repo = manager?.getRepository(AuditLogEntity) ?? this.repo;
    const qb = repo
      .createQueryBuilder("log")
      .where("log.at >= :fromAt", { fromAt: `${filter.fromDate}T00:00:00.000Z` })
      .andWhere("log.at <= :toAt", { toAt: `${filter.toDate}T23:59:59.999Z` });

    if (filter.entityType) qb.andWhere("log.entityType = :entityType", { entityType: filter.entityType });
    if (filter.entityId) qb.andWhere("log.entityId = :entityId", { entityId: filter.entityId });
    if (filter.actorId) qb.andWhere("log.actorId = :actorId", { actorId: filter.actorId });

    return qb.orderBy("log.seq", "DESC").getMany();
  }
}
