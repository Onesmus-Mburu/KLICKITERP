import { DataSource } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { Money } from "../../../shared/money/money";
import { OutboxWriterService } from "../../../shared/events/outbox-writer.service";

import { SetNumberingSeriesEntity } from "../../../platform/settings/domain/set-numbering-series.entity";
import { SetNumberingSeriesRepository } from "../../../platform/settings/infrastructure/set-numbering-series.repository";
import { NumberingService } from "../../../platform/settings/application/numbering.service";
import { AcademicCalendarService } from "../../../platform/settings/application/academic-calendar.service";

import {
  ApprovalEngineService,
  ApprWorkflowDefEntity,
  ApprWorkflowVersionEntity,
  ApprLevelEntity,
  ApprRoutingRuleEntity,
  ApprInstanceEntity,
  ApprActionEntity,
  DelegationsService,
} from "../../../platform/approvals";
import { ApprWorkflowDefRepository } from "../../../platform/approvals/infrastructure/appr-workflow-def.repository";
import { ApprWorkflowVersionRepository } from "../../../platform/approvals/infrastructure/appr-workflow-version.repository";
import { ApprLevelRepository } from "../../../platform/approvals/infrastructure/appr-level.repository";
import { ApprRoutingRuleRepository } from "../../../platform/approvals/infrastructure/appr-routing-rule.repository";
import { ApprInstanceRepository } from "../../../platform/approvals/infrastructure/appr-instance.repository";
import { ApprActionRepository } from "../../../platform/approvals/infrastructure/appr-action.repository";
import { UsersService, DepartmentsService } from "../../../platform/users";

import { GlAccountRepository, PostingService } from "../../../accounting";
import { GlAccountEntity } from "../../../accounting/domain/gl-account.entity";
import { GlJournalEntity } from "../../../accounting/domain/gl-journal.entity";
import { GlJournalLineEntity } from "../../../accounting/domain/gl-journal-line.entity";
import { GlJournalLineRepository } from "../../../accounting/infrastructure/gl-journal-line.repository";
import { GlJournalRepository } from "../../../accounting/infrastructure/gl-journal.repository";
import { GlPeriodAccountTotalEntity } from "../../../accounting/domain/gl-period-account-total.entity";
import { GlPeriodAccountTotalRepository } from "../../../accounting/infrastructure/gl-period-account-total.repository";
import { GlPeriodEntity } from "../../../accounting/domain/gl-period.entity";
import { GlPeriodRepository } from "../../../accounting/infrastructure/gl-period.repository";

import { FaCategoryEntity } from "../domain/fa-category.entity";
import { FaAssetEntity } from "../domain/fa-asset.entity";
import { FaDepreciationRunEntity } from "../domain/fa-depreciation-run.entity";
import { FaDepreciationLineEntity } from "../domain/fa-depreciation-line.entity";
import { FaDisposalEntity } from "../domain/fa-disposal.entity";
import { FaCategoryRepository } from "../infrastructure/fa-category.repository";
import { FaAssetRepository } from "../infrastructure/fa-asset.repository";
import { FaDepreciationRunRepository } from "../infrastructure/fa-depreciation-run.repository";
import { FaDepreciationLineRepository } from "../infrastructure/fa-depreciation-line.repository";
import { FaDisposalRepository } from "../infrastructure/fa-disposal.repository";

import { CategoriesService } from "../application/categories.service";
import { AssetsService } from "../application/assets.service";
import { DepreciationRunsService, DEPRECIATION_APPROVAL_DOMAIN_CODE } from "../application/depreciation-runs.service";
import { DisposalService, ASSET_DISPOSALS_APPROVAL_DOMAIN_CODE } from "../application/disposal.service";

