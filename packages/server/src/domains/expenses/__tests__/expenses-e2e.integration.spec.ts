import { DataSource } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { Money } from "../../../shared/money/money";

import { SetNumberingSeriesEntity } from "../../../platform/settings/domain/set-numbering-series.entity";
import { SetNumberingSeriesRepository } from "../../../platform/settings/infrastructure/set-numbering-series.repository";
import { NumberingService } from "../../../platform/settings/application/numbering.service";
import { AcademicCalendarService } from "../../../platform/settings/application/academic-calendar.service";

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
import { GlBudgetEntity } from "../../../accounting/domain/gl-budget.entity";
import { GlBudgetRepository } from "../../../accounting/infrastructure/gl-budget.repository";
import { GlBudgetLineEntity } from "../../../accounting/domain/gl-budget-line.entity";
import { GlBudgetLineRepository } from "../../../accounting/infrastructure/gl-budget-line.repository";

import { ApprWorkflowDefRepository } from "../../../platform/approvals/infrastructure/appr-workflow-def.repository";
import { ApprWorkflowVersionRepository } from "../../../platform/approvals/infrastructure/appr-workflow-version.repository";
import { ApprLevelRepository } from "../../../platform/approvals/infrastructure/appr-level.repository";
import { ApprRoutingRuleRepository } from "../../../platform/approvals/infrastructure/appr-routing-rule.repository";
import { ApprInstanceRepository } from "../../../platform/approvals/infrastructure/appr-instance.repository";
import { ApprActionRepository } from "../../../platform/approvals/infrastructure/appr-action.repository";
import { ApprWorkflowDefEntity } from "../../../platform/approvals/domain/appr-workflow-def.entity";
import { ApprWorkflowVersionEntity } from "../../../platform/approvals/domain/appr-workflow-version.entity";
import { ApprLevelEntity } from "../../../platform/approvals/domain/appr-level.entity";
import { ApprRoutingRuleEntity } from "../../../platform/approvals/domain/appr-routing-rule.entity";
import { ApprInstanceEntity } from "../../../platform/approvals/domain/appr-instance.entity";
import { ApprActionEntity } from "../../../platform/approvals/domain/appr-action.entity";
import { ApprovalEngineService } from "../../../platform/approvals/application/approval-engine.service";

import { ExpCategoryEntity } from "../domain/exp-category.entity";
import { ExpCategoryRepository } from "../infrastructure/exp-category.repository";
import { ExpVoucherEntity } from "../domain/exp-voucher.entity";
import { ExpVoucherRepository } from "../infrastructure/exp-voucher.repository";
import { ExpPettyCashFloatEntity } from "../domain/exp-petty-cash-float.entity";
import { ExpPettyCashFloatRepository } from "../infrastructure/exp-petty-cash-float.repository";
import { ExpPettyCashVoucherEntity } from "../domain/exp-petty-cash-voucher.entity";
import { ExpPettyCashVoucherRepository } from "../infrastructure/exp-petty-cash-voucher.repository";
import { ExpReplenishmentEntity } from "../domain/exp-replenishment.entity";
import { ExpReplenishmentRepository } from "../infrastructure/exp-replenishment.repository";
import { VouchersService, EXPENSES_APPROVAL_DOMAIN_CODE } from "../application/vouchers.service";
import { PettyCashService, PETTY_CASH_REPLENISHMENT_APPROVAL_DOMAIN_CODE } from "../application/petty-cash.service";
import { PETTY_CASH_FLOAT_ACCOUNT_CODE } from "../application/expense-clearing-accounts.util";

