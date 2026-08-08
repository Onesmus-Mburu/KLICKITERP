import { DataSource } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { runInTransaction } from "../../../shared/database/tx";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { Money } from "../../../shared/money/money";

import { AcademicCalendarService, NumberingService } from "../../../platform/settings";
import { SetAcademicYearEntity } from "../../../platform/settings/domain/set-academic-year.entity";
import { SetTermEntity } from "../../../platform/settings/domain/set-term.entity";
import { SetAcademicYearRepository } from "../../../platform/settings/infrastructure/set-academic-year.repository";
import { SetTermRepository } from "../../../platform/settings/infrastructure/set-term.repository";
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

import { ApprActionEntity } from "../../../platform/approvals/domain/appr-action.entity";
import { ApprInstanceEntity } from "../../../platform/approvals/domain/appr-instance.entity";
import { ApprLevelEntity } from "../../../platform/approvals/domain/appr-level.entity";
import { ApprRoutingRuleEntity } from "../../../platform/approvals/domain/appr-routing-rule.entity";
import { ApprWorkflowDefEntity } from "../../../platform/approvals/domain/appr-workflow-def.entity";
import { ApprWorkflowVersionEntity } from "../../../platform/approvals/domain/appr-workflow-version.entity";
import { ApprActionRepository } from "../../../platform/approvals/infrastructure/appr-action.repository";
import { ApprInstanceRepository } from "../../../platform/approvals/infrastructure/appr-instance.repository";
import { ApprLevelRepository } from "../../../platform/approvals/infrastructure/appr-level.repository";
import { ApprRoutingRuleRepository } from "../../../platform/approvals/infrastructure/appr-routing-rule.repository";
import { ApprWorkflowDefRepository } from "../../../platform/approvals/infrastructure/appr-workflow-def.repository";
import { ApprWorkflowVersionRepository } from "../../../platform/approvals/infrastructure/appr-workflow-version.repository";
import { ApprovalEngineService } from "../../../platform/approvals/application/approval-engine.service";

import { StdLedgerEntryEntity } from "../../students/domain/std-ledger-entry.entity";
import { StdLedgerEntryRepository } from "../../students/infrastructure/std-ledger-entry.repository";
import { StdStudentEntity } from "../../students/domain/std-student.entity";
import { StdStudentRepository } from "../../students/infrastructure/std-student.repository";
import { StudentLedgerService } from "../../students/application/student-ledger.service";
import { StdClassEntity } from "../../students/domain/std-class.entity";
import { StdClassRepository } from "../../students/infrastructure/std-class.repository";
import { StdStreamEntity } from "../../students/domain/std-stream.entity";
import { StdStreamRepository } from "../../students/infrastructure/std-stream.repository";

// Phase 6 Slice 16 (Part 1) — FeeStructuresService now takes a
// DocumentVerificationService (mints a docv_record token on publish()).
import { DocumentVerificationService } from "../../../platform/document-verification/application/document-verification.service";
import { DocvRecordEntity } from "../../../platform/document-verification/domain/docv-record.entity";
import { DocvRecordRepository } from "../../../platform/document-verification/infrastructure/docv-record.repository";

import { BillFeeCategoryEntity } from "../domain/bill-fee-category.entity";
import { BillFeeStructureEntity } from "../domain/bill-fee-structure.entity";
import { BillFeeStructureLineEntity } from "../domain/bill-fee-structure-line.entity";
import { BillInvoiceEntity } from "../domain/bill-invoice.entity";
import { BillInvoiceLineEntity } from "../domain/bill-invoice-line.entity";
import { BillConcessionEntity } from "../domain/bill-concession.entity";
import { BillConcessionSchemeEntity } from "../domain/bill-concession-scheme.entity";
import { BillCreditNoteEntity } from "../domain/bill-credit-note.entity";
import { BillCreditNoteLineEntity } from "../domain/bill-credit-note-line.entity";
import { BillLateFeePolicyEntity } from "../domain/bill-late-fee-policy.entity";
import { BillLateFeeBatchEntity } from "../domain/bill-late-fee-batch.entity";
import { BillStudentOptionalItemEntity } from "../domain/bill-student-optional-item.entity";
import { BillSponsorAwardEntity } from "../domain/bill-sponsor-award.entity";

import { BillFeeCategoryRepository } from "../infrastructure/bill-fee-category.repository";
import { BillFeeStructureLineRepository } from "../infrastructure/bill-fee-structure-line.repository";
import { BillFeeStructureRepository } from "../infrastructure/bill-fee-structure.repository";
import { BillStudentOptionalItemRepository } from "../infrastructure/bill-student-optional-item.repository";
import { BillInvoiceLineRepository } from "../infrastructure/bill-invoice-line.repository";
import { BillInvoiceRepository } from "../infrastructure/bill-invoice.repository";
import { BillConcessionRepository } from "../infrastructure/bill-concession.repository";
import { BillConcessionSchemeRepository } from "../infrastructure/bill-concession-scheme.repository";
import { BillSponsorAwardRepository } from "../infrastructure/bill-sponsor-award.repository";
import { BillCreditNoteLineRepository } from "../infrastructure/bill-credit-note-line.repository";
import { BillCreditNoteRepository } from "../infrastructure/bill-credit-note.repository";
import { BillLateFeeBatchRepository } from "../infrastructure/bill-late-fee-batch.repository";
import { BillLateFeePolicyRepository } from "../infrastructure/bill-late-fee-policy.repository";

import { FeeCategoriesService } from "../application/fee-categories.service";
import { FeeStructuresService } from "../application/fee-structures.service";
import { InvoicingService } from "../application/invoicing.service";
import { BILLING_CONCESSION_APPROVAL_DOMAIN_CODE, ConcessionsService } from "../application/concessions.service";
import { BILLING_CREDIT_NOTE_APPROVAL_DOMAIN_CODE, CreditNotesService } from "../application/credit-notes.service";
import { LateFeePoliciesService } from "../application/late-fee-policies.service";
import { LateFeeBatchesService } from "../application/late-fee-batches.service";

const SYSTEM_ADMIN_ROLE = "System Admin";

/**
 * Simulates the persistence side-effect of a real
 * `ApprovalEngineService.decide(instanceId, actorId, 'APPROVE')` call for a
 * single-level SEQUENTIAL/quorum=1 workflow (this pass's seeded shape) —
 * one `appr_action` row + `appr_instance` flipped to `APPROVED`. See the
 * describe block's doc comment "Why the approve step is simulated via raw
 * SQL" for why this test cannot call the real `decide()`.
 */
async function simulateApproval(source: DataSource, instanceId: string, actorId: string): Promise<void> {
  await source.query(
    `INSERT INTO app.appr_action (id, instance_id, level_seq, actor_id, decision, acted_at)
     VALUES ($1, $2, 1, $3, 'APPROVE', now())`,
    [generateUuidV7(), instanceId, actorId],
  );
  await source.query(
    `UPDATE app.appr_instance SET status = 'APPROVED', decided_at = now() WHERE id = $1`,
    [instanceId],
  );
}

