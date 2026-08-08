/**
 * GFS (Grandfather-Father-Son) retention math for `BackupOrchestratorService.pruneOldBackups()`
 * (docs/phase-3/03-deployment-infrastructure.md §6: "local volume (7 daily) /
 * MinIO bucket (4 weekly) / optional offsite S3 (12 monthly)"). Per the task
 * brief's own instruction, "daily/weekly/monthly" is DERIVED from each run's
 * `startedAt` timestamp rather than read off a stored classification column
 * — no `bkp_backup_run` column records which GFS tier(s) a run belongs to;
 * a single run can (and typically does) serve as that day's AND that
 * week's AND that month's representative simultaneously.
 *
 * **Algorithm** (documented here since this is a genuine judgement call,
 * not spelled out anywhere in the DDL/architecture doc beyond the 7/4/12
 * counts):
 *  1. Sort candidate runs by `startedAt` DESCENDING (newest first).
 *  2. For each of the three tiers (daily/weekly/monthly), walk the sorted
 *     list and bucket each run into its tier-specific PERIOD KEY (see
 *     below). The FIRST (= most recent, since the list is sorted DESC) run
 *     encountered for a given period key is that period's representative —
 *     every other run sharing the same period key is a pruning candidate
 *     for that tier. Stop once `N` distinct periods have been seen (7 for
 *     daily, 4 for weekly, 12 for monthly).
 *  3. `keepIds` = the union of all three tiers' representative run ids. A
 *     run surviving via ANY tier is kept — this is what makes GFS
 *     space-efficient in the classic sense (the newest runs typically
 *     serve all three roles at once, not 7+4+12=23 independent copies).
 *  4. Every candidate NOT in `keepIds` is pruned.
 *
 * **Period-key definitions** — deliberately simple, UTC-based, and
 * documented as a conscious simplification versus strict ISO-8601 week
 * numbers (which have real edge cases at year boundaries and would need
 * careful, fiddly testing for a result nobody-facing — this classification
 * is purely an internal retention-bucketing detail, not a user-visible
 * "week 34" label):
 *   - `dayKey`   = the UTC calendar date (`YYYY-MM-DD`).
 *   - `weekKey`  = a ROLLING 7-day bucket anchored at the Unix epoch
 *                  (`floor(epochMillis / (7 * 24h))`), NOT a calendar
 *                  Mon-Sun/ISO week — deterministic, trivially testable,
 *                  and "keep a representative from each of the last ~4
 *                  weeks" doesn't require calendar alignment to be useful.
 *   - `monthKey` = the UTC calendar month (`YYYY-MM`) — unlike "week",
 *                  calendar-month alignment IS meaningful here ("keep the
 *                  last 12 calendar months"), so this one deliberately
 *                  does NOT use a rolling-30-day bucket.
 */
export interface RetentionCandidate {
  id: string;
  startedAt: Date;
}

export const DAILY_RETENTION_COUNT = 7;
export const WEEKLY_RETENTION_COUNT = 4;
export const MONTHLY_RETENTION_COUNT = 12;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = MS_PER_DAY * 7;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function weekKey(date: Date): number {
  return Math.floor(date.getTime() / MS_PER_WEEK);
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function representativesPerPeriod(
  sortedDesc: readonly RetentionCandidate[],
  keyOf: (date: Date) => string | number,
  periodCount: number,
): Set<string> {
  const seenPeriods = new Set<string | number>();
  const keepIds = new Set<string>();
  for (const candidate of sortedDesc) {
    if (seenPeriods.size >= periodCount) break;
    const key = keyOf(candidate.startedAt);
    if (seenPeriods.has(key)) continue;
    seenPeriods.add(key);
    keepIds.add(candidate.id);
  }
  return keepIds;
}

export interface RetentionClassification {
  keepIds: Set<string>;
}

export function classifyRetention(candidates: readonly RetentionCandidate[]): RetentionClassification {
  const sortedDesc = [...candidates].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  const daily = representativesPerPeriod(sortedDesc, dayKey, DAILY_RETENTION_COUNT);
  const weekly = representativesPerPeriod(sortedDesc, weekKey, WEEKLY_RETENTION_COUNT);
  const monthly = representativesPerPeriod(sortedDesc, monthKey, MONTHLY_RETENTION_COUNT);
  return { keepIds: new Set([...daily, ...weekly, ...monthly]) };
}
