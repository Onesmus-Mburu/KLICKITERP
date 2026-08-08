/**
 * Public barrel — the only surface any future sibling module should import
 * from (`crossSiblingImportPolicy` in module-deps.json). Module 15
 * (Payroll) is now ✅ COMPLETE (foundation + PASS A + PASS B,
 * docs/phase-5/PROGRESS.md) — every domain entity/repository, every
 * `application/` service (including PASS B's `PayrollRunsService`/
 * `OneoffsService`), and the GL account resolution util are exported here.
 * `api/` controllers are NOT re-exported (no other module ever imports a
 * sibling's controllers — same convention every other domain module's
 * barrel already establishes).
 */
export { PayrollModule } from "./payroll.module";

export { EmployeesService } from "./application/employees.service";
export type { CreatePyrlEmployeeInput, UpdatePyrlEmployeeInput } from "./application/employees.service";
export { ComponentsService } from "./application/components.service";
export type { CreatePyrlComponentInput, UpdatePyrlComponentInput } from "./application/components.service";
export { SalaryStructuresService, resolveComponentAmount } from "./application/salary-structures.service";
export type {
  StructureComponentFormula,
  CreatePyrlSalaryStructureInput,
  UpdatePyrlSalaryStructureInput,
  CreateStructureComponentLineInput,
  UpdateStructureComponentLineInput,
} from "./application/salary-structures.service";
export { EmployeeAssignmentsService } from "./application/employee-assignments.service";
export type { AssignEmployeeInput } from "./application/employee-assignments.service";
export { EmployeeComponentsService } from "./application/employee-components.service";
export type { AddEmployeeComponentInput } from "./application/employee-components.service";
export { StatutoryTablesService } from "./application/statutory-tables.service";
export type {
  CreatePyrlStatutoryTableInput,
  UpdatePyrlStatutoryTableInput,
} from "./application/statutory-tables.service";
export { StatutoryCalculationService } from "./application/statutory-calculation.service";
export type {
  PayeBand,
  PayeParams,
  NssfTier1Params,
  NssfTier2Params,
  NssfParams,
  ShifParams,
  AhlParams,
} from "./application/statutory-calculation.service";
export {
  LoansService,
  PAYROLL_LOANS_APPROVAL_DOMAIN_CODE,
  generateFlatSchedule,
  generateReducingSchedule,
} from "./application/loans.service";
export type { CreateLoanInput, AmortizationInstallment } from "./application/loans.service";
export { OneoffsService } from "./application/oneoffs.service";
export type { CreatePyrlOneoffInput, UpdatePyrlOneoffInput } from "./application/oneoffs.service";
export {
  PayrollRunsService,
  PAYROLL_RUN_APPROVAL_DOMAIN_CODE,
  BASIC_COMPONENT_CODE,
  PAYE_COMPONENT_CODE,
  NSSF_COMPONENT_CODE,
  SHIF_COMPONENT_CODE,
  AHL_COMPONENT_CODE,
  LOAN_RECOVERY_COMPONENT_CODE,
  PROTECTED_NET_FLOOR_RATIO_SETTING_KEY,
  VARIANCE_FLAG_PERCENT_SETTING_KEY,
  VARIANCE_FLAG_ABSOLUTE_KES_SETTING_KEY,
} from "./application/payroll-runs.service";
export type { CreatePyrlRunInput, PyrlRunTotals, PyrlRunVarianceReport } from "./application/payroll-runs.service";
export {
  PAYROLL_EXPENSE_ACCOUNT_CODE,
  EMPLOYER_STATUTORY_CONTRIBUTIONS_EXPENSE_ACCOUNT_CODE,
  PAYE_PAYABLE_ACCOUNT_CODE,
  NSSF_PAYABLE_ACCOUNT_CODE,
  SHIF_PAYABLE_ACCOUNT_CODE,
  AHL_PAYABLE_ACCOUNT_CODE,
  OTHER_PAYROLL_DEDUCTIONS_PAYABLE_ACCOUNT_CODE,
  STAFF_LOANS_RECEIVABLE_ACCOUNT_CODE,
  resolvePayrollAccountByCode,
  resolveNetPayPayableAccount,
  resolveBankDisbursementAccount,
} from "./application/gl-payroll-accounts.util";

