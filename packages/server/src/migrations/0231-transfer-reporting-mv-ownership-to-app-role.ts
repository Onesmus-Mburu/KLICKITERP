import { MigrationInterface, QueryRunner } from "typeorm";
import { REPORTING_MATERIALIZED_VIEW_NAMES } from "../domains/reporting/infrastructure/materialized-views.repository";

const APP_ROLE = "kfe_app";
const MIGRATION_ROLE = "kfe_migrate";

/**
 * Phase 6 Slice 10 (follow-up) — fixes `POST /dashboard/refresh-mvs` (the
 * dashboard's "Refresh data" button), which has been a real, silent `500`
 * ("must be owner of materialized view mv_daily_collections") since
 * migration `0160` first created these 5 views: `REFRESH MATERIALIZED VIEW
 * CONCURRENTLY` (`MaterializedViewsRepository.refresh()`) requires the
 * connecting role to OWN the view — unlike `SELECT`, ownership cannot be
 * granted separately — but every view in `app.*` is created (and therefore
 * owned) by `kfe_migrate`, the DDL-only migration role, while the app
 * connects at runtime as `kfe_app` (DML-only, per `.env.example`'s own
 * documented role split and `migration-0190`'s own doc comment: "kfe_app has
 * no license.* access... narrow grants, not ownership transfers").
 *
 * **Why ownership transfer, not a `SECURITY DEFINER` function/procedure
 * wrapper** (the more strictly-separation-preserving alternative,
 * considered first): `REFRESH MATERIALIZED VIEW CONCURRENTLY` cannot run
 * inside a transaction block, and a plain SQL function's body always
 * executes within the calling statement's implicit transaction — a
 * `SECURITY DEFINER` PROCEDURE with an internal `COMMIT` before the refresh
 * MIGHT work around this, but that could not be verified against a real
 * Postgres instance in this environment (a direct empirical test was
 * correctly blocked as a sensitive, unreviewed DDL action) — shipping an
 * unverified transaction-control workaround for a role-security-relevant
 * migration is worse than the narrower, guaranteed-correct fix below.
 *
 * **Why this is a narrow, low-risk exception, not a real widening of
 * `kfe_app`'s privileges**: these 5 views are pure READ-MODEL aggregates
 * over tables `kfe_app` already has full DML on (`pay_receipt`,
 * `bill_invoice`, `wal_wallet`, ...) — `kfe_app` already has, and always
 * has had, the ability to read and write every row these views summarize.
 * Owning the 5 derived views themselves grants no NEW data access
 * whatsoever; it only grants the ability to re-run the `SELECT` that
 * already defines each view. Unlike the license-schema cross-boundary case
 * `0190` protects (a genuinely different module's data `kfe_app` has no
 * business seeing at all), there is no analogous boundary being crossed
 * here.
 *
 * Idempotent: `ALTER MATERIALIZED VIEW ... OWNER TO` is a no-op when the
 * role already owns the view (safe to re-run). `down()` reverts ownership
 * to `kfe_migrate`, restoring the original (broken) state exactly.
 *
 * Postgres requires the NEW owner to hold CREATE privilege on the object's
 * schema at the moment of transfer (`ALTER TABLE`'s own docs: "you must be
 * able to SET ROLE to the new owning role, and that role must have CREATE
 * privilege on the table's schema" — same rule applies to materialized
 * views). `kfe_app` deliberately only has USAGE on schema `app` (DML-only,
 * migration 0002) — this worked locally by accident only because local
 * dev's `kfe_migrate` role happens to carry the Postgres SUPERUSER
 * attribute, which bypasses the check entirely ("a superuser can alter
 * ownership of any table anyway"). On a host where the migrating role is
 * genuinely non-superuser (e.g. Neon), the check is enforced for real, so
 * `kfe_app` needs CREATE on schema `app` transiently — granted immediately
 * before the transfer and revoked immediately after, leaving `kfe_app`'s
 * permanent privilege set exactly as documented (no persistent widening).
 */
export class TransferReportingMvOwnershipToAppRole0231 implements MigrationInterface {
  name = "TransferReportingMvOwnershipToAppRole1700000000231";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`GRANT CREATE ON SCHEMA app TO ${APP_ROLE}`);
    for (const viewName of REPORTING_MATERIALIZED_VIEW_NAMES) {
      await queryRunner.query(`ALTER MATERIALIZED VIEW app.${viewName} OWNER TO ${APP_ROLE}`);
    }
    await queryRunner.query(`REVOKE CREATE ON SCHEMA app FROM ${APP_ROLE}`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const viewName of REPORTING_MATERIALIZED_VIEW_NAMES) {
      await queryRunner.query(`ALTER MATERIALIZED VIEW app.${viewName} OWNER TO ${MIGRATION_ROLE}`);
    }
  }
}
