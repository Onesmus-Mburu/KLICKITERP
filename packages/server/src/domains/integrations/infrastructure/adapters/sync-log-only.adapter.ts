import { Injectable, Logger } from "@nestjs/common";
import { generateUuidV7 } from "../../../../shared/ids/uuid7";
import {
  AccountingSyncEntityKind,
  AccountingSyncPort,
  AccountingSyncPushResult,
  AccountingSyncTestResult,
} from "../ports/accounting-sync.port";

/**
 * Safe default `AccountingSyncPort` implementation — mirrors
 * `platform/comms`' `LogOnlyAdapter` pattern exactly:
 * `AccountingSyncResolverService` falls back to this whenever no
 * `set_integration_config` row of the matching kind (`QUICKBOOKS`/`XERO`/
 * `SAGE`) is enabled. Logs and returns a synthetic `providerRef` so
 * `AccountingSyncService.pushEntity()` still gets a normal-shaped result
 * end-to-end (and a real `intg_sync_log` row) even with zero configured
 * accounting integrations — `testConnection()` reports `ok: false` so the
 * Settings UI's "last tested" badge shows the true unconfigured state rather
 * than a false positive.
 */
@Injectable()
export class SyncLogOnlyAdapter implements AccountingSyncPort {
  private readonly logger = new Logger(SyncLogOnlyAdapter.name);

  async pushEntity(kind: AccountingSyncEntityKind, direction: "PUSH", payload: Record<string, unknown>): Promise<AccountingSyncPushResult> {
    this.logger.log(`[accounting-sync log-only] ${direction} ${kind}: ${JSON.stringify(payload)}`);
    return { providerRef: `log-${generateUuidV7()}` };
  }

  async testConnection(): Promise<AccountingSyncTestResult> {
    return { ok: false, message: "no accounting-sync integration config enabled, using log-only fallback" };
  }
}