/**
 * The capstone integration test for Module 17 (Fixed Assets) — walks:
 * register a category+asset -> create+compute a depreciation run (SL, no
 * proration since in_service_from predates the test's own gl_period) ->
 * submit -> a REAL `ApprovalEngineService.decide()` (not a manual-trigger
 * stand-in, since `DepreciationRunsService.post()` verifies the underlying
 * `appr_instance`'s OWN `status` column directly — mirrors
 * `StockTakesService`'s identical shape/reasoning, see that service's own
 * `onApprovalDecided()` doc comment) -> post (P-30) -> dispose the SAME asset
 * (create -> submit -> `onApprovalDecided()` — a LOCAL status flip suffices
 * here since `fa_disposal` DOES carry a real `APPROVED` enum value, mirroring
 * `bank_transfer`'s identical shape) -> post (P-31), asserting balanced GL at
 * BOTH steps and the asset's final `status='DISPOSED'`/correct
 * `accum_depreciation`. Mirrors `domains/banking/__tests__/banking-e2e.integration.spec.ts`'s
 * pattern (real repository/service instances, no Nest DI, self-skips without
 * a reachable Postgres).
 *
 * **This test's assumption**: migrations up to and including `0900` have
 * already run — the `System Admin` `usr_role` must exist (same assumption
 * every other module's own e2e capstone states); the `DEPRECIATION`/
 * `ASSET_DISPOSALS` workflow defs are defensively re-upserted here too
 * (reuse-or-create, never overwrite) in case this test runs against a DB
 * where `0900` hasn't been re-applied since this pass added them.
 */
