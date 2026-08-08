import { DataSource, EntityManager } from "typeorm";
import { BulkAdhocInvoicesService } from "../application/bulk-adhoc-invoices.service";
import { Money } from "../../../shared/money/money";

function makeLine(overrides: Record<string, unknown> = {}) {
  return {
    id: "line-1",
    feeStructureId: "structure-1",
    feeCategoryId: "cat-1",
    termId: "term-1",
    dueDate: "2026-08-01",
    amount: Money.fromInt(1000),
    isOptional: false,
    ...overrides,
  };
}

describe("BulkAdhocInvoicesService", () => {
  let feeStructuresService: { findApplicableFor: jest.Mock };
  let feeStructureLineRepository: { listByStructureAndTerm: jest.Mock };
  let feeCategoryRepository: { findByIdOrFail: jest.Mock };
  let invoicingService: { generateInvoice: jest.Mock; postInvoice: jest.Mock };
  let billInvoiceLineRepository: { listAlreadyBilledCategoryIds: jest.Mock };
  let dataSource: DataSource;
  let service: BulkAdhocInvoicesService;

  beforeEach(() => {
    feeStructuresService = {
      findApplicableFor: jest.fn(async () => ({ id: "structure-1" })),
    };
    feeStructureLineRepository = {
      listByStructureAndTerm: jest.fn(async () => [makeLine({})]),
    };
    feeCategoryRepository = {
      findByIdOrFail: jest.fn(async (id: string) => ({ id, name: `Category ${id}` })),
    };
    invoicingService = {
      generateInvoice: jest.fn(async (_em, input) => ({ id: `invoice-${input.studentId}-${input.dueDate}` })),
      postInvoice: jest.fn(async () => undefined),
    };
    // Phase 6 Slice 12 (Part C) — a new dependency, appended at the END of
    // the constructor's existing param list (matching Part A's own
    // precedent for `WalletTransactionsService`), defaulted to "nothing
    // already billed" so every PRE-EXISTING test above stays valid with only
    // this append — none of them exercise the duplicate-billing guard.
    billInvoiceLineRepository = {
      listAlreadyBilledCategoryIds: jest.fn(async () => new Set<string>()),
    };
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager),
      ),
    } as unknown as DataSource;

    service = new BulkAdhocInvoicesService(
      dataSource,
      feeStructuresService as never,
      feeStructureLineRepository as never,
      feeCategoryRepository as never,
      invoicingService as never,
      billInvoiceLineRepository as never,
    );
  });

  it("generates and posts one invoice for a student when every selected line shares one due date", async () => {
    const result = await service.bulkGenerate(
      { termId: "term-1", classId: "class-1", feeCategoryIds: ["cat-1"], studentIds: ["s1"] },
      "initiator-1",
    );

    expect(result.succeeded).toEqual([{ studentId: "s1", invoiceIds: ["invoice-s1-2026-08-01"] }]);
    expect(result.failed).toEqual([]);
    expect(invoicingService.generateInvoice).toHaveBeenCalledTimes(1);
    expect(invoicingService.postInvoice).toHaveBeenCalledTimes(1);
    expect(invoicingService.generateInvoice).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        studentId: "s1",
        termId: "term-1",
        source: "ADHOC",
        dueDate: "2026-08-01",
        adhocLines: [{ feeCategoryId: "cat-1", description: "Category cat-1", amount: expect.anything() }],
      }),
    );
  });

  it("groups selected lines by due date, generating + posting one invoice per due-date group (2-group case)", async () => {
    feeStructureLineRepository.listByStructureAndTerm.mockResolvedValue([
      makeLine({ id: "line-1", feeCategoryId: "cat-1", dueDate: "2026-08-01" }),
      makeLine({ id: "line-2", feeCategoryId: "cat-2", dueDate: "2026-09-01" }),
    ]);

    const result = await service.bulkGenerate(
      { termId: "term-1", classId: "class-1", feeCategoryIds: ["cat-1", "cat-2"], studentIds: ["s1"] },
      "initiator-1",
    );

    expect(invoicingService.generateInvoice).toHaveBeenCalledTimes(2);
    expect(invoicingService.postInvoice).toHaveBeenCalledTimes(2);
    expect(result.succeeded).toHaveLength(1);
    expect(result.succeeded[0].invoiceIds).toHaveLength(2);
    const dueDatesUsed = invoicingService.generateInvoice.mock.calls
      .map(([, input]: [unknown, { dueDate: string }]) => input.dueDate)
      .sort();
    expect(dueDatesUsed).toEqual(["2026-08-01", "2026-09-01"]);
  });

  it("one student's failure (no applicable structure) is recorded without aborting the batch — a real per-student-own-transaction proof", async () => {
    feeStructuresService.findApplicableFor.mockImplementation(async (studentId: string) =>
      studentId === "s2" ? null : { id: "structure-1" },
    );

    const result = await service.bulkGenerate(
      { termId: "term-1", classId: "class-1", feeCategoryIds: ["cat-1"], studentIds: ["s1", "s2", "s3"] },
      "initiator-1",
    );

    expect(result.succeeded.map((r) => r.studentId).sort()).toEqual(["s1", "s3"]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].studentId).toBe("s2");
    expect(result.failed[0].error).toMatch(/BR-BILL-02/);
    // s1/s3 still fully succeeded despite s2's failure — the batch was never aborted.
    expect(invoicingService.generateInvoice).toHaveBeenCalledTimes(2);
  });

  it("a student whose applicable structure has zero lines matching any selected category lands in failed[], no invoice attempted", async () => {
    feeStructureLineRepository.listByStructureAndTerm.mockResolvedValue([makeLine({ feeCategoryId: "cat-OTHER" })]);

    const result = await service.bulkGenerate(
      { termId: "term-1", classId: "class-1", feeCategoryIds: ["cat-1"], studentIds: ["s1"] },
      "initiator-1",
    );

    expect(result.succeeded).toEqual([]);
    expect(result.failed).toEqual([
      { studentId: "s1", error: expect.stringContaining("None of the selected fee categories") },
    ]);
    expect(invoicingService.generateInvoice).not.toHaveBeenCalled();
  });

  it("a postInvoice() failure on one due-date group aborts the remaining groups for that student (one transaction per student, not per group)", async () => {
    feeStructureLineRepository.listByStructureAndTerm.mockResolvedValue([
      makeLine({ id: "line-1", feeCategoryId: "cat-1", dueDate: "2026-08-01" }),
      makeLine({ id: "line-2", feeCategoryId: "cat-2", dueDate: "2026-09-01" }),
    ]);
    invoicingService.postInvoice.mockRejectedValueOnce(new Error("no active postable AR_STUDENT account"));

    const result = await service.bulkGenerate(
      { termId: "term-1", classId: "class-1", feeCategoryIds: ["cat-1", "cat-2"], studentIds: ["s1"] },
      "initiator-1",
    );

    expect(result.succeeded).toEqual([]);
    expect(result.failed).toEqual([{ studentId: "s1", error: "no active postable AR_STUDENT account" }]);
  });

  describe("past-due-date lines preserve their real due date (Slice 10, corrected)", () => {
    it("a single matched line with a past due date generates successfully with its REAL past due date, not failed[] and not clamped", async () => {
      feeStructureLineRepository.listByStructureAndTerm.mockResolvedValue([
        makeLine({ id: "line-1", feeCategoryId: "cat-1", dueDate: "2026-06-01" }),
      ]);

      const result = await service.bulkGenerate(
        { termId: "term-1", classId: "class-1", feeCategoryIds: ["cat-1"], studentIds: ["s1"] },
        "initiator-1",
      );

      expect(result.failed).toEqual([]);
      expect(result.succeeded).toEqual([{ studentId: "s1", invoiceIds: ["invoice-s1-2026-06-01"] }]);
      expect(invoicingService.generateInvoice).toHaveBeenCalledTimes(1);
      expect(invoicingService.generateInvoice).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ studentId: "s1", dueDate: "2026-06-01" }),
      );
    });

    it("two matched lines that share the exact same real due date still collapse into ONE invoice, even when that shared date is in the past", async () => {
      feeStructureLineRepository.listByStructureAndTerm.mockResolvedValue([
        makeLine({ id: "line-1", feeCategoryId: "cat-1", dueDate: "2026-06-01" }),
        makeLine({ id: "line-2", feeCategoryId: "cat-2", dueDate: "2026-06-01" }),
      ]);

      const result = await service.bulkGenerate(
        { termId: "term-1", classId: "class-1", feeCategoryIds: ["cat-1", "cat-2"], studentIds: ["s1"] },
        "initiator-1",
      );

      expect(result.failed).toEqual([]);
      expect(result.succeeded).toEqual([{ studentId: "s1", invoiceIds: ["invoice-s1-2026-06-01"] }]);
      expect(invoicingService.generateInvoice).toHaveBeenCalledTimes(1);
      expect(invoicingService.postInvoice).toHaveBeenCalledTimes(1);
      const [, calledInput] = invoicingService.generateInvoice.mock.calls[0] as [unknown, { dueDate: string; adhocLines: Array<{ feeCategoryId: string }> }];
      expect(calledInput.dueDate).toBe("2026-06-01");
      expect(calledInput.adhocLines.map((l) => l.feeCategoryId).sort()).toEqual(["cat-1", "cat-2"]);
    });

    it("two matched lines with DIFFERENT past due dates produce TWO separate invoices, each with its own real past due date — no clamping-driven merge", async () => {
      feeStructureLineRepository.listByStructureAndTerm.mockResolvedValue([
        makeLine({ id: "line-1", feeCategoryId: "cat-1", dueDate: "2026-05-01" }),
        makeLine({ id: "line-2", feeCategoryId: "cat-2", dueDate: "2026-06-10" }),
      ]);

      const result = await service.bulkGenerate(
        { termId: "term-1", classId: "class-1", feeCategoryIds: ["cat-1", "cat-2"], studentIds: ["s1"] },
        "initiator-1",
      );

      expect(result.failed).toEqual([]);
      expect(invoicingService.generateInvoice).toHaveBeenCalledTimes(2);
      expect(invoicingService.postInvoice).toHaveBeenCalledTimes(2);
      const dueDatesUsed = invoicingService.generateInvoice.mock.calls
        .map(([, input]: [unknown, { dueDate: string }]) => input.dueDate)
        .sort();
      expect(dueDatesUsed).toEqual(["2026-05-01", "2026-06-10"]);
    });

    it("one past-due line and one genuine future-due line in the same call produce TWO separate invoices, each with its own real due date, not merged", async () => {
      feeStructureLineRepository.listByStructureAndTerm.mockResolvedValue([
        makeLine({ id: "line-1", feeCategoryId: "cat-1", dueDate: "2026-06-01" }),
        makeLine({ id: "line-2", feeCategoryId: "cat-2", dueDate: "2026-09-01" }),
      ]);

      const result = await service.bulkGenerate(
        { termId: "term-1", classId: "class-1", feeCategoryIds: ["cat-1", "cat-2"], studentIds: ["s1"] },
        "initiator-1",
      );

      expect(result.failed).toEqual([]);
      expect(invoicingService.generateInvoice).toHaveBeenCalledTimes(2);
      expect(invoicingService.postInvoice).toHaveBeenCalledTimes(2);
      const dueDatesUsed = invoicingService.generateInvoice.mock.calls
        .map(([, input]: [unknown, { dueDate: string }]) => input.dueDate)
        .sort();
      expect(dueDatesUsed).toEqual(["2026-06-01", "2026-09-01"]);
      expect(result.succeeded[0].invoiceIds.slice().sort()).toEqual(
        ["invoice-s1-2026-06-01", "invoice-s1-2026-09-01"].sort(),
      );
    });
  });

  describe("duplicate fee-category-per-term guard (Phase 6 Slice 12, Part C)", () => {
    it("FULL skip — every selected category already billed this term lands in skipped[], zero invoices generated", async () => {
      feeStructureLineRepository.listByStructureAndTerm.mockResolvedValue([makeLine({ feeCategoryId: "cat-1" })]);
      billInvoiceLineRepository.listAlreadyBilledCategoryIds.mockResolvedValue(new Set(["cat-1"]));

      const result = await service.bulkGenerate(
        { termId: "term-1", classId: "class-1", feeCategoryIds: ["cat-1"], studentIds: ["s1"] },
        "initiator-1",
      );

      expect(result.succeeded).toEqual([]);
      expect(result.failed).toEqual([]);
      expect(result.skipped).toEqual([{ studentId: "s1", alreadyBilledCategoryIds: ["cat-1"] }]);
      expect(invoicingService.generateInvoice).not.toHaveBeenCalled();
      expect(invoicingService.postInvoice).not.toHaveBeenCalled();
      // The guard is checked against the MATCHED categories (cat-1), not the raw structure/term args —
      // confirms the repository call itself is wired with the right scoping.
      expect(billInvoiceLineRepository.listAlreadyBilledCategoryIds).toHaveBeenCalledWith(
        "s1",
        "term-1",
        ["cat-1"],
        expect.anything(),
      );
    });

    it("PARTIAL skip — some selected categories already billed still generates a real invoice for the rest, surfacing alreadyBilledCategoryIds on the success entry", async () => {
      feeStructureLineRepository.listByStructureAndTerm.mockResolvedValue([
        makeLine({ id: "line-1", feeCategoryId: "cat-1", dueDate: "2026-08-01" }),
        makeLine({ id: "line-2", feeCategoryId: "cat-2", dueDate: "2026-08-01" }),
      ]);
      billInvoiceLineRepository.listAlreadyBilledCategoryIds.mockResolvedValue(new Set(["cat-1"]));

      const result = await service.bulkGenerate(
        { termId: "term-1", classId: "class-1", feeCategoryIds: ["cat-1", "cat-2"], studentIds: ["s1"] },
        "initiator-1",
      );

      expect(result.failed).toEqual([]);
      expect(result.skipped).toEqual([]);
      expect(result.succeeded).toEqual([
        { studentId: "s1", invoiceIds: ["invoice-s1-2026-08-01"], alreadyBilledCategoryIds: ["cat-1"] },
      ]);
      // Only the still-billable category (cat-2) is actually sent to generateInvoice — cat-1 is excluded.
      expect(invoicingService.generateInvoice).toHaveBeenCalledTimes(1);
      expect(invoicingService.generateInvoice).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ adhocLines: [{ feeCategoryId: "cat-2", description: "Category cat-2", amount: expect.anything() }] }),
      );
      expect(invoicingService.postInvoice).toHaveBeenCalledTimes(1);
    });

    it("regression — a genuinely NEW category for a student already invoiced for OTHER categories this term still generates normally, with no alreadyBilledCategoryIds on the success entry", async () => {
      feeStructureLineRepository.listByStructureAndTerm.mockResolvedValue([makeLine({ feeCategoryId: "cat-NEW" })]);
      // The repository is only ever asked about "cat-NEW" (the selected/matched category) and correctly
      // reports nothing already billed for it — even though this student may well have OTHER, unrelated
      // categories already billed this term (never selected here, so never even queried).
      billInvoiceLineRepository.listAlreadyBilledCategoryIds.mockResolvedValue(new Set<string>());

      const result = await service.bulkGenerate(
        { termId: "term-1", classId: "class-1", feeCategoryIds: ["cat-NEW"], studentIds: ["s1"] },
        "initiator-1",
      );

      expect(result.failed).toEqual([]);
      expect(result.skipped).toEqual([]);
      expect(result.succeeded).toEqual([{ studentId: "s1", invoiceIds: ["invoice-s1-2026-08-01"] }]);
      expect(result.succeeded[0]).not.toHaveProperty("alreadyBilledCategoryIds");
      expect(invoicingService.generateInvoice).toHaveBeenCalledTimes(1);
    });

    it("one student fully skipped and another genuinely succeeding in the same batch are both correctly routed — the batch is never aborted by a skip", async () => {
      feeStructureLineRepository.listByStructureAndTerm.mockResolvedValue([makeLine({ feeCategoryId: "cat-1" })]);
      billInvoiceLineRepository.listAlreadyBilledCategoryIds.mockImplementation(
        async (studentId: string) => (studentId === "s1" ? new Set(["cat-1"]) : new Set<string>()),
      );

      const result = await service.bulkGenerate(
        { termId: "term-1", classId: "class-1", feeCategoryIds: ["cat-1"], studentIds: ["s1", "s2"] },
        "initiator-1",
      );

      expect(result.skipped).toEqual([{ studentId: "s1", alreadyBilledCategoryIds: ["cat-1"] }]);
      expect(result.succeeded).toEqual([{ studentId: "s2", invoiceIds: ["invoice-s2-2026-08-01"] }]);
      expect(result.failed).toEqual([]);
      expect(invoicingService.generateInvoice).toHaveBeenCalledTimes(1);
    });
  });
});