export { PyrlEmployeeEntity, PYRL_EMPLOYMENT_TYPES } from "./domain/pyrl-employee.entity";
export type { PyrlEmploymentType } from "./domain/pyrl-employee.entity";
export { PyrlComponentEntity, PYRL_COMPONENT_KINDS } from "./domain/pyrl-component.entity";
export type { PyrlComponentKind } from "./domain/pyrl-component.entity";
export { PyrlSalaryStructureEntity } from "./domain/pyrl-salary-structure.entity";
export { PyrlStructureComponentEntity } from "./domain/pyrl-structure-component.entity";
export { PyrlEmployeeAssignmentEntity } from "./domain/pyrl-employee-assignment.entity";
export { PyrlEmployeeComponentEntity } from "./domain/pyrl-employee-component.entity";
export { PyrlStatutoryTableEntity, PYRL_STATUTORY_KINDS } from "./domain/pyrl-statutory-table.entity";
export type { PyrlStatutoryKind } from "./domain/pyrl-statutory-table.entity";
export {
  PyrlLoanEntity,
  PYRL_LOAN_RATE_KINDS,
  PYRL_LOAN_STATUSES,
} from "./domain/pyrl-loan.entity";
export type { PyrlLoanRateKind, PyrlLoanStatus } from "./domain/pyrl-loan.entity";
export { PyrlLoanScheduleEntity } from "./domain/pyrl-loan-schedule.entity";
export {
  PyrlRunEntity,
  PYRL_RUN_KINDS,
  PYRL_RUN_STATUSES,
  PYRL_RUN_COMMITTED_STATUSES,
} from "./domain/pyrl-run.entity";
export type { PyrlRunKind, PyrlRunStatus } from "./domain/pyrl-run.entity";
export { PyrlRunLineEntity, PYRL_RUN_LINE_PAID_VIA_VALUES } from "./domain/pyrl-run-line.entity";
export type { PyrlRunLinePaidVia } from "./domain/pyrl-run-line.entity";
export { PyrlRunLineComponentEntity } from "./domain/pyrl-run-line-component.entity";
export { PyrlOneoffEntity, PYRL_ONEOFF_KINDS } from "./domain/pyrl-oneoff.entity";
export type { PyrlOneoffKind } from "./domain/pyrl-oneoff.entity";

export { PyrlEmployeeRepository } from "./infrastructure/pyrl-employee.repository";
export type { ListPyrlEmployeesFilter } from "./infrastructure/pyrl-employee.repository";
export { PyrlComponentRepository } from "./infrastructure/pyrl-component.repository";
export type { ListPyrlComponentsFilter } from "./infrastructure/pyrl-component.repository";
export { PyrlSalaryStructureRepository } from "./infrastructure/pyrl-salary-structure.repository";
export { PyrlStructureComponentRepository } from "./infrastructure/pyrl-structure-component.repository";
export { PyrlEmployeeAssignmentRepository } from "./infrastructure/pyrl-employee-assignment.repository";
export { PyrlEmployeeComponentRepository } from "./infrastructure/pyrl-employee-component.repository";
export { PyrlStatutoryTableRepository } from "./infrastructure/pyrl-statutory-table.repository";
export { PyrlLoanRepository } from "./infrastructure/pyrl-loan.repository";
export type { ListPyrlLoansFilter } from "./infrastructure/pyrl-loan.repository";
export { PyrlLoanScheduleRepository } from "./infrastructure/pyrl-loan-schedule.repository";
export { PyrlRunRepository } from "./infrastructure/pyrl-run.repository";
export type { ListPyrlRunsFilter } from "./infrastructure/pyrl-run.repository";
export { PyrlRunLineRepository } from "./infrastructure/pyrl-run-line.repository";
export { PyrlRunLineComponentRepository } from "./infrastructure/pyrl-run-line-component.repository";
export { PyrlOneoffRepository } from "./infrastructure/pyrl-oneoff.repository";