/**
 * The capstone integration test for the whole Billing module (Pass A + Pass
 * B combined) — walks a realistic flow against real service instances and a
 * real Postgres instance: create a student, publish a fee structure,
 * generate+post an invoice (P-01), request+approve+post a concession (P-02,
 * now exercising a real `ApprovalEngineService.submit()` call against the
 * `BILLING_CONCESSION` `appr_workflow_def` the `0900` migration now seeds),
 * issue+post a credit note (P-06, same real `submit()` call against
 * `BILLING_CREDIT_NOTE`), then run a late-fee batch (P-05). Self-skips (not
 * fails) without Docker, same connectivity-probe pattern as every other
 * module's integration spec.
 *
 * **This test's assumption**: migrations UP TO AND INCLUDING `0900` have
 * already been run against whatever Postgres instance it eventually executes
 * against — the whole point is to prove the `0900` seed's new
 * `BILLING_CONCESSION`/`BILLING_CREDIT_NOTE` `appr_workflow_def`/
 * `appr_workflow_version`/`appr_level` rows are real and load-bearing
 * (before this pass, `ApprovalEngineService.submit()` would reject both with
 * "no active appr_workflow_def registered"). It looks up the seeded
 * `System Admin` `usr_role` by name and asserts the seeded `appr_level` for
 * each domain code is wired to it exactly as the task spec'd (ROLE,
 * SEQUENTIAL, quorum=1) — a failure here is a genuine signal the seed
 * migration didn't do its job.
 *
 * **Why the "approve" step is simulated via raw SQL, not
 * `ApprovalEngineService.decide()`**: `decide()`'s ROLE-authorization path
 * calls `UsersService.listActiveUsersByRoleId()` (`platform/users`), and
 * `domains/billing` is deliberately NOT permitted to depend on
 * `platform/users` at all (see `module-deps.json`'s `domains/billing` entry
 * — "`platform/users` is still deliberately NOT in this list"). Constructing
 * a real `UsersService` from a file under `domains/billing/__tests__/` would
 * violate that boundary (and does — `eslint`'s `import/no-restricted-paths`
 * catches it). `submit()` itself never touches `usersService`/
 * `departmentsService`/`delegationsService`/`outboxWriter` (only `decide()`/
 * `listPendingForApprover()` do), so those four constructor params are
 * harmless placeholders here — same "placeholder unused collaborator"
 * technique `posting.integration.spec.ts` already uses for
 * `NumberingService`'s `AcademicCalendarService`. The "approve" mutation
 * itself (`appr_instance.status='APPROVED'` + one `appr_action` row) is
 * simulated with a direct SQL statement identical in shape to what a real
 * `decide()` call persists for a single-level SEQUENTIAL/quorum=1 workflow —
 * `decide()`'s own correctness (authorization, self-approval rejection,
 * quorum/sequential advancement) is already thoroughly covered by
 * `platform/approvals`'s own unit + integration specs and is deliberately
 * not re-tested here.
 *
 * Every other fixture (student, GL accounts, fee category, concession
 * scheme, users) is created fresh with a `Date.now()` suffix and torn down
 * in `finally`, so this spec never depends on — or pollutes — any other
 * seeded/test data beyond the shared `System Admin` role lookup above.
 * Services are instantiated directly against real repository wrappers bound
 * to `AppDataSource.getRepository()`, mirroring
 * `accounting/__tests__/posting.integration.spec.ts`'s pattern.
 */
