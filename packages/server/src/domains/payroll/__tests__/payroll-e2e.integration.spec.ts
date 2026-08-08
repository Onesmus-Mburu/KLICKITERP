import { DataSource } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { Money } from "../../../shared/money/money";

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

import { SetNumberingSeriesEntity } from "../../../platform/settings/domain/set-numbering-series.entity";
import { SetNumberingSeriesRepository } from "../../../platform/settings/infrastructure/set-numbering-series.repository";
import { NumberingService } from "../../../platform/settings/application/numbering.service";
import { AcademicCalendarService } from "../../../platform/settings/application/academic-calendar.service";

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

import { PyrlEmployeeEntity } from "../domain/pyrl-employee.entity";
import { PyrlEmployeeRepository } from "../infrastructure/pyrl-employee.repository";
import { PyrlSalaryStructureEntity } from "../domain/pyrl-salary-structure.entity";
import { PyrlSalaryStructureRepository } from "../infrastructure/pyrl-salary-structure.repository";
import { PyrlStructureComponentEntity } from "../domain/pyrl-structure-component.entity";
import { PyrlStructureComponentRepository } from "../infrastructure/pyrl-structure-component.repository";
import { PyrlEmployeeAssignmentEntity } from "../domain/pyrl-employee-assignment.entity";
import { PyrlEmployeeAssignmentRepository } from "../infrastructure/pyrl-employee-assignment.repository";
import { PyrlEmployeeComponentEntity } from "../domain/pyrl-employee-component.entity";
import { PyrlEmployeeComponentRepository } from "../infrastructure/pyrl-employee-component.repository";
import { PyrlComponentEntity } from "../domain/pyrl-component.entity";
import { PyrlComponentRepository } from "../infrastructure/pyrl-component.repository";
import { PyrlOneoffEntity } from "../domain/pyrl-oneoff.entity";
import { PyrlOneoffRepository } from "../infrastructure/pyrl-oneoff.repository";
import { PyrlLoanEntity } from "../domain/pyrl-loan.entity";
import { PyrlLoanRepository } from "../infrastructure/pyrl-loan.repository";
import { PyrlLoanScheduleEntity } from "../domain/pyrl-loan-schedule.entity";
import { PyrlLoanScheduleRepository } from "../infrastructure/pyrl-loan-schedule.repository";
import { PyrlRunEntity } from "../domain/pyrl-run.entity";
import { PyrlRunRepository } from "../infrastructure/pyrl-run.repository";
import { PyrlRunLineEntity } from "../domain/pyrl-run-line.entity";
import { PyrlRunLineRepository } from "../infrastructure/pyrl-run-line.repository";
import { PyrlRunLineComponentEntity } from "../domain/pyrl-run-line-component.entity";
import { PyrlRunLineComponentRepository } from "../infrastructure/pyrl-run-line-component.repository";
import { PyrlStatutoryTableEntity } from "../domain/pyrl-statutory-table.entity";
import { PyrlStatutoryTableRepository } from "../infrastructure/pyrl-statutory-table.repository";
import { StatutoryTablesService } from "../application/statutory-tables.service";
import { StatutoryCalculationService } from "../application/statutory-calculation.service";
import { PayrollRunsService, PAYROLL_RUN_APPROVAL_DOMAIN_CODE } from "../application/payroll-runs.service";

/** `pyrl_component.code`s the real `0900` seed is expected to have provisioned — see `0900-seed-permissions-and-roles.ts`'s `PYRL_COMPONENT_SEED`. */
const REQUIRED_COMPONENT_CODES = ["BASIC", "HOUSE_ALLOWANCE", "PAYE", "NSSF", "SHIF", "AHL", "LOAN_RECOVERY"];
/** `gl_account.code`s the real `0900` seed is expected to have provisioned for P-27/P-28 — see `gl-payroll-accounts.util.ts`. */
const REQUIRED_ACCOUNT_CODES = ["5010", "5080", "2050", "2060", "2070", "2080", "2090", "1600", "1020"];

