import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { AccountingSyncResolverService, AccountingSyncKind } from "../infrastructure/accounting-sync-resolver.service";
import { AccountingSyncEntityKind, AccountingSyncTestResult } from "../infrastructure/ports/accounting-sync.port";
import { IntgSyncLogEntity } from "../domain/intg-sync-log.entity";
import { IntgSyncLogRepository, ListSyncLogOptions } from "../infrastructure/intg-sync-log.repository";

export interface PushEntityInput {
  kind: AccountingSyncKind;
  entityType: AccountingSyncEntityKind;
  entityId: string;
  payload: Record<string, unknown>;
}

/**
 * `pushEntity()` resolves the right adapter via
 * `AccountingSyncResolverService`, calls `AccountingSyncPort.pushEntity()`,
 * and ALWAYS writes an `intg_sync_log` row — log-then-classify, not
 * classify-then-maybe-log: the adapter call's outcome (success or thrown
 * error) is captured and turned into the log row's `status`/`provider_ref`/
 * `error` fields regardless of which branch it took, then `pushEntity()`
 * itself returns normally with that same log row (it does NOT rethrow the
 * adapter's error to the caller — a failed push is a valid, fully-recorded
 * outcome for this audit trail, mirroring `NotificationsService.send()`'s
 * own "failure is a recorded state, not an exception" design for
 * `comm_message`).
 *
 * `testConnection()` delegates straight to the resolved adapter's
 * `testConnection()` — FR-SET-003.1's Test Connection pattern (no log row
 * is written for a connection test, only for an actual entity push).
 */
@Injectable()
export class AccountingSyncService {
  constructor(
    private readonly resolver: AccountingSyncResolverService,
    private readonly syncLogRepository: IntgSyncLogRepository,
  ) {}

  async pushEntity(em: EntityManager, input: PushEntityInput): Promise<IntgSyncLogEntity> {
    const adapter = await this.resolver.resolve(input.kind);

    let status: IntgSyncLogEntity["status"];
    let providerRef: string | null = null;
    let error: string | null = null;

    try {
      const result = await adapter.pushEntity(input.entityType, "PUSH", input.payload);
      status = "SUCCESS";
      providerRef = result.providerRef;
    } catch (err) {
      status = "FAILED";
      error = (err as Error).message;
    }

    return this.syncLogRepository.create(
      {
        kind: input.kind,
        direction: "PUSH",
        entityType: input.entityType,
        entityId: input.entityId,
        status,
        providerRef,
        error,
        at: new Date(),
      },
      em,
    );
  }

  async testConnection(kind: AccountingSyncKind): Promise<AccountingSyncTestResult> {
    const adapter = await this.resolver.resolve(kind);
    return adapter.testConnection();
  }

  async listLog(options: ListSyncLogOptions): Promise<[IntgSyncLogEntity[], number]> {
    return this.syncLogRepository.list(options);
  }
}