/**
 * Module 14 (Expenses) capstone integration test — mirrors
 * `domains/wallet/__tests__/wallet-e2e.integration.spec.ts`'s pattern (real
 * repository/service instances, no Nest DI, self-skips without a reachable
 * Postgres). Two independent flows:
 *  (1) voucher create -> submit -> approve -> pay, asserting a balanced P-25
 *      journal (debit the category's expense account, credit the CASH
 *      clearing account 1010) and the final PAID/journal_id state;
 *  (2) float create -> spend twice (no GL postings, per FR-EXP-003.1) ->
 *      request+approve+execute a replenishment, asserting a balanced P-26
 *      journal (debit `1015 Petty Cash Float`, credit `1020 Bank`) and the
 *      float's final restored balance.
 *
 * `submit()`'s `ApprovalEngineService.submit()` call needs a real,
 * registered `appr_workflow_def`/`appr_workflow_version`/`appr_level` under
 * the exact `EXPENSES`/`PETTY_CASH_REPLENISHMENT` domain codes — this test
 * idempotently upserts throwaway single-level ROLE-based workflows under
 * those exact codes (mirroring `0900`'s own `seedSingleLevelWorkflow()`
 * shape) rather than assuming migration `0900` has already run, so it works
 * against both a freshly-migrated and a fully-seeded database. The
 * "approve" steps never call the real `ApprovalEngineService.decide()` —
 * `VouchersService.onApprovalDecided()`/`PettyCashService.onApprovalDecided()`
 * are this module's own documented manual-trigger interim pattern (no event
 * dispatcher exists anywhere in this codebase), so a real `decide()` call
 * (which needs `UsersService`/`DepartmentsService` role resolution) isn't
 * required for this flow to genuinely exercise P-25/P-26.
 */
