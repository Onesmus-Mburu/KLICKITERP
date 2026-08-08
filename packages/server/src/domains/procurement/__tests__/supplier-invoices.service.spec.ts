import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { GlAccountEntity } from "../../../accounting";
import { PURCHASE_PRICE_VARIANCE_ACCOUNT_CODE } from "../application/gl-ap-accounts.util";
import { GRN_ACCRUAL_ACCOUNT_CODE } from "../application/gl-grn-accounts.util";
import { SupplierInvoicesService } from "../application/supplier-invoices.service";
import { ProcGrnEntity } from "../domain/proc-grn.entity";
import { ProcGrnLineEntity } from "../domain/proc-grn-line.entity";
import { ProcPoLineEntity } from "../domain/proc-po-line.entity";
import { ProcPurchaseOrderEntity } from "../domain/proc-purchase-order.entity";
import { ProcSupplierInvoiceEntity } from "../domain/proc-supplier-invoice.entity";
import { ProcSupplierEntity } from "../domain/proc-supplier.entity";

function makeInvoice(overrides: Partial<ProcSupplierInvoiceEntity>): ProcSupplierInvoiceEntity {
  return {
    id: "inv-1",
    number: "SINV-000001",
    supplierRef: "SUP-REF-1",
    supplierId: "supplier-1",
    poId: "po-1",
    invoiceDate: "2026-07-01",
    dueDate: "2026-07-31",
    total: Money.fromInt(1000),
    status: "UNMATCHED",
    matchVariance: null,
    approvalRef: null,
    journalId: null,
    paidAmount: Money.ZERO,
    ...overrides,
  } as ProcSupplierInvoiceEntity;
}

function makeSupplier(overrides: Partial<ProcSupplierEntity> = {}): ProcSupplierEntity {
  return { id: "supplier-1", name: "Acme", status: "ACTIVE", ...overrides } as ProcSupplierEntity;
}

function makePo(overrides: Partial<ProcPurchaseOrderEntity> = {}): ProcPurchaseOrderEntity {
  return { id: "po-1", number: "PO-000001", status: "ISSUED", ...overrides } as ProcPurchaseOrderEntity;
}

function makePoLine(overrides: Partial<ProcPoLineEntity>): ProcPoLineEntity {
  return {
    id: "poline-1",
    poId: "po-1",
    lineNo: 1,
    itemId: null,
    description: "Item A",
    qty: "10.0000",
    unitPrice: Money.fromInt(100),
    receivedQty: "10.0000",
    ...overrides,
  } as ProcPoLineEntity;
}

function makeGrnLine(overrides: Partial<ProcGrnLineEntity>): ProcGrnLineEntity {
  return {
    id: "grnline-1",
    grnId: "grn-1",
    poLineId: "poline-1",
    receivedQty: "10.0000",
    rejectedQty: "0.0000",
    rejectionReason: null,
    unitCost: Money.fromInt(100),
    ...overrides,
  } as ProcGrnLineEntity;
}

function makeGrn(overrides: Partial<ProcGrnEntity>): ProcGrnEntity {
  return { id: "grn-1", number: "GRN-000001", poId: "po-1", status: "POSTED", ...overrides } as ProcGrnEntity;
}

function makeAccount(overrides: Partial<GlAccountEntity>): GlAccountEntity {
  return { id: "acc-1", code: "9999", isActive: true, isPostable: true, ...overrides } as GlAccountEntity;
}