describe("fixed-assets module — end-to-end capstone (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(`[fixed-assets-e2e.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`);
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it(
    "register asset -> depreciation run create->submit->approve->post (P-30) -> dispose create->submit->decide->post (P-31)",
    async () => {
      if (!dbAvailable || !dataSource) {
        console.warn("[fixed-assets-e2e.integration.spec] SKIPPED (no DB) — end-to-end fixed-assets capstone flow");
        return;
      }
      const source = dataSource;
      const suffix = Date.now();

      // ---- A one-month gl_period, well AFTER the asset's own in_service_from (avoids proration for this test's math). ----
      const fiscalYearId = generateUuidV7();
      const periodId = generateUuidV7();
      await source.query(
        `INSERT INTO app.gl_fiscal_year (id, name, starts_on, ends_on, status) VALUES ($1, $2, '2026-01-01', '2026-12-31', 'OPEN')`,
        [fiscalYearId, `FA-E2E-FY-${String(suffix).slice(-8)}`],
      );
      await source.query(
        `INSERT INTO app.gl_period (id, fiscal_year_id, seq, starts_on, ends_on, status) VALUES ($1, $2, 7, '2026-07-01', '2026-07-31', 'OPEN')`,
        [periodId, fiscalYearId],
      );

      // ---- GL accounts: reuse the 0900-seeded rows if present, else create throwaway fallbacks. ----
      // Top-level 0900-seeded CoA parent code per gl_account.class — ck_gl_account_postable_needs_parent
      // (migration 0060) requires every is_postable=true row to have a real parent_id.
      const topLevelParentCodeByClass: Record<string, string> = { ASSET: "1000", LIABILITY: "2000", EQUITY: "3000", INCOME: "4000", EXPENSE: "5000" };
      async function reuseOrCreateByCode(code: string, name: string, klass: string): Promise<{ id: string; created: boolean }> {
        const existing: Array<{ id: string }> = await source.query(`SELECT id FROM app.gl_account WHERE code = $1`, [code]);
        if (existing.length > 0) return { id: existing[0].id, created: false };
        const id = generateUuidV7();
        const parentCode = topLevelParentCodeByClass[klass];
        const [parent] = parentCode ? await source.query(`SELECT id FROM app.gl_account WHERE code = $1`, [parentCode]) : [undefined];
        await source.query(
          `INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, is_active) VALUES ($1, $2, $3, $4, $5, true, false, true)`,
          [id, code, name, klass, parent?.id ?? null],
        );
        return { id, created: true };
      }
      const costAccount = await reuseOrCreateByCode(`E2CST${suffix}`.slice(0, 10), "E2E Category Cost", "ASSET");
      const accumDepAccount = await reuseOrCreateByCode(`E2ACD${suffix}`.slice(0, 10), "E2E Category Accum. Dep.", "ASSET");
      const depExpenseAccount = await reuseOrCreateByCode(`E2DEX${suffix}`.slice(0, 10), "E2E Category Dep. Expense", "EXPENSE");
      const proceedsAccount = await reuseOrCreateByCode("1020", "Bank - Operating Account", "ASSET");
      const gainAccount = await reuseOrCreateByCode("4050", "Gain on Disposal", "INCOME");
      const lossAccount = await reuseOrCreateByCode("5110", "Loss on Disposal", "EXPENSE");
      const createdAccountIds = [costAccount, accumDepAccount, depExpenseAccount, proceedsAccount, gainAccount, lossAccount]
        .filter((a) => a.created)
        .map((a) => a.id);

      // ---- System Admin role (0900-seeded) + two distinct users (initiator != approver, BR-APPR-01). ----
      const roleRows: Array<{ id: string }> = await source.query(`SELECT id FROM app.usr_role WHERE name = 'System Admin'`);
      if (roleRows.length === 0) {
        throw new Error("System Admin role not found — run migrations through 0900 first (see this test's own doc comment)");
      }
      const roleId = roleRows[0].id;
      const initiatorId = generateUuidV7();
      const approverId = generateUuidV7();
      await source.query(
        `INSERT INTO app.usr_user (id, username, password_hash, full_name, status, phone) VALUES ($1, $2, 'hash', 'E2E Initiator', 'ACTIVE', $3)`,
        // phone is varchar(20); "+2547" (5 chars) + a 13-digit Date.now() suffix is 18 chars, well
        // within budget — previously `.slice(0, 13)` truncated the WHOLE string (not just the
        // suffix) down to the first 8 digits of the timestamp, so phone only changed once per
        // ~100 real seconds and collided across test files/runs inside that window
        // (uq_usr_user_phone_p). Keep the full suffix instead.
        [initiatorId, `fa-e2e-init-${suffix}`, `+2547${suffix}`],
      );
      await source.query(
        `INSERT INTO app.usr_user (id, username, password_hash, full_name, status, phone) VALUES ($1, $2, 'hash', 'E2E Approver', 'ACTIVE', $3)`,
        [approverId, `fa-e2e-appr-${suffix}`, `+2546${suffix}`],
      );

      await upsertSingleLevelWorkflow(source, DEPRECIATION_APPROVAL_DOMAIN_CODE, "Depreciation Run Approval (E2E)", roleId);
      await upsertSingleLevelWorkflow(source, ASSET_DISPOSALS_APPROVAL_DOMAIN_CODE, "Asset Disposal Approval (E2E)", roleId);

      // ---- Service instantiation (real repositories, no Nest DI — see class doc comment). ----
      const glAccountRepository = new GlAccountRepository(source.getRepository(GlAccountEntity));
      const numberingSeriesRepository = new SetNumberingSeriesRepository(source.getRepository(SetNumberingSeriesEntity));
      const numberingService = new NumberingService(numberingSeriesRepository, {} as unknown as AcademicCalendarService);
      const glPeriodRepository = new GlPeriodRepository(source.getRepository(GlPeriodEntity));
      const glPeriodAccountTotalRepository = new GlPeriodAccountTotalRepository(source.getRepository(GlPeriodAccountTotalEntity));
      const postingService = new PostingService(
        new GlJournalRepository(source.getRepository(GlJournalEntity)),
        new GlJournalLineRepository(source.getRepository(GlJournalLineEntity)),
        glPeriodAccountTotalRepository,
        glAccountRepository,
        glPeriodRepository,
        numberingService,
      );

      const usersServiceStub = {
        listActiveUsersByRoleId: async () => [{ id: approverId }],
        findByIdOrFail: async (id: string) => ({ id, departmentId: null }),
      } as unknown as UsersService;

      const approvalEngine = new ApprovalEngineService(
        source,
        new ApprWorkflowDefRepository(source.getRepository(ApprWorkflowDefEntity)),
        new ApprWorkflowVersionRepository(source.getRepository(ApprWorkflowVersionEntity)),
        new ApprLevelRepository(source.getRepository(ApprLevelEntity)),
        new ApprRoutingRuleRepository(source.getRepository(ApprRoutingRuleEntity)),
        new ApprInstanceRepository(source.getRepository(ApprInstanceEntity)),
        new ApprActionRepository(source.getRepository(ApprActionEntity)),
        usersServiceStub,
        {} as unknown as DepartmentsService, // never touched — no DEPT_HEAD level in either seeded workflow.
        {} as unknown as DelegationsService, // never touched — the approver holds the role directly, no delegation path taken.
        new OutboxWriterService(),
      );

      const categoryRepository = new FaCategoryRepository(source.getRepository(FaCategoryEntity));
      const assetRepository = new FaAssetRepository(source.getRepository(FaAssetEntity));
      const runRepository = new FaDepreciationRunRepository(source.getRepository(FaDepreciationRunEntity));
      const lineRepository = new FaDepreciationLineRepository(source.getRepository(FaDepreciationLineEntity));
      const disposalRepository = new FaDisposalRepository(source.getRepository(FaDisposalEntity));

      const categoriesService = new CategoriesService(categoryRepository, glAccountRepository);
      const assetsService = new AssetsService(assetRepository, categoryRepository);
      const depreciationRunsService = new DepreciationRunsService(
        runRepository,
        lineRepository,
        assetRepository,
        categoryRepository,
        glPeriodRepository,
        postingService,
        approvalEngine,
      );
      const disposalService = new DisposalService(
        disposalRepository,
        assetRepository,
        categoryRepository,
        glAccountRepository,
        postingService,
        approvalEngine,
      );

      let categoryId: string | null = null;
      let assetId: string | null = null;
      let runId: string | null = null;
      let disposalId: string | null = null;

      try {
        // ==== register category (SL, 24 months) + asset (cost 24,000.00) ====
        const category = await categoriesService.create(
          {
            name: `FA-E2E-CAT-${suffix}`,
            method: "SL",
            lifeMonths: 24,
            glCostAccountId: costAccount.id,
            glAccumDepAccountId: accumDepAccount.id,
            glDepExpenseAccountId: depExpenseAccount.id,
          },
          initiatorId,
        );
        categoryId = category.id;

        const asset = await assetsService.create(
          {
            code: `FA-E2E-AST-${suffix}`,
            name: "E2E Test Asset",
            categoryId: category.id,
            location: "E2E Wing",
            acquisitionDate: "2020-01-01",
            cost: Money.fromInt(24000),
            fundingSource: "SCHOOL",
            inServiceFrom: "2020-01-01", // well before the test's July 2026 period — no proration
          },
          initiatorId,
        );
        assetId = asset.id;
        expect(asset.residualValue).toEqual(Money.ZERO); // category.residualPct defaults to 0

        // ==== depreciation run: create -> submit -> REAL approve -> post (P-30) ====
        const run = await source.transaction("REPEATABLE READ", (em) => depreciationRunsService.createRun(em, periodId, initiatorId));
        runId = run.id;
        expect(run.status).toBe("DRAFT");

        const runLines = await lineRepository.findByRunId(run.id);
        expect(runLines).toHaveLength(1);
        expect(runLines[0].amount).toEqual(Money.fromDecimalString("1000.00")); // (24000-0)/24

        const submittedRun = await source.transaction("REPEATABLE READ", (em) =>
          depreciationRunsService.submitForApproval(em, run.id, initiatorId),
        );
        expect(submittedRun.status).toBe("PENDING_APPROVAL");
        expect(submittedRun.approvalRef).toBeTruthy();

        const decidedRunInstance = await approvalEngine.decide(submittedRun.approvalRef!, approverId, "APPROVE");
        expect(decidedRunInstance.status).toBe("APPROVED");

        const postedRun = await source.transaction("REPEATABLE READ", (em) => depreciationRunsService.post(em, run.id, approverId));
        expect(postedRun.status).toBe("POSTED");
        expect(postedRun.journalId).toBeTruthy();

        // ---- P-30 balanced: dep-expense debited 1000, accum-dep credited 1000 ----
        const [journalTotals]: Array<{ total_debit: string; total_credit: string }> = await source.query(
          `SELECT COALESCE(SUM(debit),0)::text AS total_debit, COALESCE(SUM(credit),0)::text AS total_credit FROM app.gl_journal_line WHERE journal_id = $1`,
          [postedRun.journalId],
        );
        expect(Money.fromDecimalString(journalTotals.total_debit)).toEqual(Money.fromDecimalString(journalTotals.total_credit));

        const [depExpenseNet]: Array<{ net: string }> = await source.query(
          `SELECT COALESCE(SUM(debit) - SUM(credit), 0)::text AS net FROM app.gl_journal_line WHERE journal_id = $1 AND account_id = $2`,
          [postedRun.journalId, depExpenseAccount.id],
        );
        expect(Money.fromDecimalString(depExpenseNet.net)).toEqual(Money.fromDecimalString("1000.00"));

        const [accumDepNet]: Array<{ net: string }> = await source.query(
          `SELECT COALESCE(SUM(credit) - SUM(debit), 0)::text AS net FROM app.gl_journal_line WHERE journal_id = $1 AND account_id = $2`,
          [postedRun.journalId, accumDepAccount.id],
        );
        expect(Money.fromDecimalString(accumDepNet.net)).toEqual(Money.fromDecimalString("1000.00"));

        const assetAfterDep = await assetRepository.findByIdOrFail(asset.id);
        expect(assetAfterDep.accumDepreciation).toEqual(Money.fromDecimalString("1000.00"));

        // ==== disposal: create (SALE, proceeds 20,000.00 -> a 3,000.00 LOSS) -> submit -> decide -> post (P-31) ====
        // NBV at disposal = 24000 - 1000 = 23000; gain_loss = 20000 - 23000 = -3000
        const disposal = await source.transaction("REPEATABLE READ", (em) =>
          disposalService.create(em, { assetId: asset.id, method: "SALE", proceeds: Money.fromInt(20000) }, initiatorId),
        );
        disposalId = disposal.id;
        expect(disposal.gainLoss).toEqual(Money.fromDecimalString("-3000.00"));

        const submittedDisposal = await source.transaction("REPEATABLE READ", (em) =>
          disposalService.submitForApproval(em, disposal.id, initiatorId),
        );
        expect(submittedDisposal.status).toBe("PENDING_APPROVAL");

        const approvedDisposal = await source.transaction("REPEATABLE READ", (em) =>
          disposalService.onApprovalDecided(em, disposal.id, true, approverId),
        );
        expect(approvedDisposal.status).toBe("APPROVED");

        const postedDisposal = await source.transaction("REPEATABLE READ", (em) => disposalService.post(em, disposal.id, approverId));
        expect(postedDisposal.status).toBe("POSTED");
        expect(postedDisposal.journalId).toBeTruthy();

        // ---- P-31 balanced: debit proceeds(20000)+accumDep(1000)+loss(3000)=24000, credit cost(24000) ----
        const [disposalTotals]: Array<{ total_debit: string; total_credit: string }> = await source.query(
          `SELECT COALESCE(SUM(debit),0)::text AS total_debit, COALESCE(SUM(credit),0)::text AS total_credit FROM app.gl_journal_line WHERE journal_id = $1`,
          [postedDisposal.journalId],
        );
        expect(Money.fromDecimalString(disposalTotals.total_debit)).toEqual(Money.fromDecimalString(disposalTotals.total_credit));
        expect(Money.fromDecimalString(disposalTotals.total_debit)).toEqual(Money.fromDecimalString("24000.00"));

        const [lossNet]: Array<{ net: string }> = await source.query(
          `SELECT COALESCE(SUM(debit) - SUM(credit), 0)::text AS net FROM app.gl_journal_line WHERE journal_id = $1 AND account_id = $2`,
          [postedDisposal.journalId, lossAccount.id],
        );
        expect(Money.fromDecimalString(lossNet.net)).toEqual(Money.fromDecimalString("3000.00"));

        const [costNet]: Array<{ net: string }> = await source.query(
          `SELECT COALESCE(SUM(credit) - SUM(debit), 0)::text AS net FROM app.gl_journal_line WHERE journal_id = $1 AND account_id = $2`,
          [postedDisposal.journalId, costAccount.id],
        );
        expect(Money.fromDecimalString(costNet.net)).toEqual(Money.fromDecimalString("24000.00"));

        // ---- final asset state: DISPOSED, accum_depreciation unchanged by disposal itself ----
        const finalAsset = await assetRepository.findByIdOrFail(asset.id);
        expect(finalAsset.status).toBe("DISPOSED");
        expect(finalAsset.accumDepreciation).toEqual(Money.fromDecimalString("1000.00"));
      } finally {
        if (disposalId) await source.query(`DELETE FROM app.fa_disposal WHERE id = $1`, [disposalId]);
        if (runId) {
          await source.query(`DELETE FROM app.fa_depreciation_line WHERE run_id = $1`, [runId]);
          await source.query(`DELETE FROM app.fa_depreciation_run WHERE id = $1`, [runId]);
        }
        if (assetId) await source.query(`DELETE FROM app.fa_asset WHERE id = $1`, [assetId]);
        if (categoryId) await source.query(`DELETE FROM app.fa_category WHERE id = $1`, [categoryId]);
        // Both users are still RESTRICT-referenced by the real appr_instance/appr_action rows the
        // depreciation-run approval + disposal approval flows above created
        // (fk_appr_instance_initiator_id/fk_appr_action_actor_id) — this test never captured every
        // instance id it submitted, so best-effort per-row delete (same precedent as
        // banking-e2e.integration.spec.ts's gl_account cleanup loop) rather than one batched
        // statement that would abort entirely on the first blocked row.
        for (const userId of [initiatorId, approverId]) {
          try {
            await source.query(`DELETE FROM app.usr_user WHERE id = $1`, [userId]);
          } catch {
            // expected — see comment above.
          }
        }
        // Journals reference gl_account via RESTRICT — journals themselves are
        // never deleted (append-only); only throwaway gl_account rows this
        // test itself created are best-effort cleaned up (the two category
        // leaves DO have journal lines pointing at them post-P-30/P-31 and
        // will fail to delete — left in place intentionally, same as every
        // other e2e capstone's own convention).
        for (const accountId of createdAccountIds) {
          try {
            await source.query(`DELETE FROM app.gl_account WHERE id = $1`, [accountId]);
          } catch {
            // has postings — expected, left in place.
          }
        }
        // gl_period/gl_fiscal_year are still RESTRICT-referenced by the real, permanently-immutable
        // gl_journal rows P-30/P-31 posted (fk_gl_journal_period_id) — same "left as inert,
        // uniquely-suffixed residue" precedent as every other e2e capstone's own GL cleanup
        // (e.g. posting.integration.spec.ts, accounting-triggers.integration.spec.ts).
      }
    },
    60000,
  );
});