describe("expenses module — end-to-end capstone (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(`[expenses-e2e.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`);
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it(
    "voucher: create -> submit -> approve -> pay (P-25); float: spend x2 -> request+approve+execute replenishment (P-26)",
    async () => {
      if (!dbAvailable || !dataSource) {
        console.warn("[expenses-e2e.integration.spec] SKIPPED (no DB) — end-to-end expenses capstone flow");
        return;
      }
      const source = dataSource;
      const suffix = Date.now();

      // ---- Wide-enough gl_period.
      const fiscalYearId = generateUuidV7();
      const periodId = generateUuidV7();
      await source.query(
        `INSERT INTO app.gl_fiscal_year (id, name, starts_on, ends_on, status) VALUES ($1, $2, '2015-01-01', '2035-12-31', 'OPEN')`,
        [fiscalYearId, `EXP-E2E-FY-${String(suffix).slice(-8)}`],
      );
      await source.query(
        `INSERT INTO app.gl_period (id, fiscal_year_id, seq, starts_on, ends_on, status) VALUES ($1, $2, 1, '2015-01-01', '2035-12-31', 'OPEN')`,
        [periodId, fiscalYearId],
      );

      const createdAccountIds: string[] = [];
      const expenseAccountId = await reuseOrCreateAccountByCode(source, `EXP-E2E-CAT-${String(suffix).slice(-6)}`, "E2E Office Supplies Expense", "EXPENSE", createdAccountIds);
      const cashAccountId = await reuseOrCreateByExistingCode(source, "1010", "Petty Cash", "ASSET", createdAccountIds);
      const bankAccountId = await reuseOrCreateByExistingCode(source, "1020", "Bank - Operating Account", "ASSET", createdAccountIds);
      const floatAccountId = await reuseOrCreateByExistingCode(source, PETTY_CASH_FLOAT_ACCOUNT_CODE, "Petty Cash Float", "ASSET", createdAccountIds);

      const actorId = generateUuidV7();
      const custodianId = generateUuidV7();
      await source.query(
        `INSERT INTO app.usr_user (id, username, password_hash, full_name, status, phone) VALUES ($1, $2, 'hash', 'E2E Actor', 'ACTIVE', $3)`,
        // phone is varchar(20); "+2547" (5 chars) + a 13-digit Date.now() suffix is 18 chars, well
        // within budget — previously `.slice(0, 13)` truncated the WHOLE string (not just the
        // suffix) down to the first 8 digits of the timestamp, so phone only changed once per
        // ~100 real seconds and collided across test files/runs inside that window
        // (uq_usr_user_phone_p). Keep the full suffix instead.
        [actorId, `exp-e2e-actor-${suffix}`, `+2547${suffix}`],
      );
      await source.query(
        `INSERT INTO app.usr_user (id, username, password_hash, full_name, status, phone) VALUES ($1, $2, 'hash', 'E2E Custodian', 'ACTIVE', $3)`,
        [custodianId, `exp-e2e-cust-${suffix}`, `+2546${suffix}`],
      );

      const roleId = await upsertThrowawayRole(source, `EXP-E2E-ROLE-${suffix}`);
      await upsertSingleLevelWorkflow(source, EXPENSES_APPROVAL_DOMAIN_CODE, "Expense Voucher Approval (E2E)", roleId);
      await upsertSingleLevelWorkflow(source, PETTY_CASH_REPLENISHMENT_APPROVAL_DOMAIN_CODE, "Petty Cash Replenishment Approval (E2E)", roleId);

      const categoryId = generateUuidV7();
      await source.query(
        `INSERT INTO app.exp_category (id, name, gl_expense_account_id, budget_required, is_active) VALUES ($1, $2, $3, false, true)`,
        [categoryId, `EXP-E2E-CATEGORY-${suffix}`, expenseAccountId],
      );

      // ---- Real repository/service instantiation (no Nest DI).
      const glAccountRepository = new GlAccountRepository(source.getRepository(GlAccountEntity));
      const numberingSeriesRepository = new SetNumberingSeriesRepository(source.getRepository(SetNumberingSeriesEntity));
      const numberingService = new NumberingService(numberingSeriesRepository, {} as AcademicCalendarService);
      const postingService = new PostingService(
        new GlJournalRepository(source.getRepository(GlJournalEntity)),
        new GlJournalLineRepository(source.getRepository(GlJournalLineEntity)),
        new GlPeriodAccountTotalRepository(source.getRepository(GlPeriodAccountTotalEntity)),
        glAccountRepository,
        new GlPeriodRepository(source.getRepository(GlPeriodEntity)),
        numberingService,
      );

      const approvalEngine = new ApprovalEngineService(
        source,
        new ApprWorkflowDefRepository(source.getRepository(ApprWorkflowDefEntity)),
        new ApprWorkflowVersionRepository(source.getRepository(ApprWorkflowVersionEntity)),
        new ApprLevelRepository(source.getRepository(ApprLevelEntity)),
        new ApprRoutingRuleRepository(source.getRepository(ApprRoutingRuleEntity)),
        new ApprInstanceRepository(source.getRepository(ApprInstanceEntity)),
        new ApprActionRepository(source.getRepository(ApprActionEntity)),
        {} as never, // usersService — unreachable for a no-routing-rule single-level submit()
        {} as never, // departmentsService — unreachable, same reason
        {} as never, // delegationsService — unreachable, decide() is never called in this test
        { write: async () => undefined } as never, // outboxWriter stub
      );

      const categoryRepository = new ExpCategoryRepository(source.getRepository(ExpCategoryEntity));
      const voucherRepository = new ExpVoucherRepository(source.getRepository(ExpVoucherEntity));
      const floatRepository = new ExpPettyCashFloatRepository(source.getRepository(ExpPettyCashFloatEntity));
      const pcVoucherRepository = new ExpPettyCashVoucherRepository(source.getRepository(ExpPettyCashVoucherEntity));
      const replenishmentRepository = new ExpReplenishmentRepository(source.getRepository(ExpReplenishmentEntity));
      const settingsServiceStub = { getTyped: async <T>(_key: string, defaultValue: T): Promise<T> => defaultValue } as never;
      const filesServiceStub = { listByEntity: async () => [] } as never;
      const budgetRepository = new GlBudgetRepository(source.getRepository(GlBudgetEntity));
      const budgetLineRepository = new GlBudgetLineRepository(source.getRepository(GlBudgetLineEntity));
      const periodRepository = new GlPeriodRepository(source.getRepository(GlPeriodEntity));
      const periodAccountTotalRepository = new GlPeriodAccountTotalRepository(source.getRepository(GlPeriodAccountTotalEntity));

      const vouchersService = new VouchersService(
        voucherRepository,
        categoryRepository,
        postingService,
        numberingService,
        approvalEngine,
        settingsServiceStub,
        filesServiceStub,
        glAccountRepository,
        budgetRepository,
        budgetLineRepository,
        periodRepository,
        periodAccountTotalRepository,
      );

      const pettyCashService = new PettyCashService(
        floatRepository,
        pcVoucherRepository,
        replenishmentRepository,
        categoryRepository,
        glAccountRepository,
        postingService,
        numberingService,
        approvalEngine,
      );

      let voucherId: string | null = null;
      let floatId: string | null = null;

      try {
        // ==== FLOW 1: voucher create -> submit -> approve -> pay (P-25) ====
        const voucher = await source.transaction("REPEATABLE READ", (em) =>
          vouchersService.create(
            { payeeType: "OTHER", payeeRef: { name: "Stationery Shop" }, categoryId, amount: Money.fromInt(400), method: "CASH", narrative: "Office supplies" },
            actorId,
            em,
          ),
        );
        voucherId = voucher.id;
        expect(voucher.status).toBe("DRAFT");

        const submitted = await source.transaction("REPEATABLE READ", (em) => vouchersService.submit(em, voucher.id, actorId));
        expect(submitted.status).toBe("PENDING_APPROVAL");
        expect(submitted.approvalRef).toBeTruthy();

        const approved = await source.transaction("REPEATABLE READ", (em) => vouchersService.onApprovalDecided(em, voucher.id, true, actorId));
        expect(approved.status).toBe("APPROVED");

        const paid = await source.transaction("REPEATABLE READ", (em) => vouchersService.pay(em, voucher.id, actorId));
        expect(paid.status).toBe("PAID");
        expect(paid.journalId).toBeTruthy();
        expect(paid.number).not.toMatch(/^DRAFT-/);

        // ---- P-25 balanced: expense account debited, cash account credited, both = 400.
        const [expenseRow]: Array<{ balance: string }> = await source.query(
          `SELECT COALESCE(SUM(jl.debit) - SUM(jl.credit), 0)::text AS balance FROM app.gl_journal_line jl WHERE jl.account_id = $1 AND jl.journal_id = $2`,
          [expenseAccountId, paid.journalId],
        );
        expect(Money.fromDecimalString(expenseRow.balance)).toEqual(Money.fromInt(400));
        const [cashRow]: Array<{ balance: string }> = await source.query(
          `SELECT COALESCE(SUM(jl.credit) - SUM(jl.debit), 0)::text AS balance FROM app.gl_journal_line jl WHERE jl.account_id = $1 AND jl.journal_id = $2`,
          [cashAccountId, paid.journalId],
        );
        expect(Money.fromDecimalString(cashRow.balance)).toEqual(Money.fromInt(400));

        // ==== FLOW 2: float -> spend x2 -> request+approve+execute replenishment (P-26) ====
        const float = await source.transaction("REPEATABLE READ", (em) =>
          pettyCashService.createFloat(em, { custodianUserId: custodianId, ceiling: Money.fromInt(5000) }, actorId),
        );
        floatId = float.id;
        expect(float.balance).toEqual(Money.fromInt(5000));

        const spend1 = await source.transaction("REPEATABLE READ", (em) =>
          pettyCashService.spend(em, { floatId: float.id, categoryId, amount: Money.fromInt(300) }, actorId),
        );
        const spend2 = await source.transaction("REPEATABLE READ", (em) =>
          pettyCashService.spend(em, { floatId: float.id, categoryId, amount: Money.fromInt(150) }, actorId),
        );
        expect(spend1.status).toBe("APPROVED");
        expect(spend2.status).toBe("APPROVED");

        const afterSpends = await floatRepository.findByIdOrFail(float.id);
        expect(afterSpends.balance).toEqual(Money.fromInt(4550)); // 5000 - 300 - 150

        // No GL journals were posted for either spend (per FR-EXP-003.1).
        const [spendJournalCount]: Array<{ count: string }> = await source.query(
          `SELECT COUNT(*)::text AS count FROM app.gl_journal WHERE source_doc_type = 'exp_petty_cash_voucher'`,
        );
        expect(Number(spendJournalCount.count)).toBe(0);

        const replenishment = await source.transaction("REPEATABLE READ", (em) => pettyCashService.requestReplenishment(em, float.id, actorId));
        expect(replenishment.amount).toEqual(Money.fromInt(450)); // 300 + 150
        expect(replenishment.voucherIds.sort()).toEqual([spend1.id, spend2.id].sort());
        expect(replenishment.status).toBe("PENDING_APPROVAL");

        const replApproved = await source.transaction("REPEATABLE READ", (em) => pettyCashService.onApprovalDecided(em, replenishment.id, true));
        expect(replApproved.status).toBe("APPROVED");

        const executed = await source.transaction("REPEATABLE READ", (em) => pettyCashService.execute(em, replenishment.id, actorId));
        expect(executed.status).toBe("PAID");
        expect(executed.journalId).toBeTruthy();

        const afterReplenishment = await floatRepository.findByIdOrFail(float.id);
        expect(afterReplenishment.balance).toEqual(Money.fromInt(5000)); // fully restored to ceiling (4550 + 450)

        // ---- P-26 balanced: Petty Cash Float debited, Bank credited, both = 450.
        const [floatRow]: Array<{ balance: string }> = await source.query(
          `SELECT COALESCE(SUM(jl.debit) - SUM(jl.credit), 0)::text AS balance FROM app.gl_journal_line jl WHERE jl.account_id = $1 AND jl.journal_id = $2`,
          [floatAccountId, executed.journalId],
        );
        expect(Money.fromDecimalString(floatRow.balance)).toEqual(Money.fromInt(450));
        const [bankRow]: Array<{ balance: string }> = await source.query(
          `SELECT COALESCE(SUM(jl.credit) - SUM(jl.debit), 0)::text AS balance FROM app.gl_journal_line jl WHERE jl.account_id = $1 AND jl.journal_id = $2`,
          [bankAccountId, executed.journalId],
        );
        expect(Money.fromDecimalString(bankRow.balance)).toEqual(Money.fromInt(450));
      } finally {
        if (floatId) {
          await source.query(`DELETE FROM app.exp_replenishment WHERE float_id = $1`, [floatId]);
          await source.query(`DELETE FROM app.exp_petty_cash_voucher WHERE float_id = $1`, [floatId]);
          await source.query(`DELETE FROM app.exp_petty_cash_float WHERE id = $1`, [floatId]);
        }
        if (voucherId) {
          await source.query(`DELETE FROM app.exp_voucher WHERE id = $1`, [voucherId]);
        }
        await source.query(`DELETE FROM app.exp_category WHERE id = $1`, [categoryId]);
        // actorId is still RESTRICT-referenced by the real appr_instance/appr_action rows the
        // voucher approval + replenishment approval flows above created
        // (fk_appr_instance_initiator_id/fk_appr_action_actor_id) — this test never captured every
        // instance id it submitted, so best-effort per-row delete (same precedent as
        // banking-e2e.integration.spec.ts's gl_account cleanup loop) lets custodianId (unreferenced)
        // still be reclaimed instead of aborting the whole batched statement.
        for (const userId of [actorId, custodianId]) {
          try {
            await source.query(`DELETE FROM app.usr_user WHERE id = $1`, [userId]);
          } catch {
            // expected for actorId — see comment above.
          }
        }
        // Best-effort — accounts with real postings against them (BR-ACC-01) can't be deleted,
        // only deactivated (same precedent as banking-e2e.integration.spec.ts's own gl_account
        // cleanup loop); left in place intentionally rather than aborting the whole loop.
        for (const accountId of createdAccountIds) {
          try {
            await source.query(`DELETE FROM app.gl_account WHERE id = $1`, [accountId]);
          } catch {
            // has postings — expected, see comment above.
          }
        }
        // gl_period/gl_fiscal_year are RESTRICT-referenced by the now-permanent
        // gl_journal_line rows the postings above created (immutable, mirrors
        // trg_gl_journal_immutable) — deleting them fails by design. Left as inert,
        // uniquely-suffixed residue, same established pattern as
        // payments-e2e.integration.spec.ts.
        void periodId;
        void fiscalYearId;
        void bankAccountId;
      }
    },
    60000,
  );
});