/**
 * Module 15 (Payroll) capstone integration test — mirrors
 * `domains/expenses/__tests__/expenses-e2e.integration.spec.ts`'s pattern
 * (real repository/service instances, no Nest DI, self-skips without a
 * reachable Postgres). Unlike every other domain module's own e2e capstone,
 * this is the ONE integration spec in this codebase deliberately exercising
 * the REAL production `0900` seed data (the real Kenyan PAYE/NSSF/SHIF/AHL
 * `pyrl_statutory_table` rows, the real `pyrl_component` catalogue, the real
 * P-27/P-28 `gl_account` codes) rather than synthetic fixtures — its whole
 * purpose is validating that the seed's shape genuinely matches
 * `StatutoryCalculationService`'s calculation-engine expectations end to
 * end, so it self-skips (with a clear, actionable warning) not only when no
 * DB is reachable but ALSO when the required `0900` rows aren't present yet
 * (migrations run, but the seed migration hasn't, or predates PASS B).
 *
 * Flow: employee + salary structure (BASIC assignment basic pay + a 10%-of-
 * basic HOUSE_ALLOWANCE line) + assignment -> create run -> compute ->
 * review -> submit -> decide(approved) -> commit (P-27) -> pay (P-28),
 * asserting the run line's final PAYE/NSSF/SHIF/AHL/net-pay figures against
 * HAND-COMPUTED expected values using the real seeded rate/band parameters
 * (see the inline comments below for the exact arithmetic), plus balanced
 * GL at both commit and pay. Loan recovery is deliberately NOT exercised
 * here (already covered by `payroll-runs.service.spec.ts`'s BR-PYRL-03 unit
 * tests with mocked statutory rates) — `LoansService` is stubbed since no
 * loan-recovery code path is reached.
 */
