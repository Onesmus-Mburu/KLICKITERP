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

import { BankAccountEntity } from "../domain/bank-account.entity";
import { BankAccountRepository } from "../infrastructure/bank-account.repository";
import { BankTransferEntity } from "../domain/bank-transfer.entity";
import { BankTransferRepository } from "../infrastructure/bank-transfer.repository";
import { BankStatementImportEntity } from "../domain/bank-statement-import.entity";
import { BankStatementImportRepository } from "../infrastructure/bank-statement-import.repository";
import { BankStatementLineEntity } from "../domain/bank-statement-line.entity";
import { BankStatementLineRepository } from "../infrastructure/bank-statement-line.repository";
import { BankReconciliationEntity } from "../domain/bank-reconciliation.entity";
import { BankReconciliationRepository } from "../infrastructure/bank-reconciliation.repository";
import { BankReconMatchEntity } from "../domain/bank-recon-match.entity";
import { BankReconMatchRepository } from "../infrastructure/bank-recon-match.repository";

import { BankAccountsService } from "../application/bank-accounts.service";
import { BankTransfersService, BANK_TRANSFERS_APPROVAL_DOMAIN_CODE } from "../application/bank-transfers.service";
import { BankStatementImportService } from "../application/bank-statement-import.service";
import { ReconciliationService } from "../application/reconciliation.service";
import { BANK_CHARGES_EXPENSE_ACCOUNT_CODE } from "../application/gl-banking-accounts.util";

/**
 * Module 16 (Banking) capstone integration test — mirrors
 * `domains/expenses/__tests__/expenses-e2e.integration.spec.ts`'s pattern
 * (real repository/service instances, no Nest DI, self-skips without a
 * reachable Postgres). One continuous flow:
 *   (1) create 2 bank accounts;
 *   (2) transfer between them, create -> submit -> approve -> post, asserting
 *       a balanced P-32 journal and that TRANSFER_CLEARING nets to zero;
 *   (3) import a small synthetic 2-line statement against the destination
 *       account (one line matching the transfer by ref+amount, one a bank
 *       charge with no match);
 *   (4) auto-match — asserts the ref-matching line is matched by pass 1;
 *   (5) create a P-33 adjustment for the bank-charge line;
 *   (6) lock the reconciliation — asserts book_balance == bank_balance and
 *       an empty outstanding snapshot (everything reconciled).
 */