/** Top-level `0900`-seeded CoA parent code per `gl_account.class` — `ck_gl_account_postable_needs_parent`
 * (migration `0060`) requires every `is_postable = true` row to have a real `parent_id`. */
const TOP_LEVEL_PARENT_CODE_BY_CLASS: Record<string, string> = {
  ASSET: "1000",
  LIABILITY: "2000",
  EQUITY: "3000",
  INCOME: "4000",
  EXPENSE: "5000",
};

async function reuseOrCreateAccountByCode(
  source: DataSource,
  code: string,
  name: string,
  klass: string,
  createdAccountIds: string[],
): Promise<string> {
  const id = generateUuidV7();
  const parentCode = TOP_LEVEL_PARENT_CODE_BY_CLASS[klass];
  const [parent] = parentCode ? await source.query(`SELECT id FROM app.gl_account WHERE code = $1`, [parentCode]) : [undefined];
  await source.query(
    `INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, is_active) VALUES ($1, $2, $3, $4, $5, true, false, true)`,
    [id, code, name, klass, parent?.id ?? null],
  );
  createdAccountIds.push(id);
  return id;
}

/** Reuses an already-seeded `0900` account by its well-known code if present, otherwise creates a throwaway one. */
async function reuseOrCreateByExistingCode(
  source: DataSource,
  code: string,
  name: string,
  klass: string,
  createdAccountIds: string[],
): Promise<string> {
  const existing: Array<{ id: string }> = await source.query(`SELECT id FROM app.gl_account WHERE code = $1`, [code]);
  if (existing.length > 0) return existing[0].id;
  return reuseOrCreateAccountByCode(source, code, name, klass, createdAccountIds);
}

async function upsertThrowawayRole(source: DataSource, name: string): Promise<string> {
  const rows: Array<{ id: string }> = await source.query(
    `INSERT INTO app.usr_role (id, name, description, is_system_template, is_auditor_class) VALUES ($1, $2, 'E2E throwaway role', false, false)
     ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description RETURNING id`,
    [generateUuidV7(), name],
  );
  return rows[0].id;
}

/**
 * REUSE-or-create, never overwrite — `0900`'s own `seedSingleLevelWorkflow()`
 * may already have registered a real workflow under this exact `domainCode`
 * (System Admin role) if migrations have already run against this database;
 * this helper must never clobber that with a throwaway role (this test may
 * run against a shared dev database, not always a disposable one). If a
 * `appr_workflow_def` row for `domainCode` already exists, it — and
 * whatever role its level(s) already resolve to — is reused as-is; a real
 * `decide()` call is never made in this test, so the exact role identity
 * doesn't matter, only that `submit()` finds a registered, active workflow.
 * Only creates fresh rows (with the throwaway role) when nothing exists yet.
 */
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
