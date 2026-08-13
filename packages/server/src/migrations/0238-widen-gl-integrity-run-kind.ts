import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 6 Slice 17 Part 4 (Integrity Sweep, Module 7) — a real, live-
 * verification-only bug found while exercising `POST /accounting/integrity-
 * sweep/run` against this app's own dev DB for the first time ever (nothing
 * in Parts 1-3 of this slice, nor any test suite, had actually called this
 * route before): `app.gl_integrity_run.kind` was created `varchar(20)` by
 * migration `0060` — but `IntegritySweepService`'s own `SWEEP_KIND` constant
 * (`packages/accounting/application/integrity-sweep.service.ts`) is the
 * literal string `"PERIOD_ACCOUNT_TOTAL_RECONCILIATION"`, **35 characters**,
 * nearly double the column's own width. Every single call to `runSweep()`
 * therefore failed with a real Postgres `value too long for type character
 * varying(20)` error (surfaced as a generic `500` through
 * `AllExceptionsFilter`) — 100% reproducible, not a corner case: this route
 * has never successfully inserted a row for this module's own sweep kind
 * since the day it was written. The sibling `WALLET_RECONCILE` kind (Wallet's
 * own reconciliation sweep, `features/wallet/api/reconciliation.api.ts` on
 * the frontend, sharing this exact table) is only 16 characters, which is
 * why THAT sweep has been working fine all along and nobody hit this before.
 *
 * Widened to `varchar(64)` — generous headroom beyond the current 35-char
 * constant, matching `docv_record.document_type varchar(60)`'s own
 * precedent for a similar short-classification-string column, so a future,
 * slightly longer `kind` value doesn't repeat this exact failure mode.
 *
 * Deliberately the smallest possible fix to unblock this frontend-only
 * part's own required live verification (`POST .../run` must actually
 * succeed to confirm `GET .../runs` reflects it, per this part's own
 * verification plan) — no other column, trigger, or application code is
 * touched. `gl_integrity_run` is explicitly NOT writer-guarded (confirmed by
 * `IntegritySweepService`'s own doc comment: only `gl_journal`/
 * `gl_journal_line`/`gl_period_account_total` carry `trg_gl_writer_guard`),
 * so this plain `ALTER TABLE` needs no `application_name` workaround.
 */
export class WidenGlIntegrityRunKind0238 implements MigrationInterface {
  name = "WidenGlIntegrityRunKind1700000000238";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE app.gl_integrity_run ALTER COLUMN kind TYPE varchar(64)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Irreversible in the strict sense once a real kind value longer than 20
    // characters has been persisted (re-narrowing against such a row fails
    // outright) — the correct behavior, matching migration `0234`'s own
    // documented precedent for this exact class of down(). Since this
    // migration's own up() exists specifically because
    // "PERIOD_ACCOUNT_TOTAL_RECONCILIATION" (35 chars) is already being
    // written by live application code, running this down() on any database
    // that has ever executed a real sweep will fail — expected, not a bug in
    // this down().
    await queryRunner.query(`ALTER TABLE app.gl_integrity_run ALTER COLUMN kind TYPE varchar(20)`);
  }
}
