import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { PgConnectionConfig } from "./backup-executor";
import {
  captureRepresentativeRowCounts,
  countRows,
  DEFAULT_ROW_COUNT_SAMPLE_SIZE,
  makeDataSourceQueryFn,
  makePgConnectionQueryFn,
} from "./row-count-sampler";

/**
 * Thin injectable delegate over `row-count-sampler.ts`'s plain functions —
 * same "constructor-injected mock, no module-level I/O mocking needed"
 * reasoning `BackupExecutorService` documents.
 */
@Injectable()
export class RowCountSamplerService {
  /** `BackupOrchestratorService.runBackup()`'s manifest-population step — samples the LIVE app database via its already-open `DataSource` (no new connection opened). */
  async captureFromDataSource(dataSource: DataSource, sampleSize: number = DEFAULT_ROW_COUNT_SAMPLE_SIZE): Promise<Record<string, number>> {
    return captureRepresentativeRowCounts(makeDataSourceQueryFn(dataSource), sampleSize);
  }

  /** `RestoreVerificationService.verifyBackup()`'s smoke-query step — counts EXACTLY the tables named in the backup's manifest (not a fresh sample) against the restore target, opening/closing a short-lived connection. */
  async captureFromConnectionConfig(config: PgConnectionConfig, tableNames: readonly string[]): Promise<Record<string, number>> {
    const { query, close } = await makePgConnectionQueryFn(config);
    try {
      return await countRows(query, tableNames);
    } finally {
      await close();
    }
  }
}
