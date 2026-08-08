import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

/** Raw shape of `license.v_usage_stats`' single row (migration `0190`). */
export interface UsageStatsRow {
  active_users_30d: string | number;
  student_count: string | number;
  storage_bytes: string | number;
  last_backup_at: string | Date | null;
}

const EMPTY_ROW: UsageStatsRow = {
  active_users_30d: 0,
  student_count: 0,
  storage_bytes: 0,
  last_backup_at: null,
};

/**
 * THE resolution to Module 21's central architectural problem — see
 * migration `0190`'s own doc comment for the full write-up of the
 * `license.v_usage_stats` view mechanism this repository queries.
 *
 * Deliberately raw `DataSource.query()`, never a TypeORM entity/repository
 * for an `app.*` table — that would cross the `module-deps.json` import
 * boundary (`licensing` may import `shared` only). The view itself
 * (defined via raw SQL in the migration, not TypeScript) is what actually
 * crosses schemas; this class only ever knows the view's name and column
 * shape, exactly the same pattern `IntegritySweepService`/`MaterializedViewsRepository`
 * already use elsewhere in this codebase for raw cross-table aggregation
 * queries.
 */
@Injectable()
export class UsageStatsViewRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async read(): Promise<UsageStatsRow> {
    const rows: UsageStatsRow[] = await this.dataSource.query(
      `SELECT active_users_30d, student_count, storage_bytes, last_backup_at FROM license.v_usage_stats`,
    );
    return rows[0] ?? EMPTY_ROW;
  }
}
