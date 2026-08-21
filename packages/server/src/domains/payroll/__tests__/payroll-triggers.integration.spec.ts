import { DataSource } from "typeorm";
import { AppDataSource } from "../../../migrations/data-source";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { PyrlEmployeeEntity } from "../domain/pyrl-employee.entity";
import { PyrlComponentEntity } from "../domain/pyrl-component.entity";
import { PyrlSalaryStructureEntity } from "../domain/pyrl-salary-structure.entity";
import { PyrlStructureComponentEntity } from "../domain/pyrl-structure-component.entity";
import { PyrlEmployeeAssignmentEntity } from "../domain/pyrl-employee-assignment.entity";
import { PyrlEmployeeComponentEntity } from "../domain/pyrl-employee-component.entity";
import { PyrlStatutoryTableEntity } from "../domain/pyrl-statutory-table.entity";
import { PyrlLoanEntity } from "../domain/pyrl-loan.entity";
import { PyrlLoanScheduleEntity } from "../domain/pyrl-loan-schedule.entity";
import { PyrlRunEntity } from "../domain/pyrl-run.entity";
import { PyrlRunLineEntity } from "../domain/pyrl-run-line.entity";
import { PyrlRunLineComponentEntity } from "../domain/pyrl-run-line-component.entity";
import { PyrlOneoffEntity } from "../domain/pyrl-oneoff.entity";

/**
 * Integration test against a real Postgres instance via the actual
 * `AppDataSource` — self-skips (not fails) when no DB is reachable, since
 * Docker isn't confirmed running in every environment this repo builds in
 * (see docs/phase-5/PROGRESS.md "Environment status"). Mirrors
 * `domains/procurement/__tests__/procurement-triggers.integration.spec.ts`'s
 * pattern exactly — the highest-value test in this foundation pass, since
 * the two `EXCLUDE USING gist` no-overlap constraints and the two
 * `trg_pyrl_run*_immutable` triggers from migrations `0125`/`0130` can only
 * be genuinely verified against a real Postgres engine, not a mocked
 * repository.
 */