describe("billing module — end-to-end capstone (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(
        `[billing-e2e.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`,
      );
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it("walks create-student -> publish-structure -> post-invoice -> approve+post-concession -> approve+post-credit-note -> run-late-fee-batch, balanced at every GL step", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[billing-e2e.integration.spec] SKIPPED (no DB) — end-to-end billing capstone flow");
      return;
    }
    const source = dataSource;
    const suffix = Date.now();

    // ---- Wide-enough gl_period to cover both this test's own fixed dates
    // and "today" (CreditNotesService.post()/ConcessionsService.postStandalone()
    // both stamp journal_date with the real wall-clock date, not a
    // caller-supplied one) — same reasoning as every prior capstone spec's
    // fiscal-year/period fixture, just wider.
    const fiscalYearId = generateUuidV7();
    const periodId = generateUuidV7();
    await source.query(
      `INSERT INTO app.gl_fiscal_year (id, name, starts_on, ends_on, status) VALUES ($1, $2, '2015-01-01', '2035-12-31', 'OPEN')`,
      [fiscalYearId, `E2E-FY-${suffix}`],
    );
    await source.query(
      `INSERT INTO app.gl_period (id, fiscal_year_id, seq, starts_on, ends_on, status) VALUES ($1, $2, 1, '2015-01-01', '2035-12-31', 'OPEN')`,
      [periodId, fiscalYearId],
    );

    // ---- AR-Student control account: reuse the seeded one if `0900` already
    // ran (the normal case), else create a throwaway one — `resolveControlAccount()`
    // requires EXACTLY ONE active+postable AR_STUDENT account, so this test
    // must never create a second one alongside an already-seeded row.
    const existingArStudent: Array<{ id: string }> = await source.query(
      `SELECT id FROM app.gl_account WHERE control_domain = 'AR_STUDENT' AND is_active = true AND is_postable = true`,
    );
    let arStudentAccountId: string;
    let createdArStudentAccount = false;
    if (existingArStudent.length === 1) {
      arStudentAccountId = existingArStudent[0].id;
    } else if (existingArStudent.length === 0) {
      arStudentAccountId = generateUuidV7();
      createdArStudentAccount = true;
      // ck_gl_account_postable_needs_parent (migration 0060) requires is_postable=true rows to
      // have a real parent_id — hang this off the seeded top-level Assets account.
      const [arAssetsParent] = await source.query(`SELECT id FROM app.gl_account WHERE code = '1000'`);
      await source.query(
        `INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, control_domain, is_active)
         VALUES ($1, $2, 'E2E AR Student', 'ASSET', $3, true, true, 'AR_STUDENT', true)`,
        [arStudentAccountId, `E2E-AR-${String(suffix).slice(-8)}`, arAssetsParent?.id ?? null],
      );
    } else {
      throw new Error(
        `billing-e2e.integration.spec: ${existingArStudent.length} active/postable AR_STUDENT gl_account rows found — configuration anomaly, cannot resolve a single control account`,
      );
    }

    // ---- Late-fee income category: reuse the `0900`-seeded row if present, else create one fresh.
    const lateFeeCategoryName = "Late Fee Income";
    const existingLateFeeCategory: Array<{ id: string; gl_income_account_id: string }> = await source.query(
      `SELECT id, gl_income_account_id FROM app.bill_fee_category WHERE name = $1`,
      [lateFeeCategoryName],
    );
    let lateFeeCategoryId: string;
    let lateFeeIncomeAccountId: string | null = null;
    let createdLateFeeCategory = false;
    if (existingLateFeeCategory.length > 0) {
      lateFeeCategoryId = existingLateFeeCategory[0].id;
    } else {
      lateFeeIncomeAccountId = generateUuidV7();
      lateFeeCategoryId = generateUuidV7();
      createdLateFeeCategory = true;
      const [lfiIncomeParent] = await source.query(`SELECT id FROM app.gl_account WHERE code = '4000'`);
      await source.query(
        `INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, is_active)
         VALUES ($1, $2, 'E2E Late Fee Income', 'INCOME', $3, true, false, true)`,
        [lateFeeIncomeAccountId, `E2E-LFI-${String(suffix).slice(-8)}`, lfiIncomeParent?.id ?? null],
      );
      await source.query(
        `INSERT INTO app.bill_fee_category (id, name, gl_income_account_id, taxable, is_active, priority)
         VALUES ($1, $2, $3, false, true, 0)`,
        [lateFeeCategoryId, lateFeeCategoryName, lateFeeIncomeAccountId],
      );
    }

    // ---- Student + academic scaffolding (raw SQL — mirrors billing-triggers.integration.spec.ts's fixture pattern).
    const academicYearId = generateUuidV7();
    const termId = generateUuidV7();
    const classId = generateUuidV7();
    const studentId = generateUuidV7();
    await source.query(
      `INSERT INTO app.set_academic_year (id, name, starts_on, ends_on) VALUES ($1, $2, '2020-01-01', '2020-12-31')`,
      [academicYearId, `E2E-AY-${suffix}`],
    );
    await source.query(
      `INSERT INTO app.set_term (id, academic_year_id, name, seq, starts_on, ends_on)
       VALUES ($1, $2, 'Term 1', 1, '2020-01-01', '2020-04-30')`,
      [termId, academicYearId],
    );
    await source.query(`INSERT INTO app.std_class (id, name, level) VALUES ($1, $2, 1)`, [classId, `E2E-CLASS-${suffix}`]);
    await source.query(
      `INSERT INTO app.std_student (id, admission_no, first_name, last_name, class_id, status, boarding, enrolled_on)
       VALUES ($1, $2, 'Capstone', 'Student', $3, 'ACTIVE', 'DAY', '2020-01-01')`,
      [studentId, `E2E-ADM-${suffix}`, classId],
    );

    // ---- Tuition fee category + income account.
    const tuitionIncomeAccountId = generateUuidV7();
    const [tuiIncomeParent] = await source.query(`SELECT id FROM app.gl_account WHERE code = '4000'`);
    await source.query(
      `INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, is_active)
       VALUES ($1, $2, 'E2E Tuition Income', 'INCOME', $3, true, false, true)`,
      [tuitionIncomeAccountId, `E2E-TUI-${String(suffix).slice(-8)}`, tuiIncomeParent?.id ?? null],
    );

    // ---- Concession scheme + contra account.
    const concessionSchemeAccountId = generateUuidV7();
    const concessionSchemeId = generateUuidV7();
    const [concExpenseParent] = await source.query(`SELECT id FROM app.gl_account WHERE code = '5000'`);
    await source.query(
      `INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, is_active)
       VALUES ($1, $2, 'E2E Concession Contra', 'EXPENSE', $3, true, false, true)`,
      [concessionSchemeAccountId, `E2E-CONC-${String(suffix).slice(-8)}`, concExpenseParent?.id ?? null],
    );
    await source.query(
      `INSERT INTO app.bill_concession_scheme (id, name, kind, calc, value, gl_account_id, is_active)
       VALUES ($1, $2, 'DISCOUNT', 'FIXED', 1000.00, $3, true)`,
      [concessionSchemeId, `E2E Sibling Discount ${suffix}`, concessionSchemeAccountId],
    );

    // ---- Two fresh users: an initiator, and an approver granted the seeded "System Admin" role
    // (the single ROLE-based level the 0900 seed's BILLING_CONCESSION/BILLING_CREDIT_NOTE workflows use).
    const systemAdminRoleRows: Array<{ id: string }> = await source.query(
      `SELECT id FROM app.usr_role WHERE name = $1`,
      [SYSTEM_ADMIN_ROLE],
    );
    if (systemAdminRoleRows.length === 0) {
      throw new Error(
        `billing-e2e.integration.spec: no "${SYSTEM_ADMIN_ROLE}" usr_role found — has migration 0900 been run against this database?`,
      );
    }
    const systemAdminRoleId = systemAdminRoleRows[0].id;

    // Directly assert the `0900` seed's workflow shape for both domain codes
    // this pass registered: one active appr_workflow_def, one is_current
    // appr_workflow_version, one seq=1 ROLE/SEQUENTIAL/quorum=1 appr_level
    // wired to the seeded "System Admin" role — the exact acceptance
    // criteria this pass's task brief specified.
    for (const domainCode of [BILLING_CONCESSION_APPROVAL_DOMAIN_CODE, BILLING_CREDIT_NOTE_APPROVAL_DOMAIN_CODE]) {
      const levelRows: Array<{ seq: number; approver_type: string; role_id: string; mode: string; quorum: number }> =
        await source.query(
          `SELECT l.seq, l.approver_type, l.role_id, l.mode, l.quorum
           FROM app.appr_level l
           JOIN app.appr_workflow_version v ON v.id = l.workflow_version_id
           JOIN app.appr_workflow_def d ON d.id = v.workflow_def_id
           WHERE d.domain_code = $1 AND d.is_active = true AND v.is_current = true`,
          [domainCode],
        );
      expect(levelRows).toHaveLength(1);
      expect(levelRows[0].seq).toBe(1);
      expect(levelRows[0].approver_type).toBe("ROLE");
      expect(levelRows[0].role_id).toBe(systemAdminRoleId);
      expect(levelRows[0].mode).toBe("SEQUENTIAL");
      expect(levelRows[0].quorum).toBe(1);
    }

    const initiatorUserId = generateUuidV7();
    const approverUserId = generateUuidV7();
    await source.query(
      `INSERT INTO app.usr_user (id, username, email, password_hash, full_name, status, user_type)
       VALUES ($1, $2, $3, 'x', 'E2E Initiator', 'ACTIVE', 'STAFF')`,
      [initiatorUserId, `e2e_initiator_${suffix}`, `e2e_initiator_${suffix}@example.test`],
    );
    await source.query(
      `INSERT INTO app.usr_user (id, username, email, password_hash, full_name, status, user_type)
       VALUES ($1, $2, $3, 'x', 'E2E Approver', 'ACTIVE', 'STAFF')`,
      [approverUserId, `e2e_approver_${suffix}`, `e2e_approver_${suffix}@example.test`],
    );
    await source.query(
      `INSERT INTO app.usr_user_role (id, user_id, role_id) VALUES ($1, $2, $3)`,
      [generateUuidV7(), approverUserId, systemAdminRoleId],
    );

    // ---- Service instantiation (real repositories, no Nest DI — see class doc comment).
    const feeCategoryRepository = new BillFeeCategoryRepository(source.getRepository(BillFeeCategoryEntity));
    const glAccountRepository = new GlAccountRepository(source.getRepository(GlAccountEntity));
    const feeCategoriesService = new FeeCategoriesService(feeCategoryRepository, glAccountRepository);

    const studentRepository = new StdStudentRepository(source.getRepository(StdStudentEntity));
    const feeStructureRepository = new BillFeeStructureRepository(source.getRepository(BillFeeStructureEntity));
    const feeStructureLineRepository = new BillFeeStructureLineRepository(source.getRepository(BillFeeStructureLineEntity));
    // Hoisted above its original declaration point (was alongside invoiceLineRepository etc.
    // below) — FeeStructuresService now needs it too (Phase 6 Slice 3b's delete() safety check).
    const invoiceRepository = new BillInvoiceRepository(source.getRepository(BillInvoiceEntity));
    // `AcademicCalendarService`'s real constructor — `findTermByIdOrFail()` (the only method
    // `FeeStructuresService` calls) never touches `outboxWriter` (only `setCurrentYear`/
    // `setCurrentTerm` do), so a harmless placeholder is used for it, same "placeholder unused
    // collaborator" technique this file's own class doc comment documents for
    // `ApprovalEngineService`'s usersService/departmentsService/delegationsService/outboxWriter.
    const academicCalendarService = new AcademicCalendarService(
      source,
      new SetAcademicYearRepository(source.getRepository(SetAcademicYearEntity)),
      new SetTermRepository(source.getRepository(SetTermEntity)),
      {} as ConstructorParameters<typeof AcademicCalendarService>[3],
    );
    // Phase 6 Slice 16 (Part 1) — real repositories/service, same "real
    // instance, no Nest DI" discipline every collaborator above follows.
    const classRepository = new StdClassRepository(source.getRepository(StdClassEntity));
    const streamRepository = new StdStreamRepository(source.getRepository(StdStreamEntity));
    const documentVerificationService = new DocumentVerificationService(
      new DocvRecordRepository(source.getRepository(DocvRecordEntity)),
    );
    const feeStructuresService = new FeeStructuresService(
      feeStructureRepository,
      feeStructureLineRepository,
      studentRepository,
      academicCalendarService,
      invoiceRepository,
      source,
      feeCategoryRepository,
      classRepository,
      streamRepository,
      documentVerificationService,
    );

    const numberingService = new NumberingService(
      // `allocate()` works directly off the caller's EntityManager for a
      // fresh (reset_policy=NEVER on first use) series and never touches
      // either collaborator — same precedent as `posting.integration.spec.ts`.
      {} as ConstructorParameters<typeof NumberingService>[0],
      {} as ConstructorParameters<typeof NumberingService>[1],
    );
    const postingService = new PostingService(
      new GlJournalRepository(source.getRepository(GlJournalEntity)),
      new GlJournalLineRepository(source.getRepository(GlJournalLineEntity)),
      new GlPeriodAccountTotalRepository(source.getRepository(GlPeriodAccountTotalEntity)),
      glAccountRepository,
      new GlPeriodRepository(source.getRepository(GlPeriodEntity)),
      numberingService,
    );

    const ledgerEntryRepository = new StdLedgerEntryRepository(source.getRepository(StdLedgerEntryEntity));
    const studentLedgerService = new StudentLedgerService(ledgerEntryRepository);

    const invoiceLineRepository = new BillInvoiceLineRepository(source.getRepository(BillInvoiceLineEntity));
    const optionalItemRepository = new BillStudentOptionalItemRepository(source.getRepository(BillStudentOptionalItemEntity));
    const concessionRepository = new BillConcessionRepository(source.getRepository(BillConcessionEntity));
    const concessionSchemeRepository = new BillConcessionSchemeRepository(source.getRepository(BillConcessionSchemeEntity));
    const sponsorAwardRepository = new BillSponsorAwardRepository(source.getRepository(BillSponsorAwardEntity));

    const invoicingService = new InvoicingService(
      invoiceRepository,
      invoiceLineRepository,
      feeStructureLineRepository,
      optionalItemRepository,
      feeCategoryRepository,
      concessionRepository,
      concessionSchemeRepository,
      sponsorAwardRepository,
      studentRepository,
      feeStructuresService,
      glAccountRepository,
      postingService,
      numberingService,
      studentLedgerService,
    );

    // ---- Approvals: real ApprovalEngineService, but see class doc comment
    // "Why the approve step is simulated via raw SQL" — usersService/
    // departmentsService/delegationsService/outboxWriter are harmless
    // placeholders `submit()` never touches (domains/billing may not depend
    // on platform/users at all, per module-deps.json).
    const approvalEngineService = new ApprovalEngineService(
      source,
      new ApprWorkflowDefRepository(source.getRepository(ApprWorkflowDefEntity)),
      new ApprWorkflowVersionRepository(source.getRepository(ApprWorkflowVersionEntity)),
      new ApprLevelRepository(source.getRepository(ApprLevelEntity)),
      new ApprRoutingRuleRepository(source.getRepository(ApprRoutingRuleEntity)),
      new ApprInstanceRepository(source.getRepository(ApprInstanceEntity)),
      new ApprActionRepository(source.getRepository(ApprActionEntity)),
      {} as ConstructorParameters<typeof ApprovalEngineService>[7],
      {} as ConstructorParameters<typeof ApprovalEngineService>[8],
      {} as ConstructorParameters<typeof ApprovalEngineService>[9],
      {} as ConstructorParameters<typeof ApprovalEngineService>[10],
    );

    const concessionsService = new ConcessionsService(
      concessionRepository,
      concessionSchemeRepository,
      invoiceRepository,
      invoiceLineRepository,
      glAccountRepository,
      postingService,
      studentLedgerService,
      approvalEngineService,
      source,
    );

    const creditNoteRepository = new BillCreditNoteRepository(source.getRepository(BillCreditNoteEntity));
    const creditNoteLineRepository = new BillCreditNoteLineRepository(source.getRepository(BillCreditNoteLineEntity));
    const creditNotesService = new CreditNotesService(
      creditNoteRepository,
      creditNoteLineRepository,
      invoiceRepository,
      invoiceLineRepository,
      feeCategoryRepository,
      glAccountRepository,
      postingService,
      numberingService,
      studentLedgerService,
      approvalEngineService,
      source,
    );

    const lateFeePolicyRepository = new BillLateFeePolicyRepository(source.getRepository(BillLateFeePolicyEntity));
    const lateFeePoliciesService = new LateFeePoliciesService(lateFeePolicyRepository);
    const lateFeeBatchRepository = new BillLateFeeBatchRepository(source.getRepository(BillLateFeeBatchEntity));
    const lateFeeBatchesService = new LateFeeBatchesService(
      lateFeeBatchRepository,
      lateFeePolicyRepository,
      invoiceRepository,
      feeCategoryRepository,
      invoicingService,
      approvalEngineService,
      source,
    );

    // ==== State captured for assertions + teardown ====
    let structureId: string | null = null;
    let invoiceId: string | null = null;
    let invoiceJournalId: string | null = null;
    let concessionId: string | null = null;
    let concessionInstanceId: string | null = null;
    let concessionJournalId: string | null = null;
    let creditNoteId: string | null = null;
    let creditNoteInstanceId: string | null = null;
    let creditNoteJournalId: string | null = null;
    let lateFeePolicyId: string | null = null;
    let lateFeeBatchId: string | null = null;
    let lateFeeInvoiceId: string | null = null;
    let lateFeeInvoiceJournalId: string | null = null;

    try {
      // ---- 1. Tuition fee category (via the real service).
      const tuitionCategory = await feeCategoriesService.create(
        { name: `E2E Tuition ${suffix}`, glIncomeAccountId: tuitionIncomeAccountId },
        initiatorUserId,
      );

      // ---- 2. Fee structure: draft (year-scoped, Phase 6 Slice 3b), one mandatory line, publish.
      const structure = await feeStructuresService.createDraft({ academicYearId, classId }, initiatorUserId);
      structureId = structure.id;
      await feeStructuresService.addLine(
        structure.id,
        { feeCategoryId: tuitionCategory.id, termId, dueDate: "2020-06-01", amount: Money.fromInt(10_000) },
        initiatorUserId,
      );
      const publishedStructure = await feeStructuresService.publish(structure.id, initiatorUserId);
      expect(publishedStructure.status).toBe("PUBLISHED");

      // ---- 3. Generate + post the invoice (P-01).
      const draftInvoice = await runInTransaction(source, (manager) =>
        invoicingService.generateInvoice(manager, {
          studentId,
          termId,
          source: "STRUCTURE",
          issueDate: "2020-06-01",
          dueDate: "2020-06-01",
          createdBy: initiatorUserId,
        }),
      );
      invoiceId = draftInvoice.id;
      const postedInvoice = await runInTransaction(source, (manager) =>
        invoicingService.postInvoice(manager, draftInvoice.id, initiatorUserId),
      );
      expect(postedInvoice.status).toBe("POSTED");
      expect(postedInvoice.total.equals(Money.fromInt(10_000))).toBe(true);
      invoiceJournalId = postedInvoice.journalId;

      const invoiceLines = await source
        .getRepository(GlJournalLineEntity)
        .find({ where: { journalId: invoiceJournalId! } });
      const invoiceDebitTotal = invoiceLines.reduce((sum, l) => sum.add(l.debit), Money.ZERO);
      const invoiceCreditTotal = invoiceLines.reduce((sum, l) => sum.add(l.credit), Money.ZERO);
      expect(invoiceDebitTotal.equals(invoiceCreditTotal)).toBe(true);
      expect(invoiceDebitTotal.equals(Money.fromInt(10_000))).toBe(true);

      // ---- 4. Concession: real submit() -> simulated approve -> onApprovalDecided -> postStandalone (P-02).
      const concession = await concessionsService.requestConcession(
        {
          kind: "DISCOUNT",
          schemeId: concessionSchemeId,
          studentId,
          invoiceId: postedInvoice.id,
          amount: Money.fromInt(1_000),
          reason: "Sibling discount",
        },
        initiatorUserId,
      );
      concessionId = concession.id;
      concessionInstanceId = concession.approvalRef;
      expect(concessionInstanceId).not.toBeNull();

      await simulateApproval(source, concessionInstanceId!, approverUserId);
      const decidedConcessionInstance = await source
        .getRepository(ApprInstanceEntity)
        .findOneOrFail({ where: { id: concessionInstanceId! } });
      expect(decidedConcessionInstance.status).toBe("APPROVED");

      await concessionsService.onApprovalDecided(concession.id, true, approverUserId);
      const postedConcession = await concessionsService.postStandalone(concession.id, approverUserId);
      expect(postedConcession.status).toBe("POSTED");
      concessionJournalId = postedConcession.journalId;

      const concessionLines = await source
        .getRepository(GlJournalLineEntity)
        .find({ where: { journalId: concessionJournalId! } });
      const concessionDebitTotal = concessionLines.reduce((sum, l) => sum.add(l.debit), Money.ZERO);
      const concessionCreditTotal = concessionLines.reduce((sum, l) => sum.add(l.credit), Money.ZERO);
      expect(concessionDebitTotal.equals(concessionCreditTotal)).toBe(true);
      expect(concessionDebitTotal.equals(Money.fromInt(1_000))).toBe(true);

      const afterConcessionInvoice = await invoiceRepository.findByIdOrFail(postedInvoice.id);
      expect(afterConcessionInvoice.paidAmount.equals(Money.fromInt(1_000))).toBe(true);
      expect(afterConcessionInvoice.balance.equals(Money.fromInt(9_000))).toBe(true);
      expect(afterConcessionInvoice.balance.equals(afterConcessionInvoice.total.subtract(afterConcessionInvoice.paidAmount))).toBe(true);

      // ---- 5. Credit note: create -> real submitForApproval() -> simulated approve -> onApprovalDecided -> post (P-06).
      const creditNoteDraft = await creditNotesService.create(
        {
          invoiceId: postedInvoice.id,
          reason: "Billing correction",
          lines: [{ feeCategoryId: tuitionCategory.id, amount: Money.fromInt(500) }],
        },
        initiatorUserId,
      );
      creditNoteId = creditNoteDraft.id;

      const submittedNote = await creditNotesService.submitForApproval(creditNoteDraft.id, initiatorUserId);
      creditNoteInstanceId = submittedNote.approvalRef;
      expect(creditNoteInstanceId).not.toBeNull();

      await simulateApproval(source, creditNoteInstanceId!, approverUserId);
      const decidedNoteInstance = await source
        .getRepository(ApprInstanceEntity)
        .findOneOrFail({ where: { id: creditNoteInstanceId! } });
      expect(decidedNoteInstance.status).toBe("APPROVED");

      await creditNotesService.onApprovalDecided(creditNoteDraft.id, true, approverUserId);
      const postedNote = await runInTransaction(source, (manager) =>
        creditNotesService.post(manager, creditNoteDraft.id, approverUserId),
      );
      expect(postedNote.status).toBe("POSTED");
      creditNoteJournalId = postedNote.journalId;

      const creditNoteLines = await source
        .getRepository(GlJournalLineEntity)
        .find({ where: { journalId: creditNoteJournalId! } });
      const creditNoteDebitTotal = creditNoteLines.reduce((sum, l) => sum.add(l.debit), Money.ZERO);
      const creditNoteCreditTotal = creditNoteLines.reduce((sum, l) => sum.add(l.credit), Money.ZERO);
      expect(creditNoteDebitTotal.equals(creditNoteCreditTotal)).toBe(true);
      expect(creditNoteDebitTotal.equals(Money.fromInt(500))).toBe(true);

      const afterCreditNoteInvoice = await invoiceRepository.findByIdOrFail(postedInvoice.id);
      expect(afterCreditNoteInvoice.paidAmount.equals(Money.fromInt(1_500))).toBe(true);
      expect(afterCreditNoteInvoice.balance.equals(Money.fromInt(8_500))).toBe(true);
      expect(afterCreditNoteInvoice.balance.equals(afterCreditNoteInvoice.total.subtract(afterCreditNoteInvoice.paidAmount))).toBe(true);

      // ---- 6. Late-fee batch (P-05) — requiresApproval=false, so runBatch() posts straight through.
      const policy = await lateFeePoliciesService.create(
        { name: `E2E Late Fee Policy ${suffix}`, mode: "FLAT", params: { amount: "50" }, graceDays: 0, requiresApproval: false },
        initiatorUserId,
      );
      lateFeePolicyId = policy.id;

      const batch = await lateFeeBatchesService.runBatch(policy.id, "2020-06-15", initiatorUserId);
      lateFeeBatchId = batch.id;
      expect(batch.status).toBe("POSTED");
      const summary = batch.summary as { totalAssessed: string; entries: Array<{ studentId: string; termId: string }> };
      expect(summary.entries).toHaveLength(1);
      expect(summary.entries[0].studentId).toBe(studentId);

      const lateFeeInvoiceRows: Array<{ id: string; journal_id: string }> = await source.query(
        `SELECT id, journal_id FROM app.bill_invoice WHERE student_id = $1 AND term_id = $2 AND source = 'ADHOC'`,
        [studentId, termId],
      );
      expect(lateFeeInvoiceRows).toHaveLength(1);
      lateFeeInvoiceId = lateFeeInvoiceRows[0].id;
      lateFeeInvoiceJournalId = lateFeeInvoiceRows[0].journal_id;

      const lateFeeJournalLines = await source
        .getRepository(GlJournalLineEntity)
        .find({ where: { journalId: lateFeeInvoiceJournalId! } });
      const lateFeeDebitTotal = lateFeeJournalLines.reduce((sum, l) => sum.add(l.debit), Money.ZERO);
      const lateFeeCreditTotal = lateFeeJournalLines.reduce((sum, l) => sum.add(l.credit), Money.ZERO);
      expect(lateFeeDebitTotal.equals(lateFeeCreditTotal)).toBe(true);
      expect(lateFeeDebitTotal.equals(Money.fromInt(50))).toBe(true);

      const lateFeeInvoice = await invoiceRepository.findByIdOrFail(lateFeeInvoiceId);
      expect(lateFeeInvoice.status).toBe("POSTED");
      expect(lateFeeInvoice.balance.equals(lateFeeInvoice.total.subtract(lateFeeInvoice.paidAmount))).toBe(true);

      // ---- 7. Student-ledger net consistency across the whole flow:
      // +10,000 (invoice P-01) - 1,000 (concession P-02) - 500 (credit note P-06) + 50 (late-fee invoice P-01) = 8,550,
      // which must equal the sum of the two invoices' own outstanding balances (9,000-500=8,500 original + 50 late-fee = 8,550).
      const statement = await studentLedgerService.getStatement(studentId);
      expect(statement.length).toBeGreaterThan(0);
      const finalRunningBalance = statement[statement.length - 1].runningBalance;
      expect(finalRunningBalance.equals(Money.fromInt(8_550))).toBe(true);
      expect(finalRunningBalance.equals(afterCreditNoteInvoice.balance.add(lateFeeInvoice.balance))).toBe(true);
    } finally {
      // Children before parents throughout, respecting every FK RESTRICT.
      if (lateFeeBatchId) {
        await source.query(`DELETE FROM app.bill_late_fee_batch WHERE id = $1`, [lateFeeBatchId]);
      }
      if (lateFeeInvoiceId) {
        await source.query(`DELETE FROM app.bill_invoice_line WHERE invoice_id = $1`, [lateFeeInvoiceId]);
        await source.query(`DELETE FROM app.bill_invoice WHERE id = $1`, [lateFeeInvoiceId]);
      }
      if (lateFeePolicyId) {
        await source.query(`DELETE FROM app.bill_late_fee_policy WHERE id = $1`, [lateFeePolicyId]);
      }
      if (creditNoteId) {
        await source.query(`DELETE FROM app.bill_credit_note_line WHERE credit_note_id = $1`, [creditNoteId]);
        await source.query(`DELETE FROM app.bill_credit_note WHERE id = $1`, [creditNoteId]);
      }
      if (concessionId) {
        await source.query(`DELETE FROM app.bill_concession WHERE id = $1`, [concessionId]);
      }
      const instanceIds = [concessionInstanceId, creditNoteInstanceId].filter((x): x is string => Boolean(x));
      if (instanceIds.length > 0) {
        await source.query(`DELETE FROM app.appr_action WHERE instance_id = ANY($1::uuid[])`, [instanceIds]);
        await source.query(`DELETE FROM app.appr_instance WHERE id = ANY($1::uuid[])`, [instanceIds]);
      }
      if (invoiceId) {
        await source.query(`DELETE FROM app.bill_invoice_line WHERE invoice_id = $1`, [invoiceId]);
        await source.query(`DELETE FROM app.bill_invoice WHERE id = $1`, [invoiceId]);
      }
      // structureId's line(s) are PUBLISHED (feeStructuresService.publish() above) and
      // trg_bill_structure_immutable (BR-BILL-03) unconditionally rejects UPDATE/DELETE on a
      // PUBLISHED structure's lines ("supersede with a new version instead") — this is a real,
      // deliberate immutability guarantee, not something a cleanup step should route around.
      // Left as inert, uniquely-suffixed residue, same treatment as the GL rows below.
      void structureId;

      const journalIds = [invoiceJournalId, concessionJournalId, creditNoteJournalId, lateFeeInvoiceJournalId].filter(
        (x): x is string => Boolean(x),
      );
      // gl_journal_line/gl_journal are permanently immutable once posted (trg_gl_journal_immutable,
      // BR-GEN-03 — DELETE unconditionally rejected, confirmed by direct testing); this test posts
      // real journals, so these rows are never reclaimable. Leaving them as inert, uniquely-suffixed
      // residue is safe — same precedent as reporting-foundation.integration.spec.ts's GL cleanup fix.
      void journalIds;

      const touchedAccountIds = [
        tuitionIncomeAccountId,
        concessionSchemeAccountId,
        ...(createdLateFeeCategory && lateFeeIncomeAccountId ? [lateFeeIncomeAccountId] : []),
        ...(createdArStudentAccount ? [arStudentAccountId] : []),
      ];
      // gl_period_account_total is writer-guarded (trg_gl_writer_guard) and, once real postings
      // exist, RESTRICT-referenced alongside gl_account by the now-permanent gl_journal_line rows
      // above — this delete would fail the same way. Left as inert residue for the same reason.
      void touchedAccountIds;

      await source.query(`DELETE FROM app.bill_concession_scheme WHERE id = $1`, [concessionSchemeId]);
      // The tuition bill_fee_category is still RESTRICT-referenced by structureId's own
      // permanently-residue bill_fee_structure_line (fk_bill_fee_structure_line_fee_category_id)
      // — same immutability chain as structureId itself above. Left as inert residue.
      if (createdLateFeeCategory) {
        // Only reachable once the late-fee invoice + its lines are already deleted above (the
        // only other referencer, fk_bill_invoice_line_fee_category_id) — genuinely safe to reclaim.
        await source.query(`DELETE FROM app.bill_fee_category WHERE id = $1`, [lateFeeCategoryId]);
      }

      // gl_account rows referenced by the now-permanent gl_journal_line rows above are also
      // RESTRICT-blocked from deletion — left as inert residue for the same reason.

      // std_student is still RESTRICT-referenced by the real std_ledger_entry rows this test's own
      // postings created (fk_std_ledger_entry_student_id — std_ledger_entry is an append-only
      // ledger with no delete path of its own, mirrors gl_journal_line's immutability). std_class/
      // set_term/set_academic_year are all still RESTRICT-referenced by structureId's own
      // permanently-residue bill_fee_structure row (fk_bill_fee_structure_class_id/_term_id/
      // _academic_year_id). All four left as inert, uniquely-suffixed residue for the same reason
      // as structureId/the GL rows above.

      // Deleting the users cascades their app.usr_user_role rows automatically (ON DELETE CASCADE, migration 0010).
      await source.query(`DELETE FROM app.usr_user WHERE id = ANY($1::uuid[])`, [[initiatorUserId, approverUserId]]);

      // gl_period/gl_fiscal_year are RESTRICT-referenced by the now-permanent
      // gl_journal_line rows the postings above created (immutable, mirrors
      // trg_gl_journal_immutable) — deleting them fails by design. Left as inert,
      // uniquely-suffixed residue, same established pattern as
      // payments-e2e.integration.spec.ts.
      void periodId;
      void fiscalYearId;
    }
  }, 60_000);

  /**
   * Phase 6 Slice 3b — Fee Structure Redesign, the real proof this works: a
   * SINGLE year-scoped fee structure with TWO lines sharing the same fee
   * category, priced differently in two different terms — published once —
   * then `generateInvoice()` called separately for each term against the
   * SAME student. Only `generateInvoice()` is exercised (not `postInvoice()`),
   * since the redesign's only production-code touch point is the STRUCTURE
   * resolution path (`FeeStructuresService.findApplicableFor()` +
   * `BillFeeStructureLineRepository.listByStructureAndTerm()`), and
   * `generateInvoice()` alone is sufficient to prove it end-to-end without
   * needing GL fiscal year/period/posting scaffolding at all.
   */
  it("Slice 3b: one year-scoped structure, two lines sharing a fee category across two different terms — generateInvoice() per term on the same student", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[billing-e2e.integration.spec] SKIPPED (no DB) — Slice 3b year-scoped structure proof");
      return;
    }
    const source = dataSource;
    const now = Date.now();
    const suffix = `${now}-3b`;
    const actorId = generateUuidV7(); // loose uuid, no FK (see BaseEntity's doc comment) — no real usr_user row needed.

    const academicYearId = generateUuidV7();
    const term1Id = generateUuidV7();
    const term2Id = generateUuidV7();
    const classId = generateUuidV7();
    const studentId = generateUuidV7();
    // set_academic_year.name is varchar(20) (migration 0030) — a short prefix is required to
    // fit the full millisecond timestamp.
    await source.query(
      `INSERT INTO app.set_academic_year (id, name, starts_on, ends_on) VALUES ($1, $2, '2021-01-01', '2021-12-31')`,
      [academicYearId, `AY3B-${now}`],
    );
    await source.query(
      `INSERT INTO app.set_term (id, academic_year_id, name, seq, starts_on, ends_on)
       VALUES ($1, $2, 'Term 1', 1, '2021-01-01', '2021-04-30')`,
      [term1Id, academicYearId],
    );
    await source.query(
      `INSERT INTO app.set_term (id, academic_year_id, name, seq, starts_on, ends_on)
       VALUES ($1, $2, 'Term 2', 2, '2021-05-01', '2021-08-31')`,
      [term2Id, academicYearId],
    );
    await source.query(`INSERT INTO app.std_class (id, name, level) VALUES ($1, $2, 1)`, [
      classId,
      `Slice3b-CLASS-${suffix}`,
    ]);
    await source.query(
      `INSERT INTO app.std_student (id, admission_no, first_name, last_name, class_id, status, boarding, enrolled_on)
       VALUES ($1, $2, 'Slice3b', 'Student', $3, 'ACTIVE', 'DAY', '2021-01-01')`,
      [studentId, `Slice3b-ADM-${suffix}`, classId],
    );

    const tuitionIncomeAccountId = generateUuidV7();
    const [tuiIncomeParent] = await source.query(`SELECT id FROM app.gl_account WHERE code = '4000'`);
    await source.query(
      `INSERT INTO app.gl_account (id, code, name, class, parent_id, is_postable, is_control, is_active)
       VALUES ($1, $2, 'Slice3b Tuition Income', 'INCOME', $3, true, false, true)`,
      [tuitionIncomeAccountId, `S3B-TUI-${String(suffix).slice(-8)}`, tuiIncomeParent?.id ?? null],
    );

    const feeCategoryRepository = new BillFeeCategoryRepository(source.getRepository(BillFeeCategoryEntity));
    const glAccountRepository = new GlAccountRepository(source.getRepository(GlAccountEntity));
    const feeCategoriesService = new FeeCategoriesService(feeCategoryRepository, glAccountRepository);

    const studentRepository = new StdStudentRepository(source.getRepository(StdStudentEntity));
    const feeStructureRepository = new BillFeeStructureRepository(source.getRepository(BillFeeStructureEntity));
    const feeStructureLineRepository = new BillFeeStructureLineRepository(
      source.getRepository(BillFeeStructureLineEntity),
    );
    const invoiceRepository = new BillInvoiceRepository(source.getRepository(BillInvoiceEntity));
    const academicCalendarService = new AcademicCalendarService(
      source,
      new SetAcademicYearRepository(source.getRepository(SetAcademicYearEntity)),
      new SetTermRepository(source.getRepository(SetTermEntity)),
      {} as ConstructorParameters<typeof AcademicCalendarService>[3],
    );
    // Phase 6 Slice 16 (Part 1) — real repositories/service, same "real
    // instance, no Nest DI" discipline every collaborator above follows.
    const classRepository = new StdClassRepository(source.getRepository(StdClassEntity));
    const streamRepository = new StdStreamRepository(source.getRepository(StdStreamEntity));
    const documentVerificationService = new DocumentVerificationService(
      new DocvRecordRepository(source.getRepository(DocvRecordEntity)),
    );
    const feeStructuresService = new FeeStructuresService(
      feeStructureRepository,
      feeStructureLineRepository,
      studentRepository,
      academicCalendarService,
      invoiceRepository,
      source,
      feeCategoryRepository,
      classRepository,
      streamRepository,
      documentVerificationService,
    );

    const invoiceLineRepository = new BillInvoiceLineRepository(source.getRepository(BillInvoiceLineEntity));
    const optionalItemRepository = new BillStudentOptionalItemRepository(
      source.getRepository(BillStudentOptionalItemEntity),
    );
    // generateInvoice() (the only InvoicingService method this test calls) never touches
    // concessionRepository/schemeRepository/sponsorAwardRepository/postingService/
    // numberingService/studentLedgerService (those are postInvoice()/voidInvoice()-only
    // collaborators) — same "placeholder unused collaborator" technique the capstone test
    // above uses for ApprovalEngineService's usersService/departmentsService/
    // delegationsService/outboxWriter.
    const invoicingService = new InvoicingService(
      invoiceRepository,
      invoiceLineRepository,
      feeStructureLineRepository,
      optionalItemRepository,
      feeCategoryRepository,
      {} as ConstructorParameters<typeof InvoicingService>[5],
      {} as ConstructorParameters<typeof InvoicingService>[6],
      {} as ConstructorParameters<typeof InvoicingService>[7],
      studentRepository,
      feeStructuresService,
      glAccountRepository,
      {} as ConstructorParameters<typeof InvoicingService>[11],
      {} as ConstructorParameters<typeof InvoicingService>[12],
      {} as ConstructorParameters<typeof InvoicingService>[13],
    );

    let structureId: string | null = null;
    let invoice1Id: string | null = null;
    let invoice2Id: string | null = null;

    try {
      const category = await feeCategoriesService.create(
        { name: `Slice3b Tuition ${suffix}`, glIncomeAccountId: tuitionIncomeAccountId },
        actorId,
      );

      // ---- One structure, year-scoped (no termId in createDraft() anymore).
      const structure = await feeStructuresService.createDraft({ academicYearId, classId }, actorId);
      structureId = structure.id;

      // ---- Two lines, SAME fee category, DIFFERENT term/amount/due-date pairs — exactly the
      // shape the widened (fee_structure_id, fee_category_id, term_id) uniqueness now allows.
      await feeStructuresService.addLine(
        structure.id,
        { feeCategoryId: category.id, termId: term1Id, dueDate: "2021-04-15", amount: Money.fromInt(5_000) },
        actorId,
      );
      await feeStructuresService.addLine(
        structure.id,
        { feeCategoryId: category.id, termId: term2Id, dueDate: "2021-08-15", amount: Money.fromInt(8_000) },
        actorId,
      );

      const published = await feeStructuresService.publish(structure.id, actorId);
      expect(published.status).toBe("PUBLISHED");

      // ---- generateInvoice() for TERM 1.
      const invoice1 = await runInTransaction(source, (manager) =>
        invoicingService.generateInvoice(manager, {
          studentId,
          termId: term1Id,
          source: "STRUCTURE",
          issueDate: "2021-02-01",
          dueDate: "2021-04-15",
          createdBy: actorId,
        }),
      );
      invoice1Id = invoice1.id;
      expect(invoice1.feeStructureId).toBe(structure.id);
      expect(invoice1.subtotal.equals(Money.fromInt(5_000))).toBe(true);
      const invoice1Lines = await invoiceLineRepository.listByInvoice(invoice1.id);
      expect(invoice1Lines).toHaveLength(1);
      expect(invoice1Lines[0].feeCategoryId).toBe(category.id);
      expect(invoice1Lines[0].amount.equals(Money.fromInt(5_000))).toBe(true);

      // ---- generateInvoice() for TERM 2, SAME student — must succeed (not blocked as a
      // BR-BILL-04 duplicate: the idempotency key is (student, term, structure) and term
      // legitimately differs this time).
      const invoice2 = await runInTransaction(source, (manager) =>
        invoicingService.generateInvoice(manager, {
          studentId,
          termId: term2Id,
          source: "STRUCTURE",
          issueDate: "2021-06-01",
          dueDate: "2021-08-15",
          createdBy: actorId,
        }),
      );
      invoice2Id = invoice2.id;
      expect(invoice2.feeStructureId).toBe(structure.id);
      expect(invoice2.feeStructureId).toBe(invoice1.feeStructureId);
      expect(invoice2.subtotal.equals(Money.fromInt(8_000))).toBe(true);
      const invoice2Lines = await invoiceLineRepository.listByInvoice(invoice2.id);
      expect(invoice2Lines).toHaveLength(1);
      expect(invoice2Lines[0].feeCategoryId).toBe(category.id);
      expect(invoice2Lines[0].amount.equals(Money.fromInt(8_000))).toBe(true);
    } finally {
      if (invoice1Id) {
        await source.query(`DELETE FROM app.bill_invoice_line WHERE invoice_id = $1`, [invoice1Id]);
        await source.query(`DELETE FROM app.bill_invoice WHERE id = $1`, [invoice1Id]);
      }
      if (invoice2Id) {
        await source.query(`DELETE FROM app.bill_invoice_line WHERE invoice_id = $1`, [invoice2Id]);
        await source.query(`DELETE FROM app.bill_invoice WHERE id = $1`, [invoice2Id]);
      }
      // Neither generateInvoice() call posted (postInvoice() never called) — no journal/ledger
      // entry exists, so the student is genuinely deletable once its invoices are gone above.
      await source.query(`DELETE FROM app.std_student WHERE id = $1`, [studentId]);
      // structureId's 2 lines are PUBLISHED — trg_bill_structure_immutable (BR-BILL-03)
      // unconditionally rejects UPDATE/DELETE on a PUBLISHED structure's lines ("supersede
      // with a new version instead") — this is a real, deliberate immutability guarantee, not
      // something a cleanup step should route around. structureId (and, transitively, classId/
      // academicYearId/term1Id/term2Id/the fee category/tuitionIncomeAccountId, all still
      // RESTRICT-referenced by the residue structure/lines) are left as inert, uniquely-suffixed
      // residue — same established treatment as the capstone test above.
      void structureId;
    }
  }, 60_000);
});
