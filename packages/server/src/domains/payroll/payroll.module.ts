import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AccountingModule } from "../../accounting";
import { ApprovalsModule } from "../../platform/approvals";
import { SettingsModule } from "../../platform/settings";
import { PyrlEmployeeEntity } from "./domain/pyrl-employee.entity";
import { PyrlComponentEntity } from "./domain/pyrl-component.entity";
import { PyrlSalaryStructureEntity } from "./domain/pyrl-salary-structure.entity";
import { PyrlStructureComponentEntity } from "./domain/pyrl-structure-component.entity";
import { PyrlEmployeeAssignmentEntity } from "./domain/pyrl-employee-assignment.entity";
import { PyrlEmployeeComponentEntity } from "./domain/pyrl-employee-component.entity";
import { PyrlStatutoryTableEntity } from "./domain/pyrl-statutory-table.entity";
import { PyrlLoanEntity } from "./domain/pyrl-loan.entity";
import { PyrlLoanScheduleEntity } from "./domain/pyrl-loan-schedule.entity";
import { PyrlRunEntity } from "./domain/pyrl-run.entity";
import { PyrlRunLineEntity } from "./domain/pyrl-run-line.entity";
import { PyrlRunLineComponentEntity } from "./domain/pyrl-run-line-component.entity";
import { PyrlOneoffEntity } from "./domain/pyrl-oneoff.entity";
import { PyrlEmployeeRepository } from "./infrastructure/pyrl-employee.repository";
import { PyrlComponentRepository } from "./infrastructure/pyrl-component.repository";
import { PyrlSalaryStructureRepository } from "./infrastructure/pyrl-salary-structure.repository";
import { PyrlStructureComponentRepository } from "./infrastructure/pyrl-structure-component.repository";
import { PyrlEmployeeAssignmentRepository } from "./infrastructure/pyrl-employee-assignment.repository";
import { PyrlEmployeeComponentRepository } from "./infrastructure/pyrl-employee-component.repository";
import { PyrlStatutoryTableRepository } from "./infrastructure/pyrl-statutory-table.repository";
import { PyrlLoanRepository } from "./infrastructure/pyrl-loan.repository";
import { PyrlLoanScheduleRepository } from "./infrastructure/pyrl-loan-schedule.repository";
import { PyrlRunRepository } from "./infrastructure/pyrl-run.repository";
import { PyrlRunLineRepository } from "./infrastructure/pyrl-run-line.repository";
import { PyrlRunLineComponentRepository } from "./infrastructure/pyrl-run-line-component.repository";
import { PyrlOneoffRepository } from "./infrastructure/pyrl-oneoff.repository";
import { EmployeesService } from "./application/employees.service";
import { ComponentsService } from "./application/components.service";
import { SalaryStructuresService } from "./application/salary-structures.service";
import { EmployeeAssignmentsService } from "./application/employee-assignments.service";
import { EmployeeComponentsService } from "./application/employee-components.service";
import { StatutoryTablesService } from "./application/statutory-tables.service";
import { StatutoryCalculationService } from "./application/statutory-calculation.service";
import { LoansService } from "./application/loans.service";
import { PayrollRunsService } from "./application/payroll-runs.service";
import { OneoffsService } from "./application/oneoffs.service";
import { EmployeesController } from "./api/employees.controller";
import { ComponentsController } from "./api/components.controller";
import { SalaryStructuresController } from "./api/salary-structures.controller";
import { EmployeeAssignmentsController } from "./api/employee-assignments.controller";
import { EmployeeComponentsController } from "./api/employee-components.controller";
import { StatutoryTablesController } from "./api/statutory-tables.controller";
import { LoansController } from "./api/loans.controller";
import { PayrollRunsController } from "./api/payroll-runs.controller";
import { OneoffsController } from "./api/oneoffs.controller";

