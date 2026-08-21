import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * BR-PYRL-02's real double-GL-posting gap, live-demonstrated during Phase 6
 * Slice 22 Part 7 and left deliberately unfixed pending user decision —
 * closed here. `uq_pyrl_main_run_p` (migration `0130`) is a partial unique
 * index scoped to `WHERE run_kind='MAIN' AND status='COMMITTED'` — it
 * protects a period only for the single instant a run's status literally
 * equals `'COMMITTED'`, and stops protecting it the moment that SAME run
 * legitimately advances to `PAID`/`FILED` (the normal, guaranteed outcome of
 * every real payroll run's own lifecycle, per `trg_pyrl_run_immutable`'s own
 * doc comment: "a committed run still needs to move to PAID/FILED"). A
 * second MAIN run for the same period can then be freely computed/approved/
 * committed with zero conflict — live-confirmed via `psql`: `5010 Salaries
 * and Wages Expense` was debited twice for the same period, permanently.
 *
 * **The fix matches this codebase's own already-documented intent, not a
 * new rule invented here**: `PyrlRunEntity`'s own class doc comment already
 * states the real rule — "a payroll period can hold at most one COMMITTED
 * main run; corrections use supplementary runs referencing it." Widening
 * the index's `WHERE` clause to the SAME 3-status set `PYRL_RUN_COMMITTED_STATUSES`
 * already names for the identical "has this run passed the point of no
 * return" concept elsewhere in `pyrl-run.entity.ts` directly enforces that
 * documented rule for its full intended lifetime, not just one instant.
 *
 * **Step 1 — retroactively correct any pre-existing violation, generically,
 * not hardcoded to one specific known row.** A period with 2+ `MAIN` runs
 * already at/beyond `COMMITTED` would make the new stricter index
 * uncreatable outright (Postgres refuses to build a unique index against
 * already-conflicting data) — so before creating it, every such group is
 * found and resolved: the "winner" (the run that progressed furthest —
 * `FILED` > `PAID` > `COMMITTED`, tie-broken by earliest `created_at`, i.e.
 * whichever run was actually carried through to completion first) keeps
 * `run_kind='MAIN'`; every OTHER run in that period-group is reclassified
 * `run_kind='SUPPLEMENTARY'` with `supplements_run_id` pointing at the
 * winner. This is a genuine historical CLASSIFICATION correction, not a
 * data/figures change — `totals`/`period_key`/`journal_id` are never
 * touched, only which "kind" of run each historically was. Honest caveat:
 * "SUPPLEMENTARY" doesn't perfectly describe "this was an accidental full
 * duplicate," since a genuine supplementary run is normally a deliberate,
 * smaller top-up correction — but it's the closest fit the existing
 * 2-value `run_kind` enum offers, and is strictly more honest than leaving
 * two independent `MAIN` runs on record for one period. The real financial
 * correction (a reversing journal netting the duplicate's double-counted
 * GL postings back to the correct figure) is handled SEPARATELY, live,
 * through the real `POST /accounting/journals/{id}/reverse` endpoint
 * (`PostingService.reverse()`) — not in this migration, since that's the
 * established, correct, already-built mechanism for a real GL correction,
 * not something to hand-reimplement in raw migration SQL.
 *
 * `run_kind` is one of the 4 columns `trg_pyrl_run_immutable` freezes once a
 * run reaches `COMMITTED`+ (BR-PYRL-06) — the trigger is disabled for the
 * narrow duration of this corrective `UPDATE` only, then immediately
 * re-enabled, the same "narrow, deliberate escape hatch for a legitimate
 * privileged caller" pattern `trg_gl_writer_guard`'s own `application_name`
 * check already establishes elsewhere in this codebase.
 *
 * Idempotent/environment-agnostic by construction: on an environment that
 * never hit this bug, the duplicate-finding query returns zero groups, this
 * step is a genuine no-op, and only the index widening below applies.
 */
export class WidenPyrlMainRunUniqueIndex0241 implements MigrationInterface {
  name = "WidenPyrlMainRunUniqueIndex1700000000241";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const finalizedMainRuns: Array<{ id: string; period_key: string; status: string; created_at: Date }> =
      await queryRunner.query(
        `SELECT id, period_key, status, created_at FROM app.pyrl_run
         WHERE run_kind = 'MAIN' AND status IN ('COMMITTED', 'PAID', 'FILED')
         ORDER BY period_key, created_at`,
      );

    const byPeriod = new Map<string, typeof finalizedMainRuns>();
    for (const run of finalizedMainRuns) {
      const group = byPeriod.get(run.period_key) ?? [];
      group.push(run);
      byPeriod.set(run.period_key, group);
    }

    const statusRank: Record<string, number> = { FILED: 3, PAID: 2, COMMITTED: 1 };
    const duplicateGroups = [...byPeriod.values()].filter((group) => group.length > 1);

    if (duplicateGroups.length > 0) {
      await queryRunner.query(`ALTER TABLE app.pyrl_run DISABLE TRIGGER trg_pyrl_run_immutable`);
      try {
        for (const group of duplicateGroups) {
          const [winner, ...losers] = [...group].sort((a, b) => {
            const rankDiff = statusRank[b.status] - statusRank[a.status];
            return rankDiff !== 0 ? rankDiff : a.created_at.getTime() - b.created_at.getTime();
          });
          for (const loser of losers) {
            await queryRunner.query(
              `UPDATE app.pyrl_run SET run_kind = 'SUPPLEMENTARY', supplements_run_id = $1 WHERE id = $2`,
              [winner.id, loser.id],
            );
          }
        }
      } finally {
        await queryRunner.query(`ALTER TABLE app.pyrl_run ENABLE TRIGGER trg_pyrl_run_immutable`);
      }
    }

    await queryRunner.query(`DROP INDEX app.uq_pyrl_main_run_p`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_pyrl_main_run_p ON app.pyrl_run (period_key)
        WHERE run_kind = 'MAIN' AND status IN ('COMMITTED', 'PAID', 'FILED')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverts the INDEX shape only, matching migration `0238`'s own
    // documented precedent for this class of down() — retroactively
    // "un-fixing" the run_kind classification correction above would mean
    // silently re-introducing an already-identified data-integrity error,
    // which a rollback should never do. Note this down() will itself fail
    // to recreate the original narrower index if any environment now has
    // multiple MAIN runs genuinely reaching PAID/FILED for the same period
    // (expected once this fix has been live for any real usage) — the same
    // "genuinely irreversible once real data has moved past the old
    // constraint" situation `0238`'s own down() documents.
    await queryRunner.query(`DROP INDEX app.uq_pyrl_main_run_p`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_pyrl_main_run_p ON app.pyrl_run (period_key)
        WHERE run_kind = 'MAIN' AND status = 'COMMITTED'
    `);
  }
}
