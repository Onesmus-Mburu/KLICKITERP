import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import {
  generateFlatSchedule,
  generateReducingSchedule,
  LoansService,
  PAYROLL_LOANS_APPROVAL_DOMAIN_CODE,
} from "../application/loans.service";
import { PyrlLoanEntity } from "../domain/pyrl-loan.entity";
import { PyrlLoanScheduleEntity } from "../domain/pyrl-loan-schedule.entity";

function makeLoan(overrides: Partial<PyrlLoanEntity>): PyrlLoanEntity {
  return {
    id: "loan-1",
    number: "PYR-000001",
    employeeId: "emp-1",
    principal: Money.fromInt(120000),
    rate: "0.120000",
    rateKind: "FLAT",
    termMonths: 12,
    status: "PENDING_APPROVAL",
    approvalRef: null,
    balance: Money.fromInt(120000),
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    version: 1,
    ...overrides,
  } as PyrlLoanEntity;
}

function makeScheduleRow(overrides: Partial<PyrlLoanScheduleEntity>): PyrlLoanScheduleEntity {
  return {
    id: "sched-1",
    loanId: "loan-1",
    seq: 1,
    duePeriod: "2026-07",
    principalDue: Money.fromInt(10000),
    interestDue: Money.fromInt(1200),
    recoveredAmount: Money.ZERO,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    version: 1,
    ...overrides,
  } as PyrlLoanScheduleEntity;
}

describe("generateFlatSchedule (pure)", () => {
  it("worked example: principal=120000, rate=12%/year, term=12 months", () => {
    // FLAT: principal/12=10000 each period exactly; annual interest=120000*0.12=14400,
    // monthly interest=14400/12=1200 exactly (evenly divisible — no rounding).
    const rows = generateFlatSchedule(Money.fromInt(120000), "0.12", 12);
    expect(rows).toHaveLength(12);
    for (const row of rows) {
      expect(row.principalDue).toEqual(Money.fromInt(10000));
      expect(row.interestDue).toEqual(Money.fromInt(1200));
    }
    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

    const totalPrincipal = rows.reduce((sum, r) => sum.add(r.principalDue), Money.ZERO);
    const totalInterest = rows.reduce((sum, r) => sum.add(r.interestDue), Money.ZERO);
    expect(totalPrincipal).toEqual(Money.fromInt(120000));
    expect(totalInterest).toEqual(Money.fromInt(14400));
    // The schedule's grand total (principal + total interest) reconciles exactly.
    expect(totalPrincipal.add(totalInterest)).toEqual(Money.fromInt(134400));
  });

  it("reconciles exactly even when principal doesn't divide evenly across the term", () => {
    // 100000/3 doesn't divide evenly — Money.allocate()'s largest-remainder method
    // still guarantees the parts sum to EXACTLY the principal, no leakage.
    const rows = generateFlatSchedule(Money.fromInt(100000), "0.09", 3);
    const totalPrincipal = rows.reduce((sum, r) => sum.add(r.principalDue), Money.ZERO);
    expect(totalPrincipal).toEqual(Money.fromInt(100000));
    // annual interest = 100000*0.09=9000; monthly=9000/3(months, i.e. /12)=750 exactly.
    for (const row of rows) {
      expect(row.interestDue).toEqual(Money.fromInt(750));
    }
  });
});