/** REUSE-or-create, never overwrite — see `expenses-e2e.integration.spec.ts`'s identical helper for the full rationale. */
async function upsertSingleLevelWorkflow(source: DataSource, domainCode: string, name: string, roleId: string): Promise<void> {
  const existing: Array<{ id: string }> = await source.query(`SELECT id FROM app.appr_workflow_def WHERE domain_code = $1`, [domainCode]);
  if (existing.length > 0) return;

  const defRows: Array<{ id: string }> = await source.query(
    `INSERT INTO app.appr_workflow_def (id, domain_code, name, is_active) VALUES ($1, $2, $3, true) RETURNING id`,
    [generateUuidV7(), domainCode, name],
  );
  const workflowDefId = defRows[0].id;

  const versionRows: Array<{ id: string }> = await source.query(
    `INSERT INTO app.appr_workflow_version (id, workflow_def_id, "version", is_current) VALUES ($1, $2, 1, true) RETURNING id`,
    [generateUuidV7(), workflowDefId],
  );
  const workflowVersionId = versionRows[0].id;

  await source.query(
    `INSERT INTO app.appr_level (id, workflow_version_id, seq, approver_type, role_id, mode, quorum) VALUES ($1, $2, 1, 'ROLE', $3, 'SEQUENTIAL', 1)`,
    [generateUuidV7(), workflowVersionId, roleId],
  );
}