/**
 * Module 15 (Payroll) — **PASS B** (docs/phase-5/PROGRESS.md), the FINAL
 * pass completing this module on top of the foundation pass + PASS A
 * (employee/component/structure/assignment/loan management + the statutory
 * tax computation engine). Adds `PayrollRunsService` (the run-lifecycle
 * engine: compute/review/submit/decide/commit/pay/file), ALL 8 controllers
 * (`api/`), the permission catalogue additions, and the real Kenyan
 * statutory rate seed (`0900`).
 *
 * **New in PASS B: `AccountingModule`** — `PayrollRunsService`/
 * `gl-payroll-accounts.util.ts` need `PostingService` (P-27/P-28) and
 * `GlAccountRepository` (every payroll GL account resolution), both exported
 * by `AccountingModule`'s barrel. `SettingsModule`/`ApprovalsModule` were
 * already imported from PASS A (`NumberingService`/`ApprovalEngineService`),
 * now also exercised by `PayrollRunsService` itself (`SettingsService.getTyped()`
 * for BR-PYRL-03's protected-net floor + `review()`'s variance thresholds,
 * `ApprovalEngineService.submit()` for the `PAYROLL_RUN` domain code).
 * `AppConfigService` is no longer a local `providers` entry — the
 * `apps/api` composition root's `SharedInfraModule`
 * (`shared/infra/shared-infra.module.ts`, `@Global()`) now provides it once
 * for the whole app.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PyrlEmployeeEntity,
      PyrlComponentEntity,
      PyrlSalaryStructureEntity,
      PyrlStructureComponentEntity,
      PyrlEmployeeAssignmentEntity,
      PyrlEmployeeComponentEntity,
      PyrlStatutoryTableEntity,
      PyrlLoanEntity,
      PyrlLoanScheduleEntity,
      PyrlRunEntity,
      PyrlRunLineEntity,
      PyrlRunLineComponentEntity,
      PyrlOneoffEntity,
    ]),
    SettingsModule,
    ApprovalsModule,
    AccountingModule,
  ],
  controllers: [
    EmployeesController,
    ComponentsController,
    SalaryStructuresController,
    EmployeeAssignmentsController,
    EmployeeComponentsController,
    StatutoryTablesController,
    LoansController,
    PayrollRunsController,
    OneoffsController,
  ],
  providers: [
    PyrlEmployeeRepository,
    PyrlComponentRepository,
    PyrlSalaryStructureRepository,
    PyrlStructureComponentRepository,
    PyrlEmployeeAssignmentRepository,
    PyrlEmployeeComponentRepository,
    PyrlStatutoryTableRepository,
    PyrlLoanRepository,
    PyrlLoanScheduleRepository,
    PyrlRunRepository,
    PyrlRunLineRepository,
    PyrlRunLineComponentRepository,
    PyrlOneoffRepository,
    EmployeesService,
    ComponentsService,
    SalaryStructuresService,
    EmployeeAssignmentsService,
    EmployeeComponentsService,
    StatutoryTablesService,
    StatutoryCalculationService,
    LoansService,
    PayrollRunsService,
    OneoffsService,
  ],
  exports: [
    PyrlEmployeeRepository,
    PyrlComponentRepository,
    PyrlSalaryStructureRepository,
    PyrlStructureComponentRepository,
    PyrlEmployeeAssignmentRepository,
    PyrlEmployeeComponentRepository,
    PyrlStatutoryTableRepository,
    PyrlLoanRepository,
    PyrlLoanScheduleRepository,
    PyrlRunRepository,
    PyrlRunLineRepository,
    PyrlRunLineComponentRepository,
    PyrlOneoffRepository,
    EmployeesService,
    ComponentsService,
    SalaryStructuresService,
    EmployeeAssignmentsService,
    EmployeeComponentsService,
    StatutoryTablesService,
    StatutoryCalculationService,
    LoansService,
    PayrollRunsService,
    OneoffsService,
  ],
})
export class PayrollModule {}