describe("generateReducingSchedule (pure)", () => {
  it("worked example: principal=120000, rate=12%/year, term=12 months (hand/reference-computed amortization table)", () => {
    // Reference table computed via the standard EMI formula
    // EMI = P*r*(1+r)^n / ((1+r)^n - 1), r=0.01 (12%/12), n=12:
    // EMI = 10661.8546 (rounded to Money's 4dp scale).
    const expected: { seq: number; interestDue: string; principalDue: string }[] = [
      { seq: 1, interestDue: "1200.0000", principalDue: "9461.8546" },
      { seq: 2, interestDue: "1105.3815", principalDue: "9556.4731" },
      { seq: 3, interestDue: "1009.8167", principalDue: "9652.0379" },
      { seq: 4, interestDue: "913.2963", principalDue: "9748.5583" },
      { seq: 5, interestDue: "815.8108", principalDue: "9846.0438" },
      { seq: 6, interestDue: "717.3503", principalDue: "9944.5043" },
      { seq: 7, interestDue: "617.9053", principalDue: "10043.9493" },
      { seq: 8, interestDue: "517.4658", principalDue: "10144.3888" },
      { seq: 9, interestDue: "416.0219", principalDue: "10245.8327" },
      { seq: 10, interestDue: "313.5636", principalDue: "10348.2910" },
      { seq: 11, interestDue: "210.0807", principalDue: "10451.7739" },
      { seq: 12, interestDue: "105.5629", principalDue: "10556.2923" },
    ];

    const rows = generateReducingSchedule(Money.fromInt(120000), "0.12", 12);
    expect(rows).toHaveLength(12);
    rows.forEach((row, index) => {
      expect(row.seq).toBe(expected[index].seq);
      expect(row.interestDue).toEqual(Money.fromDecimalString(expected[index].interestDue));
      expect(row.principalDue).toEqual(Money.fromDecimalString(expected[index].principalDue));
    });

    const totalPrincipal = rows.reduce((sum, r) => sum.add(r.principalDue), Money.ZERO);
    const totalInterest = rows.reduce((sum, r) => sum.add(r.interestDue), Money.ZERO);
    expect(totalPrincipal).toEqual(Money.fromInt(120000));
    expect(totalInterest).toEqual(Money.fromDecimalString("7942.2558"));
  });

  it("always reconciles the remaining balance to exactly zero (general invariant, not just the worked example)", () => {
    const rows = generateReducingSchedule(Money.fromInt(87650), "0.185000", 18);
    const totalPrincipal = rows.reduce((sum, r) => sum.add(r.principalDue), Money.ZERO);
    expect(totalPrincipal).toEqual(Money.fromInt(87650));
  });

  it("zero-rate loan degenerates to a plain equal-principal-split, zero interest", () => {
    const rows = generateReducingSchedule(Money.fromInt(12000), "0", 12);
    for (const row of rows) {
      expect(row.interestDue).toEqual(Money.ZERO);
    }
    const totalPrincipal = rows.reduce((sum, r) => sum.add(r.principalDue), Money.ZERO);
    expect(totalPrincipal).toEqual(Money.fromInt(12000));
  });
});