describe("payroll module — end-to-end capstone against the REAL 0900 statutory/component/GL seed (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(`[payroll-e2e.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`);
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  it(
    "employee+structure+assignment -> create/compute/review/submit/decide/commit/pay, asserting real-seed statutory figures + balanced P-27/P-28",
    async () => {
      if (!dbAvailable || !dataSource) {
        console.warn("[payroll-e2e.integration.spec] SKIPPED (no DB) — payroll capstone flow");
        return;
      }
      const source = dataSource;

      const componentRows: Array<{ code: string }> = await source.query(
        `SELECT code FROM app.pyrl_component WHERE code = ANY($1::text[])`,
        [REQUIRED_COMPONENT_CODES],
      );
      const accountRows: Array<{ code: string }> = await source.query(`SELECT code FROM app.gl_account WHERE code = ANY($1::text[])`, [
        REQUIRED_ACCOUNT_CODES,
      ]);
      const payeTableRows: Array<{ id: string }> = await source.query(`SELECT id FROM app.pyrl_statutory_table WHERE kind = 'PAYE'`);
      const controlAccountRows: Array<{ id: string }> = await source.query(
        `SELECT id FROM app.gl_account WHERE control_domain = 'PAYROLL' AND is_active AND is_postable`,
      );
      const seedComplete =
        componentRows.length === REQUIRED_COMPONENT_CODES.length &&
        accountRows.length === REQUIRED_ACCOUNT_CODES.length &&
        payeTableRows.length > 0 &&
        controlAccountRows.length === 1;
      if (!seedComplete) {
        console.warn(
          "[payroll-e2e.integration.spec] SKIPPED — the real 0900 Payroll seed (pyrl_component/pyrl_statutory_table/gl_account rows) " +
            "is not present against this database. Run migrations including 0900-seed-permissions-and-roles.ts first.",
        );
        return;
      }

      const suffix = Date.now();

      // ---- Wide-enough gl_period.
      const fiscalYearId = generateUuidV7();
      const periodId = generateUuidV7();
      await source.query(
        `INSERT INTO app.gl_fiscal_year (id, name, starts_on, ends_on, status) VALUES ($1, $2, '2015-01-01', '2035-12-31', 'OPEN')`,
        [fiscalYearId, `PYRL-E2E-FY-${String(suffix).slice(-8)}`],
      );
      await source.query(
        `INSERT INTO app.gl_period (id, fiscal_year_id, seq, starts_on, ends_on, status) VALUES ($1, $2, 1, '2015-01-01', '2035-12-31', 'OPEN')`,
        [periodId, fiscalYearId],
      );

      const departmentId = generateUuidV7();
      await source.query(`INSERT INTO app.usr_department (id, name) VALUES ($1, $2)`, [departmentId, `PYRL-E2E-DEPT-${suffix}`]);

      const actorId = generateUuidV7();
      await source.query(
        `INSERT INTO app.usr_user (id, username, password_hash, full_name, status, phone) VALUES ($1, $2, 'hash', 'E2E Actor', 'ACTIVE', $3)`,
        [actorId, `pyrl-e2e-actor-${suffix}`, `+2545${suffix}`.slice(0, 13)],
      );

      const costCenterId = await reuseOrCreateCostCenter(source, `PYRL-E2E-CC-${suffix}`);

      const roleId = await upsertThrowawayRole(source, `PYRL-E2E-ROLE-${suffix}`);
      await upsertSingleLevelWorkflow(source, PAYROLL_RUN_APPROVAL_DOMAIN_CODE, "Payroll Run Approval (E2E)", roleId);

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
        {} as never, // usersService — unreachable, no appr_routing_rule seeded for PAYROLL_RUN
        {} as never, // departmentsService — unreachable, same reason
        {} as never, // delegationsService — unreachable, decide() is never called in this test
        { write: async () => undefined } as never, // outboxWriter stub
      );

      const employeeRepository = new PyrlEmployeeRepository(source.getRepository(PyrlEmployeeEntity));
      const structureRepository = new PyrlSalaryStructureRepository(source.getRepository(PyrlSalaryStructureEntity));
      const structureComponentRepository = new PyrlStructureComponentRepository(source.getRepository(PyrlStructureComponentEntity));
      const assignmentRepository = new PyrlEmployeeAssignmentRepository(source.getRepository(PyrlEmployeeAssignmentEntity));
      const employeeComponentRepository = new PyrlEmployeeComponentRepository(source.getRepository(PyrlEmployeeComponentEntity));
      const componentRepository = new PyrlComponentRepository(source.getRepository(PyrlComponentEntity));
      const oneoffRepository = new PyrlOneoffRepository(source.getRepository(PyrlOneoffEntity));
      const loanRepository = new PyrlLoanRepository(source.getRepository(PyrlLoanEntity));
      const loanScheduleRepository = new PyrlLoanScheduleRepository(source.getRepository(PyrlLoanScheduleEntity));
      const runRepository = new PyrlRunRepository(source.getRepository(PyrlRunEntity));
      const runLineRepository = new PyrlRunLineRepository(source.getRepository(PyrlRunLineEntity));
      const runLineComponentRepository = new PyrlRunLineComponentRepository(source.getRepository(PyrlRunLineComponentEntity));
      const statutoryTableRepository = new PyrlStatutoryTableRepository(source.getRepository(PyrlStatutoryTableEntity));
      const statutoryTablesService = new StatutoryTablesService(statutoryTableRepository);
      const statutoryCalculationService = new StatutoryCalculationService(statutoryTablesService);
      const settingsServiceStub = { getTyped: async <T>(_key: string, defaultValue: T): Promise<T> => defaultValue } as never;
      const loansServiceStub = { recordRecovery: async () => undefined } as never;

      const payrollRunsService = new PayrollRunsService(
        runRepository,
        runLineRepository,
        runLineComponentRepository,
        employeeRepository,
        assignmentRepository,
        structureComponentRepository,
        employeeComponentRepository,
        oneoffRepository,
        componentRepository,
        loanRepository,
        loanScheduleRepository,
        statutoryCalculationService,
        loansServiceStub,
        approvalEngine,
        settingsServiceStub,
        postingService,
        glAccountRepository,
      );

      const houseComponent = await componentRepository.findByCode("HOUSE_ALLOWANCE");
      if (!houseComponent) throw new Error("HOUSE_ALLOWANCE component missing despite passing the seed-completeness check");

      const structure = await structureRepository.create({
        name: `PYRL-E2E-STRUCTURE-${suffix}`,
        grade: null,
        effectiveFrom: "2015-01-01",
      });
      await structureComponentRepository.create({
        structureId: structure.id,
        componentId: houseComponent.id,
        amount: null,
        formula: { type: "PERCENT_OF_BASIC", rate: "0.10" },
      });

      const employee = await employeeRepository.create({
        staffNo: `PYRL-E2E-${String(suffix).slice(-8)}`,
        userId: null,
        fullName: "E2E Teacher",
        nationalId: `E2E-NAT-${String(suffix).slice(-8)}`,
        kraPin: `E2EPIN${String(suffix).slice(-6)}`,
        nssfNo: null,
        shifNo: null,
        employmentType: "PERMANENT",
        departmentId,
        jobTitle: "Teacher",
        hireDate: "2015-01-01",
        exitDate: null,
        payDetails: null,
        bankName: null,
        branch: null,
        account: null,
        costCenterId,
        isActive: true,
      });

      // basicPay=30000, house allowance = 10% of basic = 3000 => gross = taxable = 33000.
      await assignmentRepository.create({
        employeeId: employee.id,
        structureId: structure.id,
        basicPay: Money.fromInt(30000),
        effectiveFrom: "2015-01-01",
        effectiveTo: null,
      });

      let runId: string | null = null;

      try {
        const run = await source.transaction("REPEATABLE READ", (em) =>
          payrollRunsService.createRun(em, { periodKey: "2030-01", runKind: "MAIN" }, actorId),
        );
        runId = run.id;
        expect(run.status).toBe("DRAFT");

        const computed = await source.transaction("REPEATABLE READ", (em) => payrollRunsService.compute(em, run.id));
        expect(computed.status).toBe("COMPUTED");

        const lines = await runLineRepository.findByRunId(run.id);
        expect(lines).toHaveLength(1);
        const line = lines[0];

        // ---- Hand-computed expected figures using the REAL seeded 0900 rate tables:
        // gross = taxable = 30000 (basic) + 3000 (10% house allowance) = 33000.
        expect(line.gross).toEqual(Money.fromInt(33000));
        expect(line.taxable).toEqual(Money.fromInt(33000));

        // PAYE bands (0-24000@10%, 24000-32333@25%, 32333-500000@30%, ...), relief=2400:
        //   band1: 24000 * 0.10 = 2400.00
        //   band2: (32333-24000)=8333 * 0.25 = 2083.25
        //   band3: (33000-32333)=667 * 0.30 = 200.10
        //   grossTax = 2400 + 2083.25 + 200.10 = 4683.35; net PAYE = 4683.35 - 2400 (relief) = 2283.35
        expect(line.paye).toEqual(Money.fromDecimalString("2283.3500"));

        // NSSF tiers (tier1 0-8000@6%, tier2 8000-72000@6%), pensionable pay = gross = 33000:
        //   tier1 = min(33000,8000)*0.06 = 480.00 (each leg)
        //   tier2 = (min(33000,72000)-8000)*0.06 = 25000*0.06 = 1500.00 (each leg)
        //   employee = employer = 480 + 1500 = 1980.00
        expect(line.nssfEmployee).toEqual(Money.fromInt(1980));
        expect(line.nssfEmployer).toEqual(Money.fromInt(1980));

        // SHIF: 33000 * 0.0275 = 907.50 (above the 300 floor).
        expect(line.shif).toEqual(Money.fromDecimalString("907.5000"));

        // AHL: 33000 * 0.015 = 495.00 (each leg).
        expect(line.ahlEmployee).toEqual(Money.fromInt(495));
        expect(line.ahlEmployer).toEqual(Money.fromInt(495));

        // net = 33000 - 2283.35 - 1980 - 907.50 - 495 (no loan/other deductions) = 27334.15
        expect(line.netPay).toEqual(Money.fromDecimalString("27334.1500"));

        const reviewed = await source.transaction("REPEATABLE READ", (em) => payrollRunsService.review(em, run.id));
        expect(reviewed.status).toBe("REVIEW");

        const submitted = await source.transaction("REPEATABLE READ", (em) => payrollRunsService.submitForApproval(em, run.id, actorId));
        expect(submitted.status).toBe("PENDING_APPROVAL");

        const approved = await source.transaction("REPEATABLE READ", (em) =>
          payrollRunsService.onApprovalDecided(em, run.id, true, actorId),
        );
        expect(approved.status).toBe("APPROVED");

        const committed = await source.transaction("REPEATABLE READ", (em) => payrollRunsService.commit(em, run.id, actorId));
        expect(committed.status).toBe("COMMITTED");
        expect(committed.journalId).toBeTruthy();

        // ---- P-27 balanced: gross expense (5010) debited 33000, employer contributions (5080)
        // debited 1980+495=2475; PAYE/NSSF/SHIF/AHL/net-pay-payable credited to sum exactly.
        const [balanceRow]: Array<{ debit: string; credit: string }> = await source.query(
          `SELECT COALESCE(SUM(jl.debit),0)::text AS debit, COALESCE(SUM(jl.credit),0)::text AS credit
           FROM app.gl_journal_line jl WHERE jl.journal_id = $1`,
          [committed.journalId],
        );
        expect(Money.fromDecimalString(balanceRow.debit)).toEqual(Money.fromDecimalString(balanceRow.credit));
        expect(Money.fromDecimalString(balanceRow.debit)).toEqual(Money.fromDecimalString("35475.0000")); // 33000 + 2475

        const paid = await source.transaction("REPEATABLE READ", (em) => payrollRunsService.pay(em, run.id, { method: "BANK" }, actorId));
        expect(paid.status).toBe("PAID");

        const paidLines = await runLineRepository.findByRunId(run.id);
        expect(paidLines[0].paidVia).toBe("BANK");
        expect(paidLines[0].paidAt).toBeTruthy();

        // ---- P-28 balanced: Net Pay Payable debited, Bank credited, both = 27334.15.
        const journalRows: Array<{ id: string }> = await source.query(
          `SELECT id FROM app.gl_journal WHERE source_doc_type = 'pyrl_run' AND source_doc_id = $1 AND id != $2`,
          [run.id, committed.journalId],
        );
        expect(journalRows).toHaveLength(1);
        const [payBalanceRow]: Array<{ debit: string; credit: string }> = await source.query(
          `SELECT COALESCE(SUM(jl.debit),0)::text AS debit, COALESCE(SUM(jl.credit),0)::text AS credit
           FROM app.gl_journal_line jl WHERE jl.journal_id = $1`,
          [journalRows[0].id],
        );
        expect(Money.fromDecimalString(payBalanceRow.debit)).toEqual(Money.fromDecimalString(payBalanceRow.credit));
        expect(Money.fromDecimalString(payBalanceRow.debit)).toEqual(Money.fromDecimalString("27334.1500"));

        const filed = await source.transaction("REPEATABLE READ", (em) => payrollRunsService.file(em, run.id));
        expect(filed.status).toBe("FILED");
      } finally {
        if (runId) {
          await source.query(`DELETE FROM app.pyrl_run_line_component WHERE run_line_id IN (SELECT id FROM app.pyrl_run_line WHERE run_id = $1)`, [runId]);
          await source.query(`DELETE FROM app.pyrl_run_line WHERE run_id = $1`, [runId]);
          await source.query(`DELETE FROM app.appr_instance WHERE entity_type = 'pyrl_run' AND entity_id = $1`, [runId]);
          await source.query(`DELETE FROM app.pyrl_run WHERE id = $1`, [runId]);
        }
        await source.query(`DELETE FROM app.pyrl_employee_assignment WHERE employee_id = $1`, [employee.id]);
        await source.query(`DELETE FROM app.pyrl_employee WHERE id = $1`, [employee.id]);
        await source.query(`DELETE FROM app.pyrl_structure_component WHERE structure_id = $1`, [structure.id]);
        await source.query(`DELETE FROM app.pyrl_salary_structure WHERE id = $1`, [structure.id]);
        await source.query(`DELETE FROM app.usr_user WHERE id = $1`, [actorId]);
        await source.query(`DELETE FROM app.usr_department WHERE id = $1`, [departmentId]);
        // gl_period/gl_fiscal_year are RESTRICT-referenced by the now-permanent
        // gl_journal_line rows the P-27 posting above created (immutable, mirrors
        // trg_gl_journal_immutable) — deleting them fails by design. Left as inert,
        // uniquely-suffixed residue, same established pattern as
        // payments-e2e.integration.spec.ts.
        void periodId;
        void fiscalYearId;
      }
    },
    60000,
  );
});

/** Reuses the `0900`-seeded `MAIN` cost center if present, otherwise creates a throwaway one. */
async function reuseOrCreateCostCenter(source: DataSource, code: string): Promise<string> {
  const existing: Array<{ id: string }> = await source.query(`SELECT id FROM app.gl_cost_center WHERE code = 'MAIN'`);
  if (existing.length > 0) return existing[0].id;
  const id = generateUuidV7();
  await source.query(`INSERT INTO app.gl_cost_center (id, code, name, is_active) VALUES ($1, $2, $3, true)`, [id, code, code]);
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

/** REUSE-or-create, never overwrite — see `expenses-e2e.integration.spec.ts`'s identical helper for the full rationale (never clobber a real `0900`-seeded workflow). */
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