describe("banking module — end-to-end capstone (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(`[banking-e2e.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`);
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it(
    "transfer create->submit->approve->post (P-32); import->auto-match->adjust (P-33)->lock",
    async () => {
      if (!dbAvailable || !dataSource) {
        console.warn("[banking-e2e.integration.spec] SKIPPED (no DB) — end-to-end banking capstone flow");
        return;
      }
      const source = dataSource;
      const suffix = `${Date.now()}`.slice(-8);

      const fiscalYearId = generateUuidV7();
      const periodId = generateUuidV7();
      await source.query(
        `INSERT INTO app.gl_fiscal_year (id, name, starts_on, ends_on, status) VALUES ($1, $2, '2015-01-01', '2035-12-31', 'OPEN')`,
        [fiscalYearId, `BK-E2E-FY-${suffix}`],
      );
      await source.query(
        `INSERT INTO app.gl_period (id, fiscal_year_id, seq, starts_on, ends_on, status) VALUES ($1, $2, 1, '2015-01-01', '2035-12-31', 'OPEN')`,
        [periodId, fiscalYearId],
      );

      const createdGlAccountIds: string[] = [];
      const fromGlAccountId = await createAccount(source, `E2AF${suffix}`, "E2E Source Bank GL", "ASSET", createdGlAccountIds);
      const toGlAccountId = await createAccount(source, `E2AT${suffix}`, "E2E Dest Bank GL", "ASSET", createdGlAccountIds);
      const clearingAccountId = await reuseOrCreateControlAccount(source, "TRANSFER_CLEARING", `E2CL${suffix}`, "E2E Transfer Clearing", "ASSET", createdGlAccountIds);
      const bankChargesAccountId = await reuseOrCreateByExistingCode(source, BANK_CHARGES_EXPENSE_ACCOUNT_CODE, "Bank Charges Expense", "EXPENSE", createdGlAccountIds);
      void clearingAccountId;

      const actorId = generateUuidV7();
      await source.query(
        `INSERT INTO app.usr_user (id, username, password_hash, full_name, status, phone) VALUES ($1, $2, 'hash', 'E2E Actor', 'ACTIVE', $3)`,
        // phone is varchar(20); "+2547" (5 chars) + the 8-digit `suffix` here is well within
        // budget — `.slice(0, 13)` was truncating the WHOLE string, not just the digits, which is
        // harmless with this file's already-shortened `suffix` but is inconsistent with (and was
        // copy-pasted from) the other e2e specs where it truncated a 13-digit Date.now() suffix
        // down to 8 real digits of resolution and caused uq_usr_user_phone_p collisions across
        // runs within the same ~100s window. Removed for consistency; harmless here either way.
        [actorId, `bk-e2e-actor-${suffix}`, `+2547${suffix}`],
      );

      const roleId = await upsertThrowawayRole(source, `BK-E2E-ROLE-${suffix}`);
      await upsertSingleLevelWorkflow(source, BANK_TRANSFERS_APPROVAL_DOMAIN_CODE, "Bank Transfer Approval (E2E)", roleId);

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
        {} as never,
        {} as never,
        {} as never,
        { write: async () => undefined } as never,
      );

      const bankAccountRepository = new BankAccountRepository(source.getRepository(BankAccountEntity));
      const transferRepository = new BankTransferRepository(source.getRepository(BankTransferEntity));
      const statementImportRepository = new BankStatementImportRepository(source.getRepository(BankStatementImportEntity));
      const statementLineRepository = new BankStatementLineRepository(source.getRepository(BankStatementLineEntity));
      const reconciliationRepository = new BankReconciliationRepository(source.getRepository(BankReconciliationEntity));
      const matchRepository = new BankReconMatchRepository(source.getRepository(BankReconMatchEntity));
      const periodRepository = new GlPeriodRepository(source.getRepository(GlPeriodEntity));
      const periodAccountTotalRepository = new GlPeriodAccountTotalRepository(source.getRepository(GlPeriodAccountTotalEntity));

      const bankAccountsService = new BankAccountsService(bankAccountRepository, glAccountRepository);
      const transfersService = new BankTransfersService(
        transferRepository,
        bankAccountRepository,
        glAccountRepository,
        postingService,
        numberingService,
        approvalEngine,
      );
      const statementImportService = new BankStatementImportService(bankAccountRepository, statementImportRepository, statementLineRepository);
      const reconciliationService = new ReconciliationService(
        reconciliationRepository,
        matchRepository,
        statementLineRepository,
        bankAccountRepository,
        glAccountRepository,
        periodRepository,
        periodAccountTotalRepository,
        postingService,
      );

      let fromAccountId: string | null = null;
      let toAccountId: string | null = null;
      let transferId: string | null = null;
      let importId: string | null = null;
      let reconciliationId: string | null = null;
      let fileObjectId: string | null = null;

      try {
        // ==== (1) two bank accounts ====
        const fromAccount = await bankAccountsService.create(
          { name: `E2E Source Bank ${suffix}`, kind: "BANK", glAccountId: fromGlAccountId },
          actorId,
        );
        const toAccount = await bankAccountsService.create(
          { name: `E2E Dest Bank ${suffix}`, kind: "BANK", glAccountId: toGlAccountId },
          actorId,
        );
        fromAccountId = fromAccount.id;
        toAccountId = toAccount.id;

        // ==== (2) transfer create -> submit -> approve -> post (P-32) ====
        const transfer = await source.transaction("REPEATABLE READ", (em) =>
          transfersService.create(em, { fromAccountId: fromAccount.id, toAccountId: toAccount.id, amount: Money.fromInt(1000) }, actorId),
        );
        transferId = transfer.id;
        expect(transfer.status).toBe("DRAFT");

        const submitted = await source.transaction("REPEATABLE READ", (em) => transfersService.submitForApproval(em, transfer.id, actorId));
        expect(submitted.status).toBe("PENDING_APPROVAL");

        const approved = await source.transaction("REPEATABLE READ", (em) => transfersService.onApprovalDecided(em, transfer.id, true, actorId));
        expect(approved.status).toBe("APPROVED");

        const posted = await source.transaction("REPEATABLE READ", (em) => transfersService.post(em, transfer.id, actorId));
        expect(posted.status).toBe("POSTED");
        expect(posted.journalId).toBeTruthy();

        // ---- P-32 balanced + clearing nets to zero.
        const [journalTotals]: Array<{ total_debit: string; total_credit: string }> = await source.query(
          `SELECT COALESCE(SUM(debit),0)::text AS total_debit, COALESCE(SUM(credit),0)::text AS total_credit FROM app.gl_journal_line WHERE journal_id = $1`,
          [posted.journalId],
        );
        expect(Money.fromDecimalString(journalTotals.total_debit)).toEqual(Money.fromDecimalString(journalTotals.total_credit));

        const [clearingNet]: Array<{ net: string }> = await source.query(
          `SELECT COALESCE(SUM(debit) - SUM(credit), 0)::text AS net FROM app.gl_journal_line WHERE journal_id = $1 AND account_id = $2`,
          [posted.journalId, clearingAccountId],
        );
        expect(Money.fromDecimalString(clearingNet.net).isZero()).toBe(true);

        const [fromNet]: Array<{ net: string }> = await source.query(
          `SELECT COALESCE(SUM(credit) - SUM(debit), 0)::text AS net FROM app.gl_journal_line WHERE journal_id = $1 AND account_id = $2`,
          [posted.journalId, fromGlAccountId],
        );
        expect(Money.fromDecimalString(fromNet.net)).toEqual(Money.fromInt(1000));

        const [toNet]: Array<{ net: string }> = await source.query(
          `SELECT COALESCE(SUM(debit) - SUM(credit), 0)::text AS net FROM app.gl_journal_line WHERE journal_id = $1 AND account_id = $2`,
          [posted.journalId, toGlAccountId],
        );
        expect(Money.fromDecimalString(toNet.net)).toEqual(Money.fromInt(1000));

        // ==== (3) import a small synthetic statement against the DESTINATION account ====
        // fk_bank_statement_import_file_id is a real, enforced FK to app.file_object — a
        // random/nonexistent fileId fails at INSERT time, so a real (throwaway) row is required.
        const newFileObjectId = generateUuidV7();
        fileObjectId = newFileObjectId;
        await source.query(
          `INSERT INTO app.file_object (id, bucket, object_key, original_name, mime, size_bytes, sha256, uploaded_by)
           VALUES ($1, 'banking-e2e', $2, 'statement.csv', 'text/csv', 128, $3, $4)`,
          [newFileObjectId, `banking-e2e/${suffix}/statement.csv`, "0".repeat(64), actorId],
        );

        // ReconciliationService.autoMatch()'s pass 1 matches on the PARENT gl_journal's own
        // `number` (the closest thing a journal line has to an externally-visible reference — see
        // that class's own "autoMatch()'s 3-pass algorithm" doc comment), NOT `posted.number`
        // (bank_transfer's own separately-allocated "BANK_TRANSFER" series document number, a
        // completely different value from the journal's own "GL_JOURNAL"-series number).
        const [postedJournal]: Array<{ number: string }> = await source.query(
          `SELECT number FROM app.gl_journal WHERE id = $1`,
          [posted.journalId],
        );

        const today = new Date().toISOString().slice(0, 10);
        const importResult = await source.transaction("REPEATABLE READ", (em) =>
          statementImportService.importLines(em, {
            accountId: toAccount.id,
            fileId: newFileObjectId,
            mappingTemplate: {
              columnMap: { date: "date", description: "description", amount: "amount", ref: "ref" },
              dateFormat: "YYYY-MM-DD",
              debitCreditConvention: "SIGNED_AMOUNT",
            },
            rawRows: [
              { date: today, description: "Incoming transfer", amount: "1000.00", ref: postedJournal.number },
              { date: today, description: "Monthly bank charge", amount: "-25.00" },
            ],
          }),
        );
        importId = importResult.import.id;
        expect(importResult.insertedCount).toBe(2);
        expect(importResult.duplicateCount).toBe(0);

        // ==== (4) start + auto-match ====
        const reconciliation = await source.transaction("REPEATABLE READ", (em) =>
          reconciliationService.start(em, { accountId: toAccount.id, periodId }, actorId),
        );
        reconciliationId = reconciliation.id;
        expect(reconciliation.status).toBe("IN_PROGRESS");

        const autoMatchResult = await source.transaction("REPEATABLE READ", (em) => reconciliationService.autoMatch(em, reconciliation.id));
        expect(autoMatchResult.pass1Matches).toBe(1); // the ref+amount-matching transfer leg

        const linesAfterMatch = await statementLineRepository.list({ accountId: toAccount.id });
        const chargeLine = linesAfterMatch.find((line) => line.description === "Monthly bank charge")!;
        expect(chargeLine.reconState).toBe("UNMATCHED");
        const matchedLine = linesAfterMatch.find((line) => line.description === "Incoming transfer")!;
        expect(matchedLine.reconState).toBe("MATCHED");

        // ==== (5) create a P-33 adjustment for the bank-charge line ====
        const adjustmentMatch = await source.transaction("REPEATABLE READ", (em) =>
          reconciliationService.createAdjustment(em, reconciliation.id, chargeLine.id, { kind: "CHARGE", amount: Money.fromInt(25) }, actorId),
        );
        expect(adjustmentMatch.adjustmentJournalId).toBeTruthy();

        const [chargeDebit]: Array<{ net: string }> = await source.query(
          `SELECT COALESCE(SUM(debit) - SUM(credit), 0)::text AS net FROM app.gl_journal_line WHERE journal_id = $1 AND account_id = $2`,
          [adjustmentMatch.adjustmentJournalId, bankChargesAccountId],
        );
        expect(Money.fromDecimalString(chargeDebit.net)).toEqual(Money.fromInt(25));

        // ==== (6) lock — book_balance should equal bank_balance, nothing left outstanding ====
        const locked = await source.transaction("REPEATABLE READ", (em) => reconciliationService.lock(em, reconciliation.id, actorId));
        expect(locked.status).toBe("LOCKED");
        expect(locked.bookBalance.equals(locked.bankBalance)).toBe(true);
        expect(locked.bookBalance).toEqual(Money.fromInt(975)); // 1000 - 25
        const outstanding = locked.outstanding as { unmatchedStatementLines: unknown[]; unreconciledJournalLines: unknown[] };
        expect(outstanding.unmatchedStatementLines).toHaveLength(0);
      } finally {
        if (reconciliationId) {
          await source.query(`DELETE FROM app.bank_recon_match WHERE reconciliation_id = $1`, [reconciliationId]);
          await source.query(`DELETE FROM app.bank_reconciliation WHERE id = $1`, [reconciliationId]);
        }
        if (importId) {
          await source.query(`DELETE FROM app.bank_statement_line WHERE import_id = $1`, [importId]);
          await source.query(`DELETE FROM app.bank_statement_import WHERE id = $1`, [importId]);
        }
        if (fileObjectId) {
          // fk_bank_statement_import_file_id is RESTRICT — safe to delete only after the import
          // row above is gone.
          await source.query(`DELETE FROM app.file_object WHERE id = $1`, [fileObjectId]);
        }
        if (transferId) {
          await source.query(`DELETE FROM app.bank_transfer WHERE id = $1`, [transferId]);
        }
        if (fromAccountId) await source.query(`DELETE FROM app.bank_account WHERE id = $1`, [fromAccountId]);
        if (toAccountId) await source.query(`DELETE FROM app.bank_account WHERE id = $1`, [toAccountId]);
        // actorId initiated a real appr_instance (the transfer's approval workflow) —
        // fk_appr_instance_initiator_id is RESTRICT, so this user can't be deleted while that
        // approval instance still exists. Left as inert, uniquely-suffixed residue, same precedent
        // as this file's own already-documented GL-immutability leftovers below.
        // Journals reference gl_account via RESTRICT — journals themselves are
        // never deleted (append-only, per this codebase's own convention);
        // only the throwaway gl_account rows this test itself created are
        // cleaned up, and only the ones with no journal lines pointing at them
        // (the two bank leaf accounts and the throwaway TRANSFER_CLEARING one,
        // if created fresh, all DO have journal lines — deliberately left in
        // place, same as every other e2e capstone in this codebase; only
        // truly-unused accounts are removed).
        for (const accountId of createdGlAccountIds) {
          try {
            await source.query(`DELETE FROM app.gl_account WHERE id = $1`, [accountId]);
          } catch {
            // Has postings (trg_gl_account_deactivation_only) — expected for
            // the bank leaf/clearing/charges accounts once P-32/P-33 posted;
            // left in place intentionally, same as other e2e specs' own
            // "best-effort cleanup" convention.
          }
        }
        // Best-effort, same convention as the gl_account loop above: since
        // `GlPeriodRepository.findCurrentForDate()` now resolves
        // deterministically (see its own doc comment) rather than landing on
        // an arbitrary row when multiple fiscal years' periods overlap the
        // same date, P-32/P-33's journals now correctly land in THIS test's
        // own freshly-created period — which means `fk_gl_journal_period_id`
        // now legitimately blocks deleting it (previously this delete always
        // "succeeded" only because the pre-fix ambiguity usually meant no
        // journal actually referenced this exact period — see
        // docs/phase-5/PROGRESS.md's Phase 5 Full Verification section).
        try {
          await source.query(`DELETE FROM app.gl_period WHERE id = $1`, [periodId]);
          await source.query(`DELETE FROM app.gl_fiscal_year WHERE id = $1`, [fiscalYearId]);
        } catch {
          // Has postings — expected now that period resolution is correct; left in place.
        }
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

async function createAccount(source: DataSource, code: string, name: string, klass: string, createdAccountIds: string[]): Promise<string> {
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
  return createAccount(source, code, name, klass, createdAccountIds);
}

/** Reuses an already-seeded ACTIVE+POSTABLE account for `controlDomain` if present (resolveControlAccount's own exactly-one invariant), otherwise creates a fresh one tagged with it. */
async function reuseOrCreateControlAccount(
  source: DataSource,
  controlDomain: string,
  code: string,
  name: string,
  klass: string,
  createdAccountIds: string[],
): Promise<string> {
  const existing: Array<{ id: string }> = await source.query(
    `SELECT id FROM app.gl_account WHERE control_domain = $1 AND is_active = true AND is_postable = true LIMIT 1`,
    [controlDomain],
  );
  if (existing.length > 0) return existing[0].id;

  const id = generateUuidV7();
  await source.query(
    `INSERT INTO app.gl_account (id, code, name, class, is_postable, is_control, control_domain, is_active) VALUES ($1, $2, $3, $4, true, true, $5, true)`,
    [id, code, name, klass, controlDomain],
  );
  createdAccountIds.push(id);
  return id;
}

async function upsertThrowawayRole(source: DataSource, name: string): Promise<string> {
  const rows: Array<{ id: string }> = await source.query(
    `INSERT INTO app.usr_role (id, name, description, is_system_template, is_auditor_class) VALUES ($1, $2, 'E2E throwaway role', false, false)
     ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description RETURNING id`,
    [generateUuidV7(), name],
  );
  return rows[0].id;
}

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
