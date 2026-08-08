import { DataSource } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { FaCategoryEntity } from "../domain/fa-category.entity";
import { FaAssetEntity } from "../domain/fa-asset.entity";
import { FaDepreciationRunEntity } from "../domain/fa-depreciation-run.entity";
import { FaDepreciationLineEntity } from "../domain/fa-depreciation-line.entity";
import { FaMaintenanceEntity } from "../domain/fa-maintenance.entity";
import { FaTransferEntity } from "../domain/fa-transfer.entity";
import { FaDisposalEntity } from "../domain/fa-disposal.entity";
import { FaVerificationEntity } from "../domain/fa-verification.entity";
import { FaVerificationLineEntity } from "../domain/fa-verification-line.entity";

/**
 * Integration test against a real Postgres instance via the actual
 * `AppDataSource` — self-skips (not fails) when no DB is reachable, since
 * Docker isn't confirmed running in every environment this repo builds in
 * (see docs/phase-5/PROGRESS.md "Environment status"). Mirrors
 * `domains/banking/__tests__/banking-triggers.integration.spec.ts`'s pattern
 * exactly — the highest-value test in this foundation pass, since migration
 * `0150`'s 3 triggers (the shared BR-FA-02 `fn_check_asset_not_disposed()`
 * function plus the two unconditional-freeze `_immutable` triggers) can only
 * be genuinely verified against a real Postgres, not a mocked repository.
 */
