import { EntityManager } from "typeorm";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { PayrollRunsService } from "../application/payroll-runs.service";
import { PyrlRunEntity } from "../domain/pyrl-run.entity";
import { PyrlRunLineEntity } from "../domain/pyrl-run-line.entity";
import { PyrlEmployeeEntity } from "../domain/pyrl-employee.entity";
import { PyrlEmployeeAssignmentEntity } from "../domain/pyrl-employee-assignment.entity";
import { PyrlStructureComponentEntity } from "../domain/pyrl-structure-component.entity";
import { PyrlComponentEntity } from "../domain/pyrl-component.entity";
import { PyrlLoanEntity } from "../domain/pyrl-loan.entity";
import { PyrlLoanScheduleEntity } from "../domain/pyrl-loan-schedule.entity";

const em = {} as EntityManager;

function makeRun(overrides: Partial<PyrlRunEntity>): PyrlRunEntity {
  return {
    id: "run-1",
    periodKey: "2026-07",
    runKind: "MAIN",
    supplementsRunId: null,
    status: "DRAFT",
    initiatedBy: "user-1",
    approvedBy: null,
    committedAt: null,
    journalId: null,
    totals: {},
    varianceReport: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    version: 1,
    ...overrides,
  } as PyrlRunEntity;
}

function makeEmployee(overrides: Partial<PyrlEmployeeEntity>): PyrlEmployeeEntity {
  return {
    id: "emp-1",
    staffNo: "S001",
    userId: null,
    fullName: "Jane Doe",
    nationalId: "12345678",
    kraPin: "A123456789Z",
    nssfNo: null,
    shifNo: null,
    employmentType: "PERMANENT",
    departmentId: "dept-1",
    jobTitle: "Teacher",
    hireDate: "2020-01-01",
    exitDate: null,
    payDetails: null,
    bankName: null,
    branch: null,
    account: null,
    costCenterId: "cc-1",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    version: 1,
    ...overrides,
  } as PyrlEmployeeEntity;
}

function makeAssignment(overrides: Partial<PyrlEmployeeAssignmentEntity>): PyrlEmployeeAssignmentEntity {
  return {
    id: "assign-1",
    employeeId: "emp-1",
    structureId: "struct-1",
    basicPay: Money.fromInt(30000),
    effectiveFrom: "2020-01-01",
    effectiveTo: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    version: 1,
    ...overrides,
  } as PyrlEmployeeAssignmentEntity;
}

function makeStructureLine(overrides: Partial<PyrlStructureComponentEntity>): PyrlStructureComponentEntity {
  return {
    id: "sline-1",
    structureId: "struct-1",
    componentId: "comp-house",
    amount: null,
    formula: { type: "PERCENT_OF_BASIC", rate: "0.10" },
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    version: 1,
    ...overrides,
  } as PyrlStructureComponentEntity;
}

function makeComponent(overrides: Partial<PyrlComponentEntity>): PyrlComponentEntity {
  return {
    id: "comp-x",
    code: "X",
    name: "X",
    kind: "EARNING",
    isTaxable: true,
    isStatutory: false,
    glAccountId: "gl-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    version: 1,
    ...overrides,
  } as PyrlComponentEntity;
}

function makeRunLine(overrides: Partial<PyrlRunLineEntity>): PyrlRunLineEntity {
  return {
    id: "line-1",
    runId: "run-1",
    employeeId: "emp-1",
    gross: Money.ZERO,
    taxable: Money.ZERO,
    paye: Money.ZERO,
    nssfEmployee: Money.ZERO,
    nssfEmployer: Money.ZERO,
    shif: Money.ZERO,
    ahlEmployee: Money.ZERO,
    ahlEmployer: Money.ZERO,
    loanRecovered: Money.ZERO,
    otherDeductions: Money.ZERO,
    netPay: Money.ZERO,
    deferredRecovery: Money.ZERO,
    payslipFileId: null,
    paidVia: null,
    paidAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    version: 1,
    ...overrides,
  } as PyrlRunLineEntity;
}

function makeLoan(overrides: Partial<PyrlLoanEntity>): PyrlLoanEntity {
  return {
    id: "loan-1",
    number: "PYR-000001",
    employeeId: "emp-1",
    principal: Money.fromInt(15000),
    rate: "0.12",
    rateKind: "REDUCING",
    termMonths: 12,
    status: "ACTIVE",
    approvalRef: null,
    balance: Money.fromInt(15000),
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    version: 1,
    ...overrides,
  } as PyrlLoanEntity;
}

function makeLoanSchedule(overrides: Partial<PyrlLoanScheduleEntity>): PyrlLoanScheduleEntity {
  return {
    id: "sched-1",
    loanId: "loan-1",
    seq: 1,
    duePeriod: "2026-07",
    principalDue: Money.fromInt(10000),
    interestDue: Money.fromInt(5000),
    recoveredAmount: Money.ZERO,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    version: 1,
    ...overrides,
  } as PyrlLoanScheduleEntity;
}

function activeAccount(id: string, code: string) {
  return { id, code, isActive: true, isPostable: true };
}