describe("payroll module — trigger integration (real DataSource)", () => {
  let dataSource: DataSource | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    try {
      dataSource = await AppDataSource.initialize();
      dbAvailable = true;
    } catch (error) {
      console.warn(
        `[payroll-triggers.integration.spec] Skipping — no reachable Postgres at DATABASE_URL/env: ${(error as Error).message}`,
      );
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  interface EmployeeFixture {
    employeeId: string;
    departmentId: string;
    costCenterId: string;
  }

  async function createEmployeeFixture(source: DataSource, suffix: string): Promise<EmployeeFixture> {
    const departmentId = generateUuidV7();
    await source.query(`INSERT INTO app.usr_department (id, name) VALUES ($1, $2)`, [
      departmentId,
      `PYRL-DEPT-${suffix}`,
    ]);
    const costCenterId = generateUuidV7();
    await source.query(`INSERT INTO app.gl_cost_center (id, code, name) VALUES ($1, $2, $3)`, [
      costCenterId,
      `PYRLCC${suffix}`.slice(0, 20),
      `PYRL Cost Center ${suffix}`,
    ]);
    const employeeId = generateUuidV7();
    // Migration 0240 — national_id/kra_pin are now jsonb (encrypted at the
    // application layer; this fixture doesn't go through EmployeesService,
    // so it just needs a NOT-NULL-satisfying valid jsonb value, not a real
    // ciphertext — to_jsonb($::text) wraps the plain fixture string as a
    // valid JSON string value, same as migration 0240's own up() does for
    // the pre-existing plaintext it re-encrypts).
    await source.query(
      `INSERT INTO app.pyrl_employee
         (id, staff_no, full_name, national_id, kra_pin, employment_type, department_id, job_title,
          hire_date, cost_center_id)
       VALUES ($1, $2, $3, to_jsonb($4::text), to_jsonb($5::text), 'PERMANENT', $6, 'Teacher', '2024-01-01', $7)`,
      [employeeId, `EMP-${suffix}`, `Employee ${suffix}`, `ID${suffix}`, `A${suffix}`, departmentId, costCenterId],
    );
    return { employeeId, departmentId, costCenterId };
  }

  async function destroyEmployeeFixture(source: DataSource, fixture: EmployeeFixture): Promise<void> {
    await source.query(`DELETE FROM app.pyrl_employee WHERE id = $1`, [fixture.employeeId]);
    await source.query(`DELETE FROM app.gl_cost_center WHERE id = $1`, [fixture.costCenterId]);
    await source.query(`DELETE FROM app.usr_department WHERE id = $1`, [fixture.departmentId]);
  }

  async function createComponentFixture(source: DataSource, suffix: string): Promise<string> {
    const glAccountId = generateUuidV7();
    await source.query(
      `INSERT INTO app.gl_account (id, code, name, class, is_postable, is_control)
       VALUES ($1, $2, $3, 'EXPENSE', false, false)`,
      [glAccountId, `PYCMP${suffix}`.slice(0, 20), `PYRL Component GL ${suffix}`],
    );
    const componentId = generateUuidV7();
    await source.query(
      `INSERT INTO app.pyrl_component (id, code, name, kind, is_taxable, gl_account_id)
       VALUES ($1, $2, $3, 'EARNING', true, $4)`,
      [componentId, `CMP-${suffix}`, `Component ${suffix}`, glAccountId],
    );
    return componentId;
  }

  async function destroyComponentFixture(source: DataSource, componentId: string): Promise<void> {
    const rows: { gl_account_id: string }[] = await source.query(
      `SELECT gl_account_id FROM app.pyrl_component WHERE id = $1`,
      [componentId],
    );
    await source.query(`DELETE FROM app.pyrl_component WHERE id = $1`, [componentId]);
    if (rows[0]) {
      await source.query(`DELETE FROM app.gl_account WHERE id = $1`, [rows[0].gl_account_id]);
    }
  }

  async function createUsrUserFixture(source: DataSource, suffix: string): Promise<string> {
    const userId = generateUuidV7();
    // phone is varchar(20) — "+2547" (5 chars) leaves 15 for the suffix; some callers pass a
    // composite suffix (e.g. `${suffix}-appr`) longer than the raw 13-digit timestamp.
    await source.query(
      `INSERT INTO app.usr_user (id, username, password_hash, full_name, status, phone)
       VALUES ($1, $2, 'hash', 'Test Initiator', 'ACTIVE', $3)`,
      [userId, `pyrl-user-${suffix}`, `+2547${suffix}`.slice(0, 20)],
    );
    return userId;
  }

  it.each([
    ["pyrl_employee", PyrlEmployeeEntity],
    ["pyrl_component", PyrlComponentEntity],
    ["pyrl_salary_structure", PyrlSalaryStructureEntity],
    ["pyrl_structure_component", PyrlStructureComponentEntity],
    ["pyrl_employee_assignment", PyrlEmployeeAssignmentEntity],
    ["pyrl_employee_component", PyrlEmployeeComponentEntity],
    ["pyrl_statutory_table", PyrlStatutoryTableEntity],
    ["pyrl_loan", PyrlLoanEntity],
    ["pyrl_loan_schedule", PyrlLoanScheduleEntity],
    ["pyrl_run", PyrlRunEntity],
    ["pyrl_run_line", PyrlRunLineEntity],
    ["pyrl_run_line_component", PyrlRunLineComponentEntity],
    ["pyrl_oneoff", PyrlOneoffEntity],
  ] as const)("%s table is reachable and the entity metadata matches the DDL", async (tableName, entityClass) => {
    if (!dbAvailable || !dataSource) {
      console.warn(`[payroll-triggers.integration.spec] SKIPPED (no DB) — ${tableName} reachability check`);
      return; // vacuous pass — the skip decision is only known async, after `it()` registration.
    }
    const count = await dataSource.getRepository(entityClass).count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("excl_pyrl_employee_assignment_no_overlap rejects overlapping date ranges for the same employee", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[payroll-triggers.integration.spec] SKIPPED (no DB) — assignment EXCLUDE constraint check");
      return;
    }
    const source = dataSource;
    const suffix = `${Date.now()}`;
    const employee = await createEmployeeFixture(source, suffix);
    const structureId = generateUuidV7();
    await source.query(
      `INSERT INTO app.pyrl_salary_structure (id, name, effective_from) VALUES ($1, $2, '2026-01-01')`,
      [structureId, `Structure ${suffix}`],
    );
    const assignmentAId = generateUuidV7();
    const assignmentBId = generateUuidV7();

    try {
      // First assignment: 2026-01-01 through 2026-06-30 — commits cleanly.
      await expect(
        source.query(
          `INSERT INTO app.pyrl_employee_assignment
             (id, employee_id, structure_id, basic_pay, effective_from, effective_to)
           VALUES ($1, $2, $3, 50000.00, '2026-01-01', '2026-06-30')`,
          [assignmentAId, employee.employeeId, structureId],
        ),
      ).resolves.toBeDefined();

      // Overlapping range (2026-05-01 onward, open-ended) for the SAME employee — rejected.
      await expect(
        source.query(
          `INSERT INTO app.pyrl_employee_assignment
             (id, employee_id, structure_id, basic_pay, effective_from, effective_to)
           VALUES ($1, $2, $3, 55000.00, '2026-05-01', NULL)`,
          [assignmentBId, employee.employeeId, structureId],
        ),
      ).rejects.toThrow(/exclusion|excl_pyrl_employee_assignment_no_overlap/i);

      // A non-overlapping range starting right after the first ends — commits cleanly.
      const assignmentCId = generateUuidV7();
      await expect(
        source.query(
          `INSERT INTO app.pyrl_employee_assignment
             (id, employee_id, structure_id, basic_pay, effective_from, effective_to)
           VALUES ($1, $2, $3, 55000.00, '2026-07-01', NULL)`,
          [assignmentCId, employee.employeeId, structureId],
        ),
      ).resolves.toBeDefined();
      await source.query(`DELETE FROM app.pyrl_employee_assignment WHERE id = $1`, [assignmentCId]);
    } finally {
      await source.query(`DELETE FROM app.pyrl_employee_assignment WHERE employee_id = $1`, [
        employee.employeeId,
      ]);
      await source.query(`DELETE FROM app.pyrl_salary_structure WHERE id = $1`, [structureId]);
      await destroyEmployeeFixture(source, employee);
    }
  });

  it("excl_pyrl_employee_component_no_overlap rejects overlapping ranges for the same (employee, component) but allows a different concurrent component", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[payroll-triggers.integration.spec] SKIPPED (no DB) — employee-component EXCLUDE constraint check");
      return;
    }
    const source = dataSource;
    const suffix = `${Date.now()}`;
    const employee = await createEmployeeFixture(source, suffix);
    const componentAId = await createComponentFixture(source, `${suffix}-a`);
    const componentBId = await createComponentFixture(source, `${suffix}-b`);
    const rowAId = generateUuidV7();
    const rowBId = generateUuidV7();
    const rowCId = generateUuidV7();

    try {
      await expect(
        source.query(
          `INSERT INTO app.pyrl_employee_component
             (id, employee_id, component_id, amount, effective_from, effective_to)
           VALUES ($1, $2, $3, 2000.00, '2026-01-01', NULL)`,
          [rowAId, employee.employeeId, componentAId],
        ),
      ).resolves.toBeDefined();

      // Same employee, SAME component, overlapping range — rejected.
      await expect(
        source.query(
          `INSERT INTO app.pyrl_employee_component
             (id, employee_id, component_id, amount, effective_from, effective_to)
           VALUES ($1, $2, $3, 2500.00, '2026-03-01', NULL)`,
          [rowBId, employee.employeeId, componentAId],
        ),
      ).rejects.toThrow(/exclusion|excl_pyrl_employee_component_no_overlap/i);

      // Same employee, DIFFERENT component, same overlapping dates — allowed (the documented judgement call).
      await expect(
        source.query(
          `INSERT INTO app.pyrl_employee_component
             (id, employee_id, component_id, amount, effective_from, effective_to)
           VALUES ($1, $2, $3, 1000.00, '2026-01-01', NULL)`,
          [rowCId, employee.employeeId, componentBId],
        ),
      ).resolves.toBeDefined();
    } finally {
      await source.query(`DELETE FROM app.pyrl_employee_component WHERE employee_id = $1`, [
        employee.employeeId,
      ]);
      await destroyComponentFixture(source, componentAId);
      await destroyComponentFixture(source, componentBId);
      await destroyEmployeeFixture(source, employee);
    }
  });

  it("trg_pyrl_run_immutable freezes totals/period_key/run_kind/journal_id once status reaches COMMITTED or beyond, but allows status/committed_at/approved_by to keep progressing (BR-PYRL-06)", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[payroll-triggers.integration.spec] SKIPPED (no DB) — run immutability trigger check");
      return;
    }
    const source = dataSource;
    const suffix = `${Date.now()}`;
    const initiatorId = await createUsrUserFixture(source, suffix);
    const approverId = await createUsrUserFixture(source, `${suffix}-appr`);
    const runId = generateUuidV7();

    try {
      await source.query(
        `INSERT INTO app.pyrl_run (id, period_key, run_kind, status, initiated_by, totals)
         VALUES ($1, '2026-07', 'MAIN', 'DRAFT', $2, '{"gross": 0}'::jsonb)`,
        [runId, initiatorId],
      );

      // While DRAFT, totals is freely editable.
      await expect(
        source.query(`UPDATE app.pyrl_run SET totals = '{"gross": 100}'::jsonb WHERE id = $1`, [runId]),
      ).resolves.toBeDefined();

      // Progress through to COMMITTED — status/approved_by/committed_at remain writable throughout.
      await expect(
        source.query(`UPDATE app.pyrl_run SET status = 'COMPUTED' WHERE id = $1`, [runId]),
      ).resolves.toBeDefined();
      await expect(
        source.query(`UPDATE app.pyrl_run SET status = 'REVIEW' WHERE id = $1`, [runId]),
      ).resolves.toBeDefined();
      await expect(
        source.query(`UPDATE app.pyrl_run SET status = 'PENDING_APPROVAL' WHERE id = $1`, [runId]),
      ).resolves.toBeDefined();
      await expect(
        source.query(`UPDATE app.pyrl_run SET status = 'APPROVED', approved_by = $2 WHERE id = $1`, [
          runId,
          approverId,
        ]),
      ).resolves.toBeDefined();
      await expect(
        source.query(
          `UPDATE app.pyrl_run SET status = 'COMMITTED', committed_at = now() WHERE id = $1`,
          [runId],
        ),
      ).resolves.toBeDefined();

      // Once COMMITTED, the figure columns are frozen.
      await expect(
        source.query(`UPDATE app.pyrl_run SET totals = '{"gross": 999}'::jsonb WHERE id = $1`, [runId]),
      ).rejects.toThrow(/BR-PYRL-06/);
      await expect(
        source.query(`UPDATE app.pyrl_run SET period_key = '2026-08' WHERE id = $1`, [runId]),
      ).rejects.toThrow(/BR-PYRL-06/);
      await expect(
        source.query(`UPDATE app.pyrl_run SET run_kind = 'SUPPLEMENTARY' WHERE id = $1`, [runId]),
      ).rejects.toThrow(/BR-PYRL-06/);

      // status keeps progressing even after COMMITTED (the PAID/FILED transition).
      await expect(
        source.query(`UPDATE app.pyrl_run SET status = 'PAID' WHERE id = $1`, [runId]),
      ).resolves.toBeDefined();
      await expect(
        source.query(`UPDATE app.pyrl_run SET status = 'FILED' WHERE id = $1`, [runId]),
      ).resolves.toBeDefined();
    } finally {
      await source.query(`DELETE FROM app.pyrl_run WHERE id = $1`, [runId]);
      await source.query(`DELETE FROM app.usr_user WHERE id IN ($1, $2)`, [initiatorId, approverId]);
    }
  });

  it("trg_pyrl_run_line_immutable freezes financial columns once the parent run reaches COMMITTED or beyond, but allows payslip_file_id/paid_via/paid_at (BR-PYRL-06)", async () => {
    if (!dbAvailable || !dataSource) {
      console.warn("[payroll-triggers.integration.spec] SKIPPED (no DB) — run line immutability trigger check");
      return;
    }
    const source = dataSource;
    const suffix = `${Date.now()}`;
    const initiatorId = await createUsrUserFixture(source, suffix);
    const employee = await createEmployeeFixture(source, suffix);
    const runId = generateUuidV7();
    const runLineId = generateUuidV7();

    try {
      await source.query(
        `INSERT INTO app.pyrl_run (id, period_key, run_kind, status, initiated_by)
         VALUES ($1, '2026-07', 'MAIN', 'DRAFT', $2)`,
        [runId, initiatorId],
      );
      await source.query(
        `INSERT INTO app.pyrl_run_line
           (id, run_id, employee_id, gross, taxable, paye, nssf_employee, nssf_employer, shif,
            ahl_employee, ahl_employer, loan_recovered, other_deductions, net_pay)
         VALUES ($1, $2, $3, 50000, 50000, 5000, 500, 500, 500, 500, 500, 0, 0, 43000)`,
        [runLineId, runId, employee.employeeId],
      );

      // While the parent run is DRAFT, financial columns are freely editable.
      await expect(
        source.query(`UPDATE app.pyrl_run_line SET gross = 60000 WHERE id = $1`, [runLineId]),
      ).resolves.toBeDefined();

      // Commit the parent run.
      await source.query(`UPDATE app.pyrl_run SET status = 'COMMITTED', committed_at = now() WHERE id = $1`, [
        runId,
      ]);

      // Once the parent is COMMITTED, financial columns on the line are frozen.
      await expect(
        source.query(`UPDATE app.pyrl_run_line SET gross = 70000 WHERE id = $1`, [runLineId]),
      ).rejects.toThrow(/BR-PYRL-06/);
      await expect(
        source.query(`UPDATE app.pyrl_run_line SET net_pay = 1 WHERE id = $1`, [runLineId]),
      ).rejects.toThrow(/BR-PYRL-06/);

      // But payment-recording fields remain writable (the PAID transition).
      await expect(
        source.query(
          `UPDATE app.pyrl_run_line SET paid_via = 'BANK', paid_at = now() WHERE id = $1`,
          [runLineId],
        ),
      ).resolves.toBeDefined();
    } finally {
      await source.query(`DELETE FROM app.pyrl_run_line WHERE id = $1`, [runLineId]);
      await source.query(`DELETE FROM app.pyrl_run WHERE id = $1`, [runId]);
      await destroyEmployeeFixture(source, employee);
      await source.query(`DELETE FROM app.usr_user WHERE id = $1`, [initiatorId]);
    }
  });
});