describe("SupplierInvoicesService", () => {
  let invoiceRepository: { findByIdOrFail: jest.Mock; create: jest.Mock; save: jest.Mock; list: jest.Mock };
  let supplierRepository: { findByIdOrFail: jest.Mock };
  let poRepository: { findByIdOrFail: jest.Mock };
  let poLineRepository: { findByPoId: jest.Mock };
  let grnRepository: { findByIdOrFail: jest.Mock };
  let grnLineRepository: { findByPoLineId: jest.Mock };
  let glAccountRepository: { findByControlDomain: jest.Mock; findByCode: jest.Mock };
  let postingService: { post: jest.Mock };
  let numberingService: { allocate: jest.Mock };
  let settingsService: { getTyped: jest.Mock };
  let service: SupplierInvoicesService;

  const em = {} as EntityManager;

  beforeEach(() => {
    invoiceRepository = {
      findByIdOrFail: jest.fn(async () => makeInvoice({})),
      create: jest.fn(async (data) => makeInvoice(data)),
      save: jest.fn(async (e) => e),
      list: jest.fn(async () => []),
    };
    supplierRepository = { findByIdOrFail: jest.fn(async () => makeSupplier()) };
    poRepository = { findByIdOrFail: jest.fn(async () => makePo()) };
    poLineRepository = { findByPoId: jest.fn(async () => [makePoLine({})]) };
    grnRepository = { findByIdOrFail: jest.fn(async () => makeGrn({})) };
    grnLineRepository = { findByPoLineId: jest.fn(async () => [makeGrnLine({})]) };
    glAccountRepository = {
      findByControlDomain: jest.fn(async () => [makeAccount({ id: "ap-acc", code: "2010" })]),
      findByCode: jest.fn(async (code: string) => {
        if (code === GRN_ACCRUAL_ACCOUNT_CODE) return makeAccount({ id: "grn-accrual-acc", code });
        if (code === PURCHASE_PRICE_VARIANCE_ACCOUNT_CODE) return makeAccount({ id: "variance-acc", code });
        return null;
      }),
    };
    postingService = { post: jest.fn(async () => ({ id: "journal-1", lines: [] })) };
    numberingService = { allocate: jest.fn(async () => "SINV-000001") };
    settingsService = { getTyped: jest.fn(async (_key: string, def: number) => def) };

    service = new SupplierInvoicesService(
      invoiceRepository as never,
      supplierRepository as never,
      poRepository as never,
      poLineRepository as never,
      grnRepository as never,
      grnLineRepository as never,
      glAccountRepository as never,
      postingService as never,
      numberingService as never,
      settingsService as never,
    );
  });

  describe("capture", () => {
    it("rejects a non-positive total", async () => {
      await expect(
        service.capture(em, { supplierId: "supplier-1", supplierRef: "R1", invoiceDate: "2026-07-01", dueDate: "2026-07-31", total: Money.ZERO }, "actor-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects lines that don't sum to total", async () => {
      await expect(
        service.capture(
          em,
          {
            supplierId: "supplier-1",
            poId: "po-1",
            supplierRef: "R1",
            invoiceDate: "2026-07-01",
            dueDate: "2026-07-31",
            total: Money.fromInt(1000),
            lines: [{ poLineId: "poline-1", qty: "10", unitPrice: Money.fromInt(50) }], // sums to 500, not 1000
          },
          "actor-1",
        ),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a line poLineId not on the given PO", async () => {
      await expect(
        service.capture(
          em,
          {
            supplierId: "supplier-1",
            poId: "po-1",
            supplierRef: "R1",
            invoiceDate: "2026-07-01",
            dueDate: "2026-07-31",
            total: Money.fromInt(1000),
            lines: [{ poLineId: "some-other-line", qty: "10", unitPrice: Money.fromInt(100) }],
          },
          "actor-1",
        ),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("captures UNMATCHED with an allocated number, no persisted lines", async () => {
      const invoice = await service.capture(
        em,
        { supplierId: "supplier-1", poId: "po-1", supplierRef: "R1", invoiceDate: "2026-07-01", dueDate: "2026-07-31", total: Money.fromInt(1000) },
        "actor-1",
      );
      expect(numberingService.allocate).toHaveBeenCalledWith(em, "PROC_SUPPLIER_INVOICE");
      expect(invoice.status).toBe("UNMATCHED");
      expect(invoice.number).toBe("SINV-000001");
    });
  });

  describe("matchAgainstPo", () => {
    it("rejects a non-UNMATCHED invoice", async () => {
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ status: "MATCHED" }));
      await expect(service.matchAgainstPo(em, "inv-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects an invoice with no po_id", async () => {
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ poId: null }));
      await expect(service.matchAgainstPo(em, "inv-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("ignores GRN lines whose parent GRN is not POSTED", async () => {
      grnRepository.findByIdOrFail.mockResolvedValue(makeGrn({ status: "DRAFT" }));
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ total: Money.fromInt(1000) }));
      const result = await service.matchAgainstPo(em, "inv-1");
      // No POSTED GRN lines counted -> grnAcceptedValue=0, qty variance = full poQty -> MATCH_EXCEPTION.
      expect(result.status).toBe("MATCH_EXCEPTION");
    });

    it("within tolerance on both qty and price -> MATCHED", async () => {
      // PO qty=10, GRN accepted qty=10 (0% qty variance); invoice total=1000 == GRN value 10*100=1000 (0% price variance).
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ total: Money.fromInt(1000) }));
      const result = await service.matchAgainstPo(em, "inv-1", "actor-1");
      expect(result.status).toBe("MATCHED");
      const variance = result.matchVariance as Record<string, unknown>;
      expect(variance.withinTolerance).toBe(true);
    });

    it("qty outside tolerance (GRN under-received vs PO ordered qty) -> MATCH_EXCEPTION even if price matches", async () => {
      poLineRepository.findByPoId.mockResolvedValue([makePoLine({ qty: "10" })]);
      grnLineRepository.findByPoLineId.mockResolvedValue([makeGrnLine({ receivedQty: "5", rejectedQty: "0", unitCost: Money.fromInt(100) })]);
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ total: Money.fromInt(500) })); // exactly matches GRN value 5*100
      const result = await service.matchAgainstPo(em, "inv-1");
      expect(result.status).toBe("MATCH_EXCEPTION");
      const variance = result.matchVariance as Record<string, unknown>;
      expect(variance.qtyWithinTolerance).toBe(false);
    });

    it("price outside both percent and absolute tolerance -> MATCH_EXCEPTION", async () => {
      settingsService.getTyped.mockImplementation(async (key: string, def: number) => {
        if (key.includes("absolute")) return 5; // KES 5 absolute ceiling
        return def; // 2% default for qty/price
      });
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ total: Money.fromInt(2000) })); // GRN value is 1000, way over 2%/KES5
      const result = await service.matchAgainstPo(em, "inv-1");
      expect(result.status).toBe("MATCH_EXCEPTION");
      const variance = result.matchVariance as Record<string, unknown>;
      expect(variance.priceWithinTolerance).toBe(false);
    });

    it("price outside percent tolerance but within absolute KES tolerance -> MATCHED", async () => {
      settingsService.getTyped.mockImplementation(async (key: string, def: number) => {
        if (key.includes("absolute")) return 50; // generous absolute ceiling
        if (key.includes("price")) return 0.1; // very tight percent
        return def;
      });
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ total: Money.fromInt(1010) })); // 10 KES over GRN value of 1000 — fails 0.1% but passes KES 50
      const result = await service.matchAgainstPo(em, "inv-1");
      expect(result.status).toBe("MATCHED");
    });
  });

  describe("resolveMatchException", () => {
    it("rejects a non-MATCH_EXCEPTION invoice", async () => {
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ status: "UNMATCHED" }));
      await expect(service.resolveMatchException(em, "inv-1", "ACCEPT_VARIANCE", "ok")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects an empty note", async () => {
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ status: "MATCH_EXCEPTION" }));
      await expect(service.resolveMatchException(em, "inv-1", "ACCEPT_VARIANCE", "  ")).rejects.toBeInstanceOf(ValidationException);
    });

    it("ACCEPT_VARIANCE -> MATCHED", async () => {
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ status: "MATCH_EXCEPTION", matchVariance: { grnAcceptedValue: "900.0000" } }));
      const result = await service.resolveMatchException(em, "inv-1", "ACCEPT_VARIANCE", "manually approved", "actor-1");
      expect(result.status).toBe("MATCHED");
    });

    it("REJECT -> UNMATCHED", async () => {
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ status: "MATCH_EXCEPTION" }));
      const result = await service.resolveMatchException(em, "inv-1", "REJECT", "needs correction", "actor-1");
      expect(result.status).toBe("UNMATCHED");
    });
  });

  describe("post", () => {
    it("rejects a non-MATCHED invoice", async () => {
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ status: "UNMATCHED" }));
      await expect(service.post(em, "inv-1", "poster-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("rejects a MATCHED invoice with no recorded grnAcceptedValue", async () => {
      invoiceRepository.findByIdOrFail.mockResolvedValue(makeInvoice({ status: "MATCHED", matchVariance: {} }));
      await expect(service.post(em, "inv-1", "poster-1")).rejects.toBeInstanceOf(ValidationException);
    });

    it("invoice > GRN: debits GRN accrual + debits price variance, credits AP for the full invoice total", async () => {
      invoiceRepository.findByIdOrFail.mockResolvedValue(
        makeInvoice({ status: "MATCHED", total: Money.fromInt(1100), matchVariance: { grnAcceptedValue: "1000.0000" } }),
      );
      await service.post(em, "inv-1", "poster-1");
      expect(postingService.post).toHaveBeenCalledWith(
        em,
        expect.objectContaining({
          lines: [
            expect.objectContaining({ accountId: "grn-accrual-acc", debit: Money.fromInt(1000), credit: Money.ZERO }),
            expect.objectContaining({ accountId: "variance-acc", debit: Money.fromInt(100), credit: Money.ZERO }),
            expect.objectContaining({ accountId: "ap-acc", debit: Money.ZERO, credit: Money.fromInt(1100) }),
          ],
        }),
      );
    });

    it("invoice < GRN: debits GRN accrual + credits price variance, credits AP for the full invoice total", async () => {
      invoiceRepository.findByIdOrFail.mockResolvedValue(
        makeInvoice({ status: "MATCHED", total: Money.fromInt(900), matchVariance: { grnAcceptedValue: "1000.0000" } }),
      );
      await service.post(em, "inv-1", "poster-1");
      expect(postingService.post).toHaveBeenCalledWith(
        em,
        expect.objectContaining({
          lines: [
            expect.objectContaining({ accountId: "grn-accrual-acc", debit: Money.fromInt(1000), credit: Money.ZERO }),
            expect.objectContaining({ accountId: "variance-acc", debit: Money.ZERO, credit: Money.fromInt(100) }),
            expect.objectContaining({ accountId: "ap-acc", debit: Money.ZERO, credit: Money.fromInt(900) }),
          ],
        }),
      );
    });

    it("invoice == GRN: no variance line, credits AP for grnValue == invoice.total", async () => {
      invoiceRepository.findByIdOrFail.mockResolvedValue(
        makeInvoice({ status: "MATCHED", total: Money.fromInt(1000), matchVariance: { grnAcceptedValue: "1000.0000" } }),
      );
      await service.post(em, "inv-1", "poster-1");
      expect(postingService.post).toHaveBeenCalledWith(
        em,
        expect.objectContaining({
          lines: [
            expect.objectContaining({ accountId: "grn-accrual-acc", debit: Money.fromInt(1000), credit: Money.ZERO }),
            expect.objectContaining({ accountId: "ap-acc", debit: Money.ZERO, credit: Money.fromInt(1000) }),
          ],
        }),
      );
    });

    it("sets status=POSTED and stamps journal_id", async () => {
      invoiceRepository.findByIdOrFail.mockResolvedValue(
        makeInvoice({ status: "MATCHED", total: Money.fromInt(1000), matchVariance: { grnAcceptedValue: "1000.0000" } }),
      );
      const result = await service.post(em, "inv-1", "poster-1");
      expect(result.status).toBe("POSTED");
      expect(result.journalId).toBe("journal-1");
    });
  });
});