describe("PayrollRunsService", () => {
  let runRepository: Record<string, jest.Mock>;
  let runLineRepository: Record<string, jest.Mock>;
  let runLineComponentRepository: Record<string, jest.Mock>;
  let runLineLoanRecoveryRepository: Record<string, jest.Mock>;
  let employeeRepository: Record<string, jest.Mock>;
  let assignmentRepository: Record<string, jest.Mock>;
  let structureComponentRepository: Record<string, jest.Mock>;
  let employeeComponentRepository: Record<string, jest.Mock>;
  let oneoffRepository: Record<string, jest.Mock>;
  let componentRepository: Record<string, jest.Mock>;
  let loanRepository: Record<string, jest.Mock>;
  let loanScheduleRepository: Record<string, jest.Mock>;
  let statutoryCalculationService: Record<string, jest.Mock>;
  let loansService: Record<string, jest.Mock>;
  let approvalEngine: Record<string, jest.Mock>;
  let settingsService: Record<string, jest.Mock>;
  let postingService: Record<string, jest.Mock>;
  let glAccountRepository: Record<string, jest.Mock>;
  let service: PayrollRunsService;

  const componentsByCode: Record<string, PyrlComponentEntity> = {
    BASIC: makeComponent({ id: "comp-basic", code: "BASIC", kind: "EARNING", isTaxable: true }),
    PAYE: makeComponent({ id: "comp-paye", code: "PAYE", kind: "DEDUCTION", isTaxable: false, isStatutory: true }),
    NSSF: makeComponent({ id: "comp-nssf", code: "NSSF", kind: "DEDUCTION", isTaxable: false, isStatutory: true }),
    SHIF: makeComponent({ id: "comp-shif", code: "SHIF", kind: "DEDUCTION", isTaxable: false, isStatutory: true }),
    AHL: makeComponent({ id: "comp-ahl", code: "AHL", kind: "DEDUCTION", isTaxable: false, isStatutory: true }),
    LOAN_RECOVERY: makeComponent({ id: "comp-loan", code: "LOAN_RECOVERY", kind: "DEDUCTION", isTaxable: false }),
  };
  const componentsById: Record<string, PyrlComponentEntity> = {
    "comp-house": makeComponent({ id: "comp-house", code: "HOUSE_ALLOWANCE", kind: "EARNING", isTaxable: true }),
    ...Object.fromEntries(Object.values(componentsByCode).map((c) => [c.id, c])),
  };

  beforeEach(() => {
    runRepository = {
      findByIdOrFail: jest.fn(async () => makeRun({})),
      save: jest.fn(async (r) => r),
      findFinalizedMainForPeriod: jest.fn(async () => null),
      create: jest.fn(async (data) => makeRun(data)),
      list: jest.fn(async () => []),
    };
    runLineRepository = {
      deleteByRunId: jest.fn(async () => undefined),
      create: jest.fn(async (data) => makeRunLine(data)),
      findByRunId: jest.fn(async () => []),
      findByRunAndEmployee: jest.fn(async () => null),
      save: jest.fn(async (l) => l),
    };
    runLineComponentRepository = {
      create: jest.fn(async (data) => ({ id: "rlc-1", ...data })),
      findByRunLineId: jest.fn(async () => []),
    };
    runLineLoanRecoveryRepository = {
      create: jest.fn(async (data) => ({ id: "rllr-1", ...data })),
      findByRunLineId: jest.fn(async () => []),
      findByRunLineAndLoan: jest.fn(async () => null),
    };
    employeeRepository = {
      list: jest.fn(async () => [makeEmployee({})]),
      findByIdOrFail: jest.fn(async (id: string) => makeEmployee({ id })),
    };
    assignmentRepository = {
      findActiveFor: jest.fn(async () => makeAssignment({})),
    };
    structureComponentRepository = {
      findByStructureId: jest.fn(async () => [makeStructureLine({})]),
    };
    employeeComponentRepository = {
      findActiveFor: jest.fn(async () => []),
    };
    oneoffRepository = {
      findByEmployeeAndPeriod: jest.fn(async () => []),
    };
    componentRepository = {
      findByCode: jest.fn(async (code: string) => componentsByCode[code] ?? null),
      findByIdOrFail: jest.fn(async (id: string) => componentsById[id]),
    };
    loanRepository = {
      findActiveForEmployee: jest.fn(async () => []),
    };
    loanScheduleRepository = {
      findByLoanId: jest.fn(async () => []),
    };
    statutoryCalculationService = {
      computePaye: jest.fn(async () => Money.ZERO),
      computeNssf: jest.fn(async () => ({ employee: Money.ZERO, employer: Money.ZERO })),
      computeShif: jest.fn(async () => Money.ZERO),
      computeAhl: jest.fn(async () => ({ employee: Money.ZERO, employer: Money.ZERO })),
    };
    loansService = {
      recordRecovery: jest.fn(async () => makeLoan({})),
    };
    approvalEngine = {
      submit: jest.fn(async () => ({ id: "instance-1" })),
    };
    settingsService = {
      getTyped: jest.fn(async (_key: string, def: unknown) => def),
    };
    postingService = {
      post: jest.fn(async () => ({ id: "journal-1", lines: [] })),
    };
    glAccountRepository = {
      findByCode: jest.fn(async (code: string) => activeAccount(`acct-${code}`, code)),
      findByControlDomain: jest.fn(async (domain: string) => (domain === "PAYROLL" ? [activeAccount("acct-2020", "2020")] : [])),
    };

    service = new PayrollRunsService(
      runRepository as never,
      runLineRepository as never,
      runLineComponentRepository as never,
      runLineLoanRecoveryRepository as never,
      employeeRepository as never,
      assignmentRepository as never,
      structureComponentRepository as never,
      employeeComponentRepository as never,
      oneoffRepository as never,
      componentRepository as never,
      loanRepository as never,
      loanScheduleRepository as never,
      statutoryCalculationService as never,
      loansService as never,
      approvalEngine as never,
      settingsService as never,
      postingService as never,
      glAccountRepository as never,
    );
  });

  describe("createRun", () => {
    it("creates a DRAFT MAIN run", async () => {
      const run = await service.createRun(em, { periodKey: "2026-07", runKind: "MAIN" }, "user-1");
      expect(run.status).toBe("DRAFT");
      expect(runRepository.create).toHaveBeenCalledWith(expect.objectContaining({ periodKey: "2026-07", runKind: "MAIN" }), em);
    });

    it("rejects a SUPPLEMENTARY run with no supplementsRunId", async () => {
      await expect(service.createRun(em, { periodKey: "2026-07", runKind: "SUPPLEMENTARY" }, "user-1")).rejects.toBeInstanceOf(
        ValidationException,
      );
    });

    it("BR-PYRL-02: rejects a second MAIN run for a period that already has one finalized (COMMITTED/PAID/FILED)", async () => {
      runRepository.findFinalizedMainForPeriod.mockResolvedValue(makeRun({ id: "existing-main-1", periodKey: "2026-07", status: "FILED" }));
      await expect(service.createRun(em, { periodKey: "2026-07", runKind: "MAIN" }, "user-1")).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(runRepository.create).not.toHaveBeenCalled();
    });

    it("BR-PYRL-02: a SUPPLEMENTARY run is allowed even when a period already has a finalized MAIN run", async () => {
      runRepository.findFinalizedMainForPeriod.mockResolvedValue(makeRun({ id: "existing-main-1", periodKey: "2026-07", status: "FILED" }));
      const run = await service.createRun(em, { periodKey: "2026-07", runKind: "SUPPLEMENTARY", supplementsRunId: "existing-main-1" }, "user-1");
      expect(run.status).toBe("DRAFT");
    });
  });

  describe("compute", () => {
    it("computes a single full-period employee's gross/taxable/statutory/net figures and breakdown rows", async () => {
      runRepository.findByIdOrFail.mockResolvedValue(makeRun({ status: "DRAFT", periodKey: "2026-07" }));
      statutoryCalculationService.computePaye.mockResolvedValue(Money.fromInt(3000));
      statutoryCalculationService.computeNssf.mockResolvedValue({ employee: Money.fromInt(1080), employer: Money.fromInt(1080) });
      statutoryCalculationService.computeShif.mockResolvedValue(Money.fromInt(900));
      statutoryCalculationService.computeAhl.mockResolvedValue({ employee: Money.fromInt(495), employer: Money.fromInt(495) });

      const run = await service.compute(em, "run-1");

      expect(runLineRepository.deleteByRunId).toHaveBeenCalledWith("run-1", em);
      // gross = basic(30000) + house(10% of 30000=3000) = 33000
      expect(runLineRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          gross: Money.fromInt(33000),
          taxable: Money.fromInt(33000),
          paye: Money.fromInt(3000),
          nssfEmployee: Money.fromInt(1080),
          nssfEmployer: Money.fromInt(1080),
          shif: Money.fromInt(900),
          ahlEmployee: Money.fromInt(495),
          ahlEmployer: Money.fromInt(495),
          loanRecovered: Money.ZERO,
          otherDeductions: Money.ZERO,
          // net = 33000 - 3000 - 1080 - 900 - 495 = 27525
          netPay: Money.fromDecimalString("27525.0000"),
        }),
        em,
      );
      // basic + house + paye + nssf + shif + ahl = 6 breakdown rows (no loan recovery — no active loan)
      expect(runLineComponentRepository.create).toHaveBeenCalledTimes(6);

      const totals = run.totals as unknown as { employeeCount: number; totalGross: string; totalNetPay: string };
      expect(totals.employeeCount).toBe(1);
      expect(totals.totalGross).toBe("33000.0000");
      expect(totals.totalNetPay).toBe("27525.0000");
      expect(run.status).toBe("COMPUTED");
    });

    it("BR-PYRL-04: excludes an employee whose exit_date is before the period start entirely", async () => {
      runRepository.findByIdOrFail.mockResolvedValue(makeRun({ status: "DRAFT", periodKey: "2026-07" }));
      employeeRepository.list.mockResolvedValue([makeEmployee({ exitDate: "2026-06-30" })]);

      const run = await service.compute(em, "run-1");

      expect(runLineRepository.create).not.toHaveBeenCalled();
      expect(assignmentRepository.findActiveFor).not.toHaveBeenCalled();
      const totals = run.totals as unknown as { employeeCount: number };
      expect(totals.employeeCount).toBe(0);
    });

    it("BR-PYRL-04: mid-period exit prorates basic pay AND every structure component by worked-days/total-days", async () => {
      // June 2026 has 30 days. Exit on 2026-06-15 => worked days = 15 (inclusive) => ratio = 15/30 = 0.5 exactly.
      runRepository.findByIdOrFail.mockResolvedValue(makeRun({ status: "DRAFT", periodKey: "2026-06" }));
      employeeRepository.list.mockResolvedValue([makeEmployee({ exitDate: "2026-06-15" })]);
      assignmentRepository.findActiveFor.mockResolvedValue(makeAssignment({ basicPay: Money.fromInt(30000) }));
      structureComponentRepository.findByStructureId.mockResolvedValue([
        makeStructureLine({ formula: { type: "PERCENT_OF_BASIC", rate: "0.10" } }),
      ]);

      const run = await service.compute(em, "run-1");

      // basic: 30000 * 0.5 = 15000; house: (30000*0.10=3000) * 0.5 = 1500; gross = 16500
      expect(runLineRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ gross: Money.fromDecimalString("16500.0000"), netPay: Money.fromDecimalString("16500.0000") }),
        em,
      );
      const totals = run.totals as unknown as { totalGross: string };
      expect(totals.totalGross).toBe("16500.0000");
    });

    it("full-period employees are never multiplied by a proration ratio (byte-identical to unprorated figures)", async () => {
      runRepository.findByIdOrFail.mockResolvedValue(makeRun({ status: "DRAFT", periodKey: "2026-07" }));
      employeeRepository.list.mockResolvedValue([makeEmployee({ exitDate: null })]);
      assignmentRepository.findActiveFor.mockResolvedValue(makeAssignment({ basicPay: Money.fromInt(30000) }));

      await service.compute(em, "run-1");

      expect(runLineRepository.create).toHaveBeenCalledWith(expect.objectContaining({ gross: Money.fromInt(33000) }), em);
    });

    it("BR-PYRL-03: caps loan recovery at the protected-net floor and defers the shortfall", async () => {
      runRepository.findByIdOrFail.mockResolvedValue(makeRun({ status: "DRAFT", periodKey: "2026-07" }));
      employeeRepository.list.mockResolvedValue([makeEmployee({})]);
      assignmentRepository.findActiveFor.mockResolvedValue(makeAssignment({ basicPay: Money.fromInt(20000) }));
      structureComponentRepository.findByStructureId.mockResolvedValue([]); // gross = basic only = 20000
      loanRepository.findActiveForEmployee.mockResolvedValue([makeLoan({ id: "loan-1" })]);
      loanScheduleRepository.findByLoanId.mockResolvedValue([
        makeLoanSchedule({ duePeriod: "2026-07", principalDue: Money.fromInt(10000), interestDue: Money.fromInt(5000), recoveredAmount: Money.ZERO }),
      ]);
      settingsService.getTyped.mockImplementation(async (key: string, def: unknown) =>
        key === "payroll.protected_net_floor_ratio" ? "0.333333" : def,
      );

      const run = await service.compute(em, "run-1");

      // netBeforeLoan = 20000 (no statutory deductions mocked). scheduledAmount = 15000, carryover = 0 => attempt = 15000.
      // protectedFloor = 20000 * 0.333333 = 6666.6600. available = 20000 - 6666.66 = 13333.3400 < attempt(15000)
      // => loanRecovered = 13333.3400, deferred = 15000 - 13333.34 = 1666.6600, netPay = 20000 - 13333.34 = 6666.6600
      expect(runLineRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          loanRecovered: Money.fromDecimalString("13333.3400"),
          deferredRecovery: Money.fromDecimalString("1666.6600"),
          netPay: Money.fromDecimalString("6666.6600"),
        }),
        em,
      );
      // recordRecovery is NEVER called during compute() — only at commit().
      expect(loansService.recordRecovery).not.toHaveBeenCalled();
      const totals = run.totals as unknown as { totalLoanRecovered: string };
      expect(totals.totalLoanRecovered).toBe("13333.3400");
      // Option B — the per-loan breakdown row exists even for a single loan.
      expect(runLineLoanRecoveryRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          loanId: "loan-1",
          scheduledAmount: Money.fromDecimalString("15000.0000"),
          carryover: Money.ZERO,
          recoveredAmount: Money.fromDecimalString("13333.3400"),
          deferredAmount: Money.fromDecimalString("1666.6600"),
        }),
        em,
      );
    });

    it("multi-loan (Option B): two active loans share ONE headroom pool, oldest-first, each independently tracked", async () => {
      runRepository.findByIdOrFail.mockResolvedValue(makeRun({ status: "DRAFT", periodKey: "2026-07" }));
      employeeRepository.list.mockResolvedValue([makeEmployee({})]);
      assignmentRepository.findActiveFor.mockResolvedValue(makeAssignment({ basicPay: Money.fromInt(20000) }));
      structureComponentRepository.findByStructureId.mockResolvedValue([]); // gross = basic only = 20000
      // findActiveForEmployee's own real order is oldest-created-first — loan-1 (older) then loan-2.
      loanRepository.findActiveForEmployee.mockResolvedValue([
        makeLoan({ id: "loan-1", createdAt: new Date("2026-01-01") }),
        makeLoan({ id: "loan-2", createdAt: new Date("2026-02-01") }),
      ]);
      loanScheduleRepository.findByLoanId.mockImplementation(async (loanId: string) =>
        loanId === "loan-1"
          ? [makeLoanSchedule({ loanId: "loan-1", duePeriod: "2026-07", principalDue: Money.fromInt(6000), interestDue: Money.fromInt(2000), recoveredAmount: Money.ZERO })]
          : [makeLoanSchedule({ loanId: "loan-2", duePeriod: "2026-07", principalDue: Money.fromInt(4000), interestDue: Money.fromInt(1000), recoveredAmount: Money.ZERO })],
      );
      settingsService.getTyped.mockImplementation(async (key: string, def: unknown) =>
        key === "payroll.protected_net_floor_ratio" ? "0.333333" : def,
      );

      const run = await service.compute(em, "run-1");

      // netBeforeLoan = 20000. protectedFloor = 6666.66. available = 13333.34 (shared pool).
      // loan-1 (oldest, first): attempt = 6000+2000 = 8000 <= available(13333.34) => recovered IN FULL, available shrinks to 5333.34.
      // loan-2: attempt = 4000+1000 = 5000 <= remaining available(5333.34) => ALSO recovered in full, available shrinks to 333.34.
      // aggregate loanRecovered = 8000 + 5000 = 13000, deferredRecovery = 0.
      expect(runLineRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ loanRecovered: Money.fromInt(13000), deferredRecovery: Money.ZERO }),
        em,
      );
      expect(runLineLoanRecoveryRepository.create).toHaveBeenCalledTimes(2);
      expect(runLineLoanRecoveryRepository.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ loanId: "loan-1", recoveredAmount: Money.fromInt(8000), deferredAmount: Money.ZERO }),
        em,
      );
      expect(runLineLoanRecoveryRepository.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ loanId: "loan-2", recoveredAmount: Money.fromInt(5000), deferredAmount: Money.ZERO }),
        em,
      );
      const totals = run.totals as unknown as { totalLoanRecovered: string };
      expect(totals.totalLoanRecovered).toBe("13000.0000");
    });

    it("multi-loan (Option B): headroom exhausted by the first loan leaves the second loan's own recovery at zero, fully deferred", async () => {
      runRepository.findByIdOrFail.mockResolvedValue(makeRun({ status: "DRAFT", periodKey: "2026-07" }));
      employeeRepository.list.mockResolvedValue([makeEmployee({})]);
      assignmentRepository.findActiveFor.mockResolvedValue(makeAssignment({ basicPay: Money.fromInt(20000) }));
      structureComponentRepository.findByStructureId.mockResolvedValue([]);
      loanRepository.findActiveForEmployee.mockResolvedValue([
        makeLoan({ id: "loan-1", createdAt: new Date("2026-01-01") }),
        makeLoan({ id: "loan-2", createdAt: new Date("2026-02-01") }),
      ]);
      loanScheduleRepository.findByLoanId.mockImplementation(async (loanId: string) =>
        loanId === "loan-1"
          ? [makeLoanSchedule({ loanId: "loan-1", duePeriod: "2026-07", principalDue: Money.fromInt(10000), interestDue: Money.fromInt(5000), recoveredAmount: Money.ZERO })]
          : [makeLoanSchedule({ loanId: "loan-2", duePeriod: "2026-07", principalDue: Money.fromInt(4000), interestDue: Money.fromInt(1000), recoveredAmount: Money.ZERO })],
      );
      settingsService.getTyped.mockImplementation(async (key: string, def: unknown) =>
        key === "payroll.protected_net_floor_ratio" ? "0.333333" : def,
      );

      await service.compute(em, "run-1");

      // available = 13333.34. loan-1 attempt = 15000 > available => loan-1 gets ALL available (13333.34), 1666.66 deferred, available -> 0.
      // loan-2 attempt = 5000, available is now 0 => loan-2 gets ZERO, fully deferred (5000).
      expect(runLineLoanRecoveryRepository.create).toHaveBeenCalledTimes(2);
      expect(runLineLoanRecoveryRepository.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ loanId: "loan-1", recoveredAmount: Money.fromDecimalString("13333.3400"), deferredAmount: Money.fromDecimalString("1666.6600") }),
        em,
      );
      expect(runLineLoanRecoveryRepository.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ loanId: "loan-2", recoveredAmount: Money.ZERO, deferredAmount: Money.fromInt(5000) }),
        em,
      );
      // aggregate: recovered = 13333.34 + 0 = 13333.34; deferred = 1666.66 + 5000 = 6666.66.
      expect(runLineRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          loanRecovered: Money.fromDecimalString("13333.3400"),
          deferredRecovery: Money.fromDecimalString("6666.6600"),
        }),
        em,
      );
    });

    it("BR-PYRL-03: adds the prior period's deferred_recovery as carryover into this period's attempt", async () => {
      runRepository.findByIdOrFail.mockResolvedValue(makeRun({ status: "DRAFT", periodKey: "2026-07" }));
      employeeRepository.list.mockResolvedValue([makeEmployee({ id: "emp-1" })]);
      assignmentRepository.findActiveFor.mockResolvedValue(makeAssignment({ basicPay: Money.fromInt(20000) }));
      structureComponentRepository.findByStructureId.mockResolvedValue([]);
      loanRepository.findActiveForEmployee.mockResolvedValue([makeLoan({ id: "loan-1" })]);
      loanScheduleRepository.findByLoanId.mockResolvedValue([
        makeLoanSchedule({ duePeriod: "2026-07", principalDue: Money.fromInt(10000), interestDue: Money.fromInt(5000), recoveredAmount: Money.ZERO }),
      ]);
      runRepository.findFinalizedMainForPeriod.mockImplementation(async (periodKey: string) =>
        periodKey === "2026-06" ? makeRun({ id: "prior-run-1", periodKey: "2026-06", status: "COMMITTED" }) : null,
      );
      runLineRepository.findByRunAndEmployee.mockResolvedValue(makeRunLine({ id: "prior-line-1", deferredRecovery: Money.fromInt(1000) }));
      runLineLoanRecoveryRepository.findByRunLineAndLoan.mockResolvedValue({
        id: "rllr-prior",
        runLineId: "prior-line-1",
        loanId: "loan-1",
        deferredAmount: Money.fromInt(1000),
      });

      await service.compute(em, "run-1");

      expect(runRepository.findFinalizedMainForPeriod).toHaveBeenCalledWith("2026-06", em);
      expect(runLineRepository.findByRunAndEmployee).toHaveBeenCalledWith("prior-run-1", "emp-1", em);
      expect(runLineLoanRecoveryRepository.findByRunLineAndLoan).toHaveBeenCalledWith("prior-line-1", "loan-1", em);
      // attempt = scheduledAmount(15000) + carryover(1000) = 16000; floor/available unchanged (13333.34)
      // => loanRecovered still capped at 13333.34 (available), deferred = 16000 - 13333.34 = 2666.66
      expect(runLineRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          loanRecovered: Money.fromDecimalString("13333.3400"),
          deferredRecovery: Money.fromDecimalString("2666.6600"),
        }),
        em,
      );
    });

    it("rejects computing a run that is not DRAFT/COMPUTED", async () => {
      runRepository.findByIdOrFail.mockResolvedValue(makeRun({ status: "REVIEW" }));
      await expect(service.compute(em, "run-1")).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("review", () => {
    it("flags gross/net_pay variance beyond threshold, and separately lists new/removed employees", async () => {
      runRepository.findByIdOrFail.mockResolvedValue(makeRun({ status: "COMPUTED", periodKey: "2026-07" }));
      runLineRepository.findByRunId.mockImplementation(async (runId: string) => {
        if (runId === "run-1") {
          return [
            makeRunLine({ employeeId: "emp-1", gross: Money.fromInt(30000), netPay: Money.fromInt(25000) }),
            makeRunLine({ employeeId: "emp-2", gross: Money.fromInt(20000), netPay: Money.fromInt(18000) }),
          ];
        }
        return [
          makeRunLine({ employeeId: "emp-1", gross: Money.fromInt(20000), netPay: Money.fromInt(17000) }),
          makeRunLine({ employeeId: "emp-3", gross: Money.fromInt(5000), netPay: Money.fromInt(4500) }),
        ];
      });
      runRepository.findFinalizedMainForPeriod.mockImplementation(async (periodKey: string) =>
        periodKey === "2026-06" ? makeRun({ id: "prior-run-1", periodKey: "2026-06", status: "COMMITTED" }) : null,
      );

      const run = await service.review(em, "run-1");

      const report = run.varianceReport as unknown as {
        priorRunId: string | null;
        flagged: { employeeId: string; reasons: string[] }[];
        newEmployeeIds: string[];
        removedEmployeeIds: string[];
      };
      expect(report.priorRunId).toBe("prior-run-1");
      expect(report.flagged).toHaveLength(1);
      expect(report.flagged[0].employeeId).toBe("emp-1");
      expect(report.flagged[0].reasons).toEqual(expect.arrayContaining(["gross_variance", "net_pay_variance"]));
      expect(report.newEmployeeIds).toEqual(["emp-2"]);
      expect(report.removedEmployeeIds).toEqual(["emp-3"]);
      expect(run.status).toBe("REVIEW");
    });

    it("rejects reviewing a run that is not COMPUTED", async () => {
      runRepository.findByIdOrFail.mockResolvedValue(makeRun({ status: "DRAFT" }));
      await expect(service.review(em, "run-1")).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("submitForApproval", () => {
    it("submits PAYROLL_RUN for the run's total net pay and moves to PENDING_APPROVAL", async () => {
      runRepository.findByIdOrFail.mockResolvedValue(
        makeRun({ status: "REVIEW", totals: { totalNetPay: "12345.6700" } as unknown as Record<string, unknown> }),
      );

      const run = await service.submitForApproval(em, "run-1", "initiator-1");

      expect(approvalEngine.submit).toHaveBeenCalledWith(
        em,
        expect.objectContaining({
          domainCode: "PAYROLL_RUN",
          entityType: "pyrl_run",
          entityId: "run-1",
          amount: Money.fromDecimalString("12345.6700"),
          initiatorId: "initiator-1",
        }),
      );
      expect(run.status).toBe("PENDING_APPROVAL");
    });

    it("rejects submitting a run that is not REVIEW", async () => {
      runRepository.findByIdOrFail.mockResolvedValue(makeRun({ status: "DRAFT" }));
      await expect(service.submitForApproval(em, "run-1", "initiator-1")).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("onApprovalDecided", () => {
    it("approved=true moves to APPROVED and records approvedBy", async () => {
      runRepository.findByIdOrFail.mockResolvedValue(makeRun({ status: "PENDING_APPROVAL" }));
      const run = await service.onApprovalDecided(em, "run-1", true, "approver-1");
      expect(run.status).toBe("APPROVED");
      expect(run.approvedBy).toBe("approver-1");
    });

    it("approved=false returns the run to REVIEW", async () => {
      runRepository.findByIdOrFail.mockResolvedValue(makeRun({ status: "PENDING_APPROVAL" }));
      const run = await service.onApprovalDecided(em, "run-1", false);
      expect(run.status).toBe("REVIEW");
    });

    it("rejects a decision on a run that is not PENDING_APPROVAL", async () => {
      runRepository.findByIdOrFail.mockResolvedValue(makeRun({ status: "DRAFT" }));
      await expect(service.onApprovalDecided(em, "run-1", true)).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("commit", () => {
    function setupTwoEmployeeCommit() {
      runRepository.findByIdOrFail.mockResolvedValue(makeRun({ status: "APPROVED", periodKey: "2026-07" }));
      runLineRepository.findByRunId.mockResolvedValue([
        makeRunLine({
          id: "line-1",
          employeeId: "emp-1",
          gross: Money.fromInt(30000),
          paye: Money.fromInt(3000),
          nssfEmployee: Money.fromInt(1080),
          nssfEmployer: Money.fromInt(1080),
          shif: Money.fromInt(900),
          ahlEmployee: Money.fromInt(495),
          ahlEmployer: Money.fromInt(495),
          loanRecovered: Money.fromInt(2000),
          otherDeductions: Money.fromInt(100),
          netPay: Money.fromDecimalString("22425.0000"),
        }),
        makeRunLine({
          id: "line-2",
          employeeId: "emp-2",
          gross: Money.fromInt(20000),
          paye: Money.fromInt(2000),
          nssfEmployee: Money.fromInt(720),
          nssfEmployer: Money.fromInt(720),
          shif: Money.fromInt(600),
          ahlEmployee: Money.fromInt(330),
          ahlEmployer: Money.fromInt(330),
          loanRecovered: Money.ZERO,
          otherDeductions: Money.ZERO,
          netPay: Money.fromInt(16350),
        }),
      ]);
      employeeRepository.findByIdOrFail.mockImplementation(async (id: string) =>
        makeEmployee({ id, costCenterId: id === "emp-1" ? "cc-1" : "cc-2" }),
      );
      // Option B — commit() now reads the per-loan breakdown compute() already
      // wrote, never re-derives "active loans" itself; only line-1 (emp-1) has
      // a positive loanRecovered, so only its own findByRunLineId is exercised.
      runLineLoanRecoveryRepository.findByRunLineId.mockImplementation(async (runLineId: string) =>
        runLineId === "line-1"
          ? [{ id: "rllr-1", runLineId: "line-1", loanId: "loan-1", recoveredAmount: Money.fromInt(2000), deferredAmount: Money.ZERO }]
          : [],
      );
    }

    it("aggregates every line into ONE balanced P-27 journal (exact debit/credit mapping across employees/cost centers)", async () => {
      setupTwoEmployeeCommit();

      const run = await service.commit(em, "run-1", "committer-1");

      expect(postingService.post).toHaveBeenCalledTimes(1);
      const draft = postingService.post.mock.calls[0][1];
      expect(draft.journalType).toBe("SYSTEM");
      expect(draft.postedBy).toBe("committer-1");

      const byAccount = (code: string) => draft.lines.filter((l: { accountId: string }) => l.accountId === `acct-${code}`);

      // Gross expense debited PER COST CENTER (5010): emp-1's cc-1 line = 30000, emp-2's cc-2 line = 20000.
      const grossLines = byAccount("5010");
      expect(grossLines).toHaveLength(2);
      expect(grossLines.find((l: { costCenterId: string }) => l.costCenterId === "cc-1").debit).toEqual(Money.fromInt(30000));
      expect(grossLines.find((l: { costCenterId: string }) => l.costCenterId === "cc-2").debit).toEqual(Money.fromInt(20000));

      // Employer NSSF+AHL contributions expense (5080): (1080+495)+(720+330) = 1575+1050 = 2625
      expect(byAccount("5080")[0].debit).toEqual(Money.fromInt(2625));
      // PAYE payable (2050): 3000+2000=5000
      expect(byAccount("2050")[0].credit).toEqual(Money.fromInt(5000));
      // NSSF payable, employee+employer combined (2060): (1080+1080)+(720+720)=3600
      expect(byAccount("2060")[0].credit).toEqual(Money.fromInt(3600));
      // SHIF payable (2070): 900+600=1500
      expect(byAccount("2070")[0].credit).toEqual(Money.fromInt(1500));
      // AHL payable, employee+employer combined (2080): (495+495)+(330+330)=1650
      expect(byAccount("2080")[0].credit).toEqual(Money.fromInt(1650));
      // Other deductions payable (2090): 100+0=100
      expect(byAccount("2090")[0].credit).toEqual(Money.fromInt(100));
      // Staff loans receivable (1600): 2000+0=2000
      expect(byAccount("1600")[0].credit).toEqual(Money.fromInt(2000));
      // Net pay payable (2020, PAYROLL control account): 22425+16350=38775
      expect(byAccount("2020")[0].credit).toEqual(Money.fromInt(38775));

      const totalDebit = draft.lines.reduce((s: Money, l: { debit: Money }) => s.add(l.debit), Money.ZERO);
      const totalCredit = draft.lines.reduce((s: Money, l: { credit: Money }) => s.add(l.credit), Money.ZERO);
      expect(totalDebit).toEqual(totalCredit);

      // Only emp-1 has a positive loan_recovered — recordRecovery called exactly once, for loan-1.
      expect(loansService.recordRecovery).toHaveBeenCalledTimes(1);
      expect(loansService.recordRecovery).toHaveBeenCalledWith(em, "loan-1", "2026-07", Money.fromInt(2000));

      expect(run.status).toBe("COMMITTED");
      expect(run.journalId).toBe("journal-1");
      expect(run.committedAt).toBeInstanceOf(Date);
    });

    it("BR-PYRL-02: translates a uq_pyrl_main_run_p unique-violation into ConflictException", async () => {
      setupTwoEmployeeCommit();
      runRepository.save.mockRejectedValueOnce({ code: "23505" });

      await expect(service.commit(em, "run-1", "committer-1")).rejects.toBeInstanceOf(ConflictException);
    });

    it("rejects committing a run that is not APPROVED", async () => {
      runRepository.findByIdOrFail.mockResolvedValue(makeRun({ status: "REVIEW" }));
      await expect(service.commit(em, "run-1", "committer-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects committing a run with no computed lines", async () => {
      runRepository.findByIdOrFail.mockResolvedValue(makeRun({ status: "APPROVED" }));
      runLineRepository.findByRunId.mockResolvedValue([]);
      await expect(service.commit(em, "run-1", "committer-1")).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("pay", () => {
    it("realizes P-28: debits Net Pay Payable, credits the resolved bank account, and stamps every line paid_via/paid_at", async () => {
      runRepository.findByIdOrFail.mockResolvedValue(makeRun({ status: "COMMITTED", periodKey: "2026-07" }));
      const lines = [makeRunLine({ id: "line-1", netPay: Money.fromInt(22425) }), makeRunLine({ id: "line-2", netPay: Money.fromInt(16350) })];
      runLineRepository.findByRunId.mockResolvedValue(lines);

      const run = await service.pay(em, "run-1", { method: "BANK" }, "payer-1");

      expect(postingService.post).toHaveBeenCalledTimes(1);
      const draft = postingService.post.mock.calls[0][1];
      expect(draft.lines).toEqual([
        expect.objectContaining({ accountId: "acct-2020", debit: Money.fromInt(38775), credit: Money.ZERO }),
        expect.objectContaining({ accountId: "acct-1020", debit: Money.ZERO, credit: Money.fromInt(38775) }),
      ]);

      expect(runLineRepository.save).toHaveBeenCalledTimes(2);
      for (const call of runLineRepository.save.mock.calls) {
        expect(call[0].paidVia).toBe("BANK");
        expect(call[0].paidAt).toBeInstanceOf(Date);
      }
      expect(run.status).toBe("PAID");
    });

    it("rejects paying a run that is not COMMITTED", async () => {
      runRepository.findByIdOrFail.mockResolvedValue(makeRun({ status: "APPROVED" }));
      await expect(service.pay(em, "run-1", { method: "BANK" }, "payer-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects paying a run with zero net pay", async () => {
      runRepository.findByIdOrFail.mockResolvedValue(makeRun({ status: "COMMITTED" }));
      runLineRepository.findByRunId.mockResolvedValue([makeRunLine({ netPay: Money.ZERO })]);
      await expect(service.pay(em, "run-1", { method: "BANK" }, "payer-1")).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("file", () => {
    it("moves a PAID run to FILED", async () => {
      runRepository.findByIdOrFail.mockResolvedValue(makeRun({ status: "PAID" }));
      const run = await service.file(em, "run-1");
      expect(run.status).toBe("FILED");
    });

    it("rejects filing a run that is not PAID", async () => {
      runRepository.findByIdOrFail.mockResolvedValue(makeRun({ status: "COMMITTED" }));
      await expect(service.file(em, "run-1")).rejects.toBeInstanceOf(ValidationException);
    });
  });
});
