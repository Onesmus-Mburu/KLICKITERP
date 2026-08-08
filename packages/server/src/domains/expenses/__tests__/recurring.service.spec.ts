import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { computeNextRunOn, RecurringService } from "../application/recurring.service";
import { ExpCategoryEntity } from "../domain/exp-category.entity";
import { ExpRecurringEntity } from "../domain/exp-recurring.entity";
import { ExpVoucherEntity } from "../domain/exp-voucher.entity";

function makeTemplateRow(overrides: Partial<ExpRecurringEntity> = {}): ExpRecurringEntity {
  return {
    id: "recur-1",
    template: {
      payeeType: "OTHER",
      payeeRef: { name: "Landlord" },
      categoryId: "cat-1",
      costCenterId: null,
      amount: "1000.0000",
      method: "BANK",
      narrative: "Monthly rent",
    },
    scheduleCron: "0 0 1 * *",
    nextRunOn: "2026-01-01",
    lastVoucherId: null,
    isActive: true,
    ...overrides,
  } as ExpRecurringEntity;
}

function makeCategory(overrides: Partial<ExpCategoryEntity> = {}): ExpCategoryEntity {
  return { id: "cat-1", name: "Rent", parentId: null, glExpenseAccountId: "exp-acc-1", budgetRequired: false, isActive: true, ...overrides } as ExpCategoryEntity;
}

describe("computeNextRunOn() — schedule_cron next-run-date computation", () => {
  it("MONTHLY ('0 0 1 * *'): returns the 1st of the following month", () => {
    expect(computeNextRunOn("2026-01-15", "0 0 1 * *")).toBe("2026-02-01");
  });

  it("MONTHLY: from the 1st itself, returns the 1st of the NEXT month (walks forward from fromDate+1)", () => {
    expect(computeNextRunOn("2026-01-01", "0 0 1 * *")).toBe("2026-02-01");
  });

  it("MONTHLY: correctly rolls across a year boundary", () => {
    expect(computeNextRunOn("2026-12-15", "0 0 1 * *")).toBe("2027-01-01");
  });

  it("WEEKLY ('0 0 * * 1' = every Monday): returns the next Monday", () => {
    // 2026-01-15 is a Thursday; the next Monday is 2026-01-19.
    expect(computeNextRunOn("2026-01-15", "0 0 * * 1")).toBe("2026-01-19");
  });

  it("exact day-of-month AND exact month (e.g. one fixed date per year): returns that date next year if already passed", () => {
    expect(computeNextRunOn("2026-07-01", "0 0 25 12 *")).toBe("2026-12-25");
  });

  it("rejects a cron expression with the wrong field count", () => {
    expect(() => computeNextRunOn("2026-01-01", "0 0 1 *")).toThrow(ValidationException);
  });

  it("rejects a cron field that isn't '*' or an exact integer (e.g. a range)", () => {
    expect(() => computeNextRunOn("2026-01-01", "0 0 1-5 * *")).toThrow(ValidationException);
  });
});

describe("RecurringService", () => {
  let recurringRepository: { findByIdOrFail: jest.Mock; findDueForRun: jest.Mock; listAll: jest.Mock; create: jest.Mock; save: jest.Mock };
  let categoryRepository: { findByIdOrFail: jest.Mock };
  let voucherRepository: { create: jest.Mock };
  let service: RecurringService;

  const em = {} as EntityManager;

  beforeEach(() => {
    recurringRepository = {
      findByIdOrFail: jest.fn(async () => makeTemplateRow()),
      findDueForRun: jest.fn(async () => [makeTemplateRow()]),
      listAll: jest.fn(async () => []),
      create: jest.fn(async (data) => makeTemplateRow(data)),
      save: jest.fn(async (e) => e),
    };
    categoryRepository = { findByIdOrFail: jest.fn(async () => makeCategory()) };
    voucherRepository = { create: jest.fn(async (data) => ({ ...data, id: "voucher-new" }) as ExpVoucherEntity) };

    service = new RecurringService(recurringRepository as never, categoryRepository as never, voucherRepository as never);
  });

  describe("create()", () => {
    it("rejects a malformed template (missing required fields)", async () => {
      await expect(
        service.create(
          {
            template: { payeeType: "OTHER", payeeRef: {}, categoryId: "", amount: "100", method: "CASH", narrative: "" } as never,
            scheduleCron: "0 0 1 * *",
            nextRunOn: "2026-01-01",
          },
          "actor-1",
        ),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects an invalid schedule_cron shape", async () => {
      await expect(
        service.create(
          {
            template: { payeeType: "OTHER", payeeRef: {}, categoryId: "cat-1", amount: "100", method: "CASH", narrative: "x" },
            scheduleCron: "invalid",
            nextRunOn: "2026-01-01",
          },
          "actor-1",
        ),
      ).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("runDue() — template-to-voucher mapping and next-run-date advancement", () => {
    it("materializes a DRAFT exp_voucher from the template for each due row", async () => {
      const results = await service.runDue(em, "2026-01-01", "actor-1");

      expect(voucherRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payeeType: "OTHER",
          payeeRef: { name: "Landlord" },
          categoryId: "cat-1",
          costCenterId: null,
          amount: Money.fromInt(1000),
          method: "BANK",
          status: "DRAFT",
          journalId: null,
          approvalRef: null,
        }),
        em,
      );
      expect(results).toHaveLength(1);
      expect(results[0].recurringId).toBe("recur-1");
      expect(results[0].voucherId).toBe("voucher-new");
    });

    it("advances next_run_on per schedule_cron and stamps last_voucher_id", async () => {
      await service.runDue(em, "2026-01-01", "actor-1");
      expect(recurringRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ nextRunOn: "2026-02-01", lastVoucherId: "voucher-new" }),
        em,
      );
    });

    it("no due templates: returns an empty array, touches nothing", async () => {
      recurringRepository.findDueForRun.mockResolvedValue([]);
      const results = await service.runDue(em, "2026-01-01", "actor-1");
      expect(results).toEqual([]);
      expect(voucherRepository.create).not.toHaveBeenCalled();
      expect(recurringRepository.save).not.toHaveBeenCalled();
    });

    it("processes multiple due templates independently", async () => {
      recurringRepository.findDueForRun.mockResolvedValue([
        makeTemplateRow({ id: "recur-1" }),
        makeTemplateRow({ id: "recur-2", scheduleCron: "0 0 * * 1" }),
      ]);
      const results = await service.runDue(em, "2026-01-01", "actor-1");
      expect(results).toHaveLength(2);
      expect(voucherRepository.create).toHaveBeenCalledTimes(2);
    });
  });
});