describe("fixed-assets module — trigger integration (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(
        `[fixed-assets-triggers.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`,
      );
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  interface CategoryFixture {
    categoryId: string;
    glAccountIds: string[];
  }

  /** Creates 3 minimal `gl_account` rows (cost/accum-dep/dep-expense) + one `fa_category` row. */
  async function createCategoryFixture(source: DataSource, suffix: string): Promise<CategoryFixture> {
    const glAccountIds = [generateUuidV7(), generateUuidV7(), generateUuidV7()];
    for (const [i, id] of glAccountIds.entries()) {
      await source.query(
        // is_postable=false avoids ck_gl_account_postable_needs_parent (which requires a non-null
        // parent_id whenever is_postable=true) — these fixture accounts have no parent.
        `INSERT INTO app.gl_account (id, code, name, class, is_postable, is_control)
         VALUES ($1, $2, $3, 'ASSET', false, false)`,
        [id, `FAGL${suffix}${i}`, `FA GL ${suffix} ${i}`],
      );
    }
    const categoryId = generateUuidV7();
    await source.query(
      `INSERT INTO app.fa_category
         (id, name, method, life_months, gl_cost_account_id, gl_accum_dep_account_id, gl_dep_expense_account_id)
       VALUES ($1, $2, 'SL', 60, $3, $4, $5)`,
      [categoryId, `FA Category ${suffix}`, glAccountIds[0], glAccountIds[1], glAccountIds[2]],
    );
    return { categoryId, glAccountIds };
  }

  async function destroyCategoryFixture(source: DataSource, fixture: CategoryFixture): Promise<void> {
    await source.query(`DELETE FROM app.fa_category WHERE id = $1`, [fixture.categoryId]);
    for (const id of fixture.glAccountIds) {
      await source.query(`DELETE FROM app.gl_account WHERE id = $1`, [id]);
    }
  }

  /** Creates one minimal `fa_asset` row with the given status. */
  async function createAssetFixture(
    source: DataSource,
    suffix: string,
    categoryId: string,
    status: string = "ACTIVE",
  ): Promise<string> {
    const assetId = generateUuidV7();
    await source.query(
      `INSERT INTO app.fa_asset
         (id, code, name, category_id, location, acquisition_date, cost, funding_source,
          in_service_from, residual_value, status, condition)
       VALUES ($1, $2, 'Test Asset', $3, 'Store A', '2025-01-01', 1000.00, 'SCHOOL',
               '2025-01-01', 100.00, $4, 'GOOD')`,
      [assetId, `FA-${suffix}`, categoryId, status],
    );
    return assetId;
  }

  interface PeriodFixture {
    fiscalYearId: string;
    periodId: string;
  }

  async function createPeriodFixture(source: DataSource, suffix: string): Promise<PeriodFixture> {
    const fiscalYearId = generateUuidV7();
    const periodId = generateUuidV7();
    await source.query(
      `INSERT INTO app.gl_fiscal_year (id, name, starts_on, ends_on, status)
       VALUES ($1, $2, '2026-01-01', '2026-12-31', 'OPEN')`,
      [fiscalYearId, `FYFA${suffix.slice(-10)}`],
    );
    await source.query(
      `INSERT INTO app.gl_period (id, fiscal_year_id, seq, starts_on, ends_on, status)
       VALUES ($1, $2, 1, '2026-01-01', '2026-01-31', 'OPEN')`,
      [periodId, fiscalYearId],
    );
    return { fiscalYearId, periodId };
  }

  async function destroyPeriodFixture(source: DataSource, fixture: PeriodFixture): Promise<void> {
    await source.query(`DELETE FROM app.gl_period WHERE id = $1`, [fixture.periodId]);
    await source.query(`DELETE FROM app.gl_fiscal_year WHERE id = $1`, [fixture.fiscalYearId]);
  }

  it.each([
    ["fa_category", FaCategoryEntity],
    ["fa_asset", FaAssetEntity],
    ["fa_depreciation_run", FaDepreciationRunEntity],
    ["fa_depreciation_line", FaDepreciationLineEntity],
    ["fa_maintenance", FaMaintenanceEntity],
    ["fa_transfer", FaTransferEntity],
    ["fa_disposal", FaDisposalEntity],
    ["fa_verification", FaVerificationEntity],
    ["fa_verification_line", FaVerificationLineEntity],
  ] as const)("%s table is reachable and the entity metadata matches the DDL", async (tableName, entityClass) => {
    if (!dbAvailable || !dataSource) {
      console.warn(`[fixed-assets-triggers.integration.spec] SKIPPED (no DB) — ${tableName} reachability check`);
      return; // vacuous pass — the skip decision is only known async, after `it()` registration.
    }
    const count = await dataSource.getRepository(entityClass).count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("fn_check_asset_not_disposed() (BR-FA-02) allows inserts into fa_maintenance/fa_transfer/fa_depreciation_line while the asset is ACTIVE, and blocks them once the asset is DISPOSED", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[fixed-assets-triggers.integration.spec] SKIPPED (no DB) — BR-FA-02 shared trigger function check");
      return;
    }
    const source = dataSource;
    const suffix = `${Date.now()}`;
    const category = await createCategoryFixture(source, suffix);
    const assetId = await createAssetFixture(source, suffix, category.categoryId, "ACTIVE");
    const period = await createPeriodFixture(source, suffix);
    const runId = generateUuidV7();
    await source.query(`INSERT INTO app.fa_depreciation_run (id, period_id, status) VALUES ($1, $2, 'DRAFT')`, [
      runId,
      period.periodId,
    ]);

    const maintenanceIdWhileActive = generateUuidV7();
    const transferIdWhileActive = generateUuidV7();
    const depreciationLineIdWhileActive = generateUuidV7();

    try {
      // While ACTIVE, all three dependent tables accept inserts referencing this asset.
      await expect(
        source.query(
          `INSERT INTO app.fa_maintenance (id, asset_id, kind, downtime_note) VALUES ($1, $2, 'PLANNED', '')`,
          [maintenanceIdWhileActive, assetId],
        ),
      ).resolves.toBeDefined();
      await expect(
        source.query(
          `INSERT INTO app.fa_transfer (id, asset_id, from_location, to_location, at)
           VALUES ($1, $2, 'Room A', 'Room B', now())`,
          [transferIdWhileActive, assetId],
        ),
      ).resolves.toBeDefined();
      await expect(
        source.query(
          `INSERT INTO app.fa_depreciation_line (id, run_id, asset_id, amount, nbv_after)
           VALUES ($1, $2, $3, 50.00, 950.00)`,
          [depreciationLineIdWhileActive, runId, assetId],
        ),
      ).resolves.toBeDefined();

      // Dispose the asset.
      await source.query(`UPDATE app.fa_asset SET status = 'DISPOSED' WHERE id = $1`, [assetId]);

      // Now every one of the three dependent tables rejects a new insert referencing this asset.
      await expect(
        source.query(
          `INSERT INTO app.fa_maintenance (id, asset_id, kind, downtime_note) VALUES ($1, $2, 'REPAIR', '')`,
          [generateUuidV7(), assetId],
        ),
      ).rejects.toThrow(/BR-FA-02/);
      await expect(
        source.query(
          `INSERT INTO app.fa_transfer (id, asset_id, from_location, to_location, at)
           VALUES ($1, $2, 'Room B', 'Room C', now())`,
          [generateUuidV7(), assetId],
        ),
      ).rejects.toThrow(/BR-FA-02/);
      await expect(
        source.query(
          `INSERT INTO app.fa_depreciation_line (id, run_id, asset_id, amount, nbv_after)
           VALUES ($1, $2, $3, 50.00, 900.00)`,
          [generateUuidV7(), runId, assetId],
        ),
      ).rejects.toThrow(/BR-FA-02/);
    } finally {
      await source.query(`DELETE FROM app.fa_depreciation_line WHERE run_id = $1`, [runId]);
      await source.query(`DELETE FROM app.fa_transfer WHERE asset_id = $1`, [assetId]);
      await source.query(`DELETE FROM app.fa_maintenance WHERE asset_id = $1`, [assetId]);
      await source.query(`DELETE FROM app.fa_depreciation_run WHERE id = $1`, [runId]);
      await destroyPeriodFixture(source, period);
      await source.query(`DELETE FROM app.fa_asset WHERE id = $1`, [assetId]);
      await destroyCategoryFixture(source, category);
    }
  });

  it("trg_fa_depreciation_run_immutable rejects ALL updates once status=POSTED (unconditional freeze, no status-progression carve-out)", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn(
        "[fixed-assets-triggers.integration.spec] SKIPPED (no DB) — depreciation run immutability trigger check",
      );
      return;
    }
    const source = dataSource;
    const suffix = `${Date.now()}`;
    const period = await createPeriodFixture(source, suffix);
    const runId = generateUuidV7();

    try {
      await source.query(`INSERT INTO app.fa_depreciation_run (id, period_id, status) VALUES ($1, $2, 'DRAFT')`, [
        runId,
        period.periodId,
      ]);

      // While DRAFT, ordinary status progression is freely writable.
      await expect(
        source.query(`UPDATE app.fa_depreciation_run SET status = 'PENDING_APPROVAL' WHERE id = $1`, [runId]),
      ).resolves.toBeDefined();

      // Transition to POSTED.
      await expect(
        source.query(`UPDATE app.fa_depreciation_run SET status = 'POSTED' WHERE id = $1`, [runId]),
      ).resolves.toBeDefined();

      // Once POSTED, ANY update is rejected — including a no-op re-set of status itself
      // (unlike pyrl_run's own immutability trigger, this one has no "status may still progress" carve-out,
      // since POSTED is fa_depreciation_run's own terminal state).
      await expect(
        source.query(`UPDATE app.fa_depreciation_run SET status = 'POSTED' WHERE id = $1`, [runId]),
      ).rejects.toThrow(/BR-GEN-03/);
      await expect(
        source.query(`UPDATE app.fa_depreciation_run SET approval_ref = $2 WHERE id = $1`, [
          runId,
          generateUuidV7(),
        ]),
      ).rejects.toThrow(/BR-GEN-03/);
    } finally {
      await source.query(`DELETE FROM app.fa_depreciation_run WHERE id = $1`, [runId]);
      await destroyPeriodFixture(source, period);
    }
  });

  it("trg_fa_disposal_immutable rejects ALL updates once status=POSTED (unconditional freeze)", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[fixed-assets-triggers.integration.spec] SKIPPED (no DB) — disposal immutability trigger check");
      return;
    }
    const source = dataSource;
    const suffix = `${Date.now()}`;
    const category = await createCategoryFixture(source, suffix);
    const assetId = await createAssetFixture(source, suffix, category.categoryId, "ACTIVE");
    const disposalId = generateUuidV7();

    try {
      await source.query(
        `INSERT INTO app.fa_disposal (id, asset_id, method, status) VALUES ($1, $2, 'SCRAP', 'DRAFT')`,
        [disposalId, assetId],
      );

      // While DRAFT, ordinary progression is freely writable.
      await expect(
        source.query(`UPDATE app.fa_disposal SET status = 'PENDING_APPROVAL' WHERE id = $1`, [disposalId]),
      ).resolves.toBeDefined();
      await expect(
        source.query(`UPDATE app.fa_disposal SET status = 'APPROVED' WHERE id = $1`, [disposalId]),
      ).resolves.toBeDefined();

      // Transition to POSTED.
      await expect(
        source.query(`UPDATE app.fa_disposal SET status = 'POSTED', proceeds = 500.00 WHERE id = $1`, [disposalId]),
      ).resolves.toBeDefined();

      // Once POSTED, ANY update is rejected.
      await expect(
        source.query(`UPDATE app.fa_disposal SET status = 'POSTED' WHERE id = $1`, [disposalId]),
      ).rejects.toThrow(/BR-GEN-03/);
      await expect(
        source.query(`UPDATE app.fa_disposal SET proceeds = 999.00 WHERE id = $1`, [disposalId]),
      ).rejects.toThrow(/BR-GEN-03/);
    } finally {
      await source.query(`DELETE FROM app.fa_disposal WHERE id = $1`, [disposalId]);
      await source.query(`DELETE FROM app.fa_asset WHERE id = $1`, [assetId]);
      await destroyCategoryFixture(source, category);
    }
  });
});