describe("LoansService", () => {
  let loanRepository: { findByIdOrFail: jest.Mock; findByNumber: jest.Mock; list: jest.Mock; create: jest.Mock; save: jest.Mock };
  let loanScheduleRepository: { findByLoanId: jest.Mock; create: jest.Mock; save: jest.Mock };
  let numberingService: { allocate: jest.Mock };
  let approvalEngine: { submit: jest.Mock };
  let service: LoansService;
  const em = {} as EntityManager;

  beforeEach(() => {
    loanRepository = {
      findByIdOrFail: jest.fn(async () => makeLoan({})),
      findByNumber: jest.fn(),
      list: jest.fn(async () => []),
      create: jest.fn(async (data) => makeLoan(data)),
      save: jest.fn(async (e) => e),
    };
    loanScheduleRepository = {
      findByLoanId: jest.fn(async () => []),
      create: jest.fn(async (data) => makeScheduleRow(data)),
      save: jest.fn(async (e) => e),
    };
    numberingService = { allocate: jest.fn(async () => "PYR-000001") };
    approvalEngine = { submit: jest.fn(async () => ({ id: "instance-1" })) };
    service = new LoansService(loanRepository as never, loanScheduleRepository as never, numberingService as never, approvalEngine as never);
  });

  describe("create", () => {
    it("allocates a loan number, submits for approval, and stages PENDING_APPROVAL with balance=principal", async () => {
      const loan = await service.create(
        em,
        { employeeId: "emp-1", principal: Money.fromInt(120000), rate: "0.12", rateKind: "FLAT", termMonths: 12 },
        "initiator-1",
      );
      expect(numberingService.allocate).toHaveBeenCalledWith(em, "PYRL_LOAN");
      expect(approvalEngine.submit).toHaveBeenCalledWith(
        em,
        expect.objectContaining({
          domainCode: PAYROLL_LOANS_APPROVAL_DOMAIN_CODE,
          entityType: "pyrl_loan",
          amount: Money.fromInt(120000),
          initiatorId: "initiator-1",
        }),
      );
      expect(loan.status).toBe("PENDING_APPROVAL");
      expect(loan.balance).toEqual(Money.fromInt(120000));
      expect(loan.approvalRef).toBe("instance-1");
    });

    it("rejects a non-positive principal", async () => {
      await expect(
        service.create(em, { employeeId: "emp-1", principal: Money.ZERO, rate: "0.12", rateKind: "FLAT", termMonths: 12 }, "initiator-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a non-positive term", async () => {
      await expect(
        service.create(
          em,
          { employeeId: "emp-1", principal: Money.fromInt(1000), rate: "0.12", rateKind: "FLAT", termMonths: 0 },
          "initiator-1",
        ),
      ).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("onApprovalDecided", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2026-07-15T00:00:00.000Z"));
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it("approved=false writes the loan off immediately and generates no schedule", async () => {
      loanRepository.findByIdOrFail.mockResolvedValue(makeLoan({ status: "PENDING_APPROVAL" }));
      const loan = await service.onApprovalDecided(em, "loan-1", false);
      expect(loan.status).toBe("WRITTEN_OFF");
      expect(loanScheduleRepository.create).not.toHaveBeenCalled();
    });

    it("approved=true activates the loan and generates the full amortization schedule anchored to the decision month", async () => {
      loanRepository.findByIdOrFail.mockResolvedValue(
        makeLoan({ status: "PENDING_APPROVAL", rateKind: "FLAT", principal: Money.fromInt(120000), rate: "0.12", termMonths: 12 }),
      );
      const loan = await service.onApprovalDecided(em, "loan-1", true);
      expect(loan.status).toBe("ACTIVE");
      expect(loan.balance).toEqual(Money.fromInt(120000));
      expect(loanScheduleRepository.create).toHaveBeenCalledTimes(12);

      const firstCallArg = loanScheduleRepository.create.mock.calls[0][0];
      expect(firstCallArg.seq).toBe(1);
      expect(firstCallArg.duePeriod).toBe("2026-07");
      expect(firstCallArg.principalDue).toEqual(Money.fromInt(10000));
      expect(firstCallArg.interestDue).toEqual(Money.fromInt(1200));

      const secondCallArg = loanScheduleRepository.create.mock.calls[1][0];
      expect(secondCallArg.duePeriod).toBe("2026-08");

      const lastCallArg = loanScheduleRepository.create.mock.calls[11][0];
      expect(lastCallArg.duePeriod).toBe("2027-06");
    });

    it("rejects a decision on a loan that is not PENDING_APPROVAL", async () => {
      loanRepository.findByIdOrFail.mockResolvedValue(makeLoan({ status: "ACTIVE" }));
      await expect(service.onApprovalDecided(em, "loan-1", true)).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("recordRecovery", () => {
    it("accumulates recovered_amount on the matching schedule row and decrements the loan balance", async () => {
      loanRepository.findByIdOrFail.mockResolvedValue(makeLoan({ status: "ACTIVE", balance: Money.fromInt(120000) }));
      loanScheduleRepository.findByLoanId.mockResolvedValue([
        makeScheduleRow({ duePeriod: "2026-07", recoveredAmount: Money.ZERO }),
      ]);
      const loan = await service.recordRecovery(em, "loan-1", "2026-07", Money.fromInt(11200));
      expect(loanScheduleRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ recoveredAmount: Money.fromInt(11200) }),
        em,
      );
      expect(loan.balance).toEqual(Money.fromInt(108800));
      expect(loan.status).toBe("ACTIVE");
    });

    it("flips the loan to SETTLED once balance reaches zero", async () => {
      loanRepository.findByIdOrFail.mockResolvedValue(makeLoan({ status: "ACTIVE", balance: Money.fromInt(11200) }));
      loanScheduleRepository.findByLoanId.mockResolvedValue([makeScheduleRow({ duePeriod: "2027-06" })]);
      const loan = await service.recordRecovery(em, "loan-1", "2027-06", Money.fromInt(11200));
      expect(loan.balance).toEqual(Money.ZERO);
      expect(loan.status).toBe("SETTLED");
    });

    it("rejects a recovery against a loan that is not ACTIVE", async () => {
      loanRepository.findByIdOrFail.mockResolvedValue(makeLoan({ status: "PENDING_APPROVAL" }));
      await expect(service.recordRecovery(em, "loan-1", "2026-07", Money.fromInt(100))).rejects.toBeInstanceOf(
        ValidationException,
      );
    });

    it("rejects a period with no matching installment", async () => {
      loanRepository.findByIdOrFail.mockResolvedValue(makeLoan({ status: "ACTIVE" }));
      loanScheduleRepository.findByLoanId.mockResolvedValue([makeScheduleRow({ duePeriod: "2026-07" })]);
      await expect(service.recordRecovery(em, "loan-1", "2099-01", Money.fromInt(100))).rejects.toBeInstanceOf(
        ValidationException,
      );
    });
  });

  describe("settleEarly", () => {
    it("zeroes out strictly-future, unrecovered installments and marks the loan SETTLED", async () => {
      loanRepository.findByIdOrFail.mockResolvedValue(makeLoan({ status: "ACTIVE" }));
      loanScheduleRepository.findByLoanId.mockResolvedValue([
        makeScheduleRow({ id: "past", duePeriod: "2026-06", recoveredAmount: Money.fromInt(11200) }),
        makeScheduleRow({ id: "current", duePeriod: "2026-07", recoveredAmount: Money.ZERO }),
        makeScheduleRow({ id: "future-1", duePeriod: "2026-08", recoveredAmount: Money.ZERO }),
        makeScheduleRow({ id: "future-2", duePeriod: "2026-09", recoveredAmount: Money.ZERO }),
      ]);

      const loan = await service.settleEarly(em, "loan-1", "2026-07-20");

      expect(loan.status).toBe("SETTLED");
      expect(loan.balance).toEqual(Money.ZERO);
      // Only the strictly-future rows (due_period > '2026-07') got zeroed.
      const savedIds = loanScheduleRepository.save.mock.calls.map((call) => call[0].id);
      expect(savedIds.sort()).toEqual(["future-1", "future-2"]);
      for (const call of loanScheduleRepository.save.mock.calls) {
        expect(call[0].principalDue).toEqual(Money.ZERO);
        expect(call[0].interestDue).toEqual(Money.ZERO);
      }
    });

    it("leaves an already-partially-recovered future row untouched", async () => {
      loanRepository.findByIdOrFail.mockResolvedValue(makeLoan({ status: "ACTIVE" }));
      loanScheduleRepository.findByLoanId.mockResolvedValue([
        makeScheduleRow({ id: "future-partial", duePeriod: "2026-08", recoveredAmount: Money.fromInt(500) }),
      ]);
      await service.settleEarly(em, "loan-1", "2026-07-20");
      expect(loanScheduleRepository.save).not.toHaveBeenCalled();
    });

    it("rejects settlement of a loan that is not ACTIVE", async () => {
      loanRepository.findByIdOrFail.mockResolvedValue(makeLoan({ status: "SETTLED" }));
      await expect(service.settleEarly(em, "loan-1", "2026-07-20")).rejects.toBeInstanceOf(ValidationException);
    });
  });
});
