import { Client } from "pg";
import { DataSource } from "typeorm";
import { PgConnectionConfig } from "./backup-executor";

/**
 * Generic query function — `DataSource.query()` and `pg.Client.query()`
 * (via `.rows`) both adapt to this shape (`makeDataSourceQueryFn`/
 * `makePgConnectionQueryFn` below), so the actual sampling/counting logic
 * never needs to know which one it's talking to. This is also what makes
 * `countRows`/`captureRepresentativeRowCounts` trivially unit-testable — a
 * test just hands in a `jest.fn()` matching this signature, no `pg`/
 * `DataSource` mocking required.
 */
export type QueryFn = (sql: string) => Promise<Record<string, unknown>[]>;

export const DEFAULT_ROW_COUNT_SAMPLE_SIZE = 20;

/**
 * Every base table in the `app` schema — deliberately schema-driven
 * (`information_schema.tables`), not a hardcoded list of domain table names,
 * specifically because `domains/backups-ops`' `module-deps.json` entry is
 * scoped narrowly (`shared`/`platform/settings`/`platform/files`/
 * `platform/users` only — see that entry's own note) and must never import
 * another domain's entities just to know its table names.
 */
export async function listAppTables(query: QueryFn): Promise<string[]> {
  const rows = await query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'app' AND table_type = 'BASE TABLE' ORDER BY table_name`,
  );
  return rows.map((row) => String(row.table_name));
}

/** Evenly-spaced sample across `items` (alphabetical table-name order) — a deterministic "representative sample" (FR-BKP-003.1's own wording) that stays bounded even as the schema grows past 100+ tables, rather than an exhaustive (slow) or random (non-reproducible) selection. */
export function sampleEvenly<T>(items: readonly T[], sampleSize: number): T[] {
  if (sampleSize <= 0 || items.length <= sampleSize) {
    return [...items];
  }
  const step = items.length / sampleSize;
  const result: T[] = [];
  for (let i = 0; i < sampleSize; i += 1) {
    result.push(items[Math.floor(i * step)]);
  }
  return result;
}

/** Double-quoted identifier — table names here always come from `information_schema` (trusted, not raw user input), but this still quotes properly rather than trusting bare string interpolation into SQL. */
function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export async function countRows(query: QueryFn, tableNames: readonly string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of tableNames) {
    const rows = await query(`SELECT count(*)::bigint AS count FROM app.${quoteIdentifier(table)}`);
    counts[table] = Number(rows[0]?.count ?? 0);
  }
  return counts;
}

/** `BackupOrchestratorService.runBackup()`'s manifest-population step — list every `app` table, sample it down, count the sample. */
export async function captureRepresentativeRowCounts(
  query: QueryFn,
  sampleSize: number = DEFAULT_ROW_COUNT_SAMPLE_SIZE,
): Promise<Record<string, number>> {
  const allTables = await listAppTables(query);
  const sample = sampleEvenly(allTables, sampleSize);
  return countRows(query, sample);
}

export function makeDataSourceQueryFn(dataSource: DataSource): QueryFn {
  return (sql) => dataSource.query(sql) as Promise<Record<string, unknown>[]>;
}

/**
 * Opens a short-lived `pg.Client` against an arbitrary target (the restore-
 * verify target — NOT the app's own `DataSource`, since that target is
 * whatever already-reachable connection `RestoreVerificationService.verifyBackup()`
 * was handed, per that method's own scope-boundary doc comment). Caller MUST
 * call `close()` when done (wrapped in `finally` at every call site).
 */
export async function makePgConnectionQueryFn(config: PgConnectionConfig): Promise<{ query: QueryFn; close: () => Promise<void> }> {
  const client = new Client({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
  });
  await client.connect();
  return {
    query: async (sql: string) => (await client.query(sql)).rows as Record<string, unknown>[],
    close: () => client.end(),
  };
}
