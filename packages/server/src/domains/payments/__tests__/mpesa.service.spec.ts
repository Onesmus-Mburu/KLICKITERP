import { DataSource, EntityManager } from "typeorm";
import { MpesaService, MPESA_SYSTEM_ACTOR_SETTING_KEY } from "../application/mpesa.service";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { PayMpesaTransactionEntity } from "../domain/pay-mpesa-transaction.entity";
import { PaySuspenseItemEntity } from "../domain/pay-suspense-item.entity";

function makeTxn(overrides: Partial<PayMpesaTransactionEntity>): PayMpesaTransactionEntity {
  return {
    id: "txn-1",
    kind: "STK",
    shortcode: "000000",
    msisdnMasked: "*******001",
    amount: Money.fromInt(1000),
    mpesaRef: null,
    checkoutRequestId: "checkout-1",
    conversationId: null,
    billRef: null,
    state: "PENDING",
    rawRequest: { studentId: "student-1", initiatedBy: "cashier-1", accountRef: "ADM123", msisdn: "254700000001" },
    rawCallback: null,
    matchedReceiptId: null,
    walletTransactionId: null,
    ...overrides,
  } as PayMpesaTransactionEntity;
}

function makeStkCallbackPayload(overrides: {
  checkoutRequestId?: string;
  resultCode?: string;
  amount?: string;
  mpesaRef?: string;
  includeMetadata?: boolean;
} = {}): unknown {
  const {
    checkoutRequestId = "checkout-1",
    resultCode = "0",
    amount = "1000",
    mpesaRef = "NEX1234567",
    includeMetadata = true,
  } = overrides;
  return {
    Body: {
      stkCallback: {
        CheckoutRequestID: checkoutRequestId,
        MerchantRequestID: "merchant-1",
        ResultCode: resultCode,
        ResultDesc: resultCode === "0" ? "The service request is processed successfully." : "Cancelled",
        ...(includeMetadata
          ? {
              CallbackMetadata: {
                Item: [
                  { Name: "Amount", Value: amount },
                  { Name: "MpesaReceiptNumber", Value: mpesaRef },
                ],
              },
            }
          : {}),
      },
    },
  };
}

function makeC2BPayload(overrides: Partial<{ TransID: string; BillRefNumber: string; TransAmount: string; MSISDN: string }> = {}): unknown {
  return {
    TransID: "QGH1234567",
    BillRefNumber: "123",
    TransAmount: "500",
    MSISDN: "254700000002",
    TransTime: "20260715120000",
    FirstName: "Jane",
    LastName: "Doe",
    ...overrides,
  };
}

function makeB2cResultPayload(overrides: { conversationId?: string; resultCode?: string; receipt?: string } = {}): unknown {
  const { conversationId = "conv-1", resultCode = "0", receipt = "NEX9999999" } = overrides;
  return {
    Result: {
      ConversationID: conversationId,
      ResultCode: resultCode,
      ResultParameters: { ResultParameter: [{ Key: "TransactionReceipt", Value: receipt }] },
    },
  };
}

function makeSuspenseItem(overrides: Partial<PaySuspenseItemEntity>): PaySuspenseItemEntity {
  return {
    id: "suspense-1",
    source: "C2B",
    amount: Money.fromInt(500),
    externalRef: "QGH1234567",
    raw: {},
    receivedAt: new Date("2026-07-15T12:00:00Z"),
    state: "OPEN",
    resolvedReceiptId: null,
    resolvedBy: null,
    resolvedAt: null,
    resolutionNote: null,
    ...overrides,
  } as PaySuspenseItemEntity;
}

describe("MpesaService", () => {
  let mpesaTransactionRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findByCheckoutRequestId: jest.Mock;
    findByMpesaRef: jest.Mock;
    findByConversationId: jest.Mock;
    findByIdOrFail: jest.Mock;
  };
  let suspenseItemRepository: { findOpen: jest.Mock; create: jest.Mock };
  let adapterResolver: { resolve: jest.Mock };
  let receiptsService: { captureReceipt: jest.Mock };
  let studentRepository: { findByIdOrFail: jest.Mock; findByAdmissionNo: jest.Mock };
  let settingsService: { getTyped: jest.Mock };
  let dataSource: DataSource;
  let service: MpesaService;
  let port: { stkPush: jest.Mock; queryStkStatus: jest.Mock; b2cPayment: jest.Mock };

  beforeEach(() => {
    mpesaTransactionRepository = {
      create: jest.fn(async (data) => makeTxn(data)),
      save: jest.fn(async (e) => e),
      findByCheckoutRequestId: jest.fn(async () => makeTxn({ state: "PENDING" })),
      findByMpesaRef: jest.fn(async () => null),
      findByConversationId: jest.fn(async () => makeTxn({ kind: "B2C", conversationId: "conv-1", checkoutRequestId: null })),
      findByIdOrFail: jest.fn(async () => makeTxn({})),
    };
    suspenseItemRepository = { findOpen: jest.fn(async () => []), create: jest.fn(async (data) => makeSuspenseItem(data)) };
    port = {
      stkPush: jest.fn(async () => ({ checkoutRequestId: "checkout-new", merchantRequestId: "merchant-new" })),
      queryStkStatus: jest.fn(async () => ({ resultCode: "0", resultDesc: "ok" })),
      b2cPayment: jest.fn(async () => ({ conversationId: "conv-new", originatorConversationId: "orig-new" })),
    };
    adapterResolver = { resolve: jest.fn(async () => port) };
    receiptsService = { captureReceipt: jest.fn(async () => ({ id: "receipt-1", number: "PAY-000001" })) };
    studentRepository = {
      findByIdOrFail: jest.fn(async () => ({ id: "student-1", firstName: "John", lastName: "Doe" })),
      findByAdmissionNo: jest.fn(async () => null),
    };
    settingsService = {
      getTyped: jest.fn(async (key: string, defaultValue: unknown) => {
        if (key === MPESA_SYSTEM_ACTOR_SETTING_KEY) return "system-actor-1";
        return defaultValue;
      }),
    };
    dataSource = {
      transaction: jest.fn(async (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager),
      ),
    } as unknown as DataSource;

    service = new MpesaService(
      mpesaTransactionRepository as never,
      suspenseItemRepository as never,
      adapterResolver as never,
      receiptsService as never,
      studentRepository as never,
      settingsService as never,
      dataSource,
    );
  });

  describe("initiateStk", () => {
    it("rejects a non-positive amount", async () => {
      await expect(
        service.initiateStk({} as EntityManager, { studentId: "student-1", amountKes: Money.ZERO, msisdn: "254700000001", accountRef: "ADM1" }, "cashier-1"),
      ).rejects.toBeInstanceOf(ValidationException);
    });

    it("creates INITIATED then transitions to PENDING with the adapter's checkoutRequestId", async () => {
      const txn = await service.initiateStk(
        {} as EntityManager,
        { studentId: "student-1", amountKes: Money.fromInt(1000), msisdn: "254700000001", accountRef: "ADM1" },
        "cashier-1",
      );
      expect(port.stkPush).toHaveBeenCalledWith(
        expect.objectContaining({ amountKes: Money.fromInt(1000), msisdn: "254700000001", accountRef: "ADM1" }),
      );
      expect(txn.state).toBe("PENDING");
      expect(txn.checkoutRequestId).toBe("checkout-new");
      expect(mpesaTransactionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "STK", state: "INITIATED" }),
        expect.anything(),
      );
    });

    it("Phase 6 Slice 9 (Part A): stores invoiceIds on rawRequest when provided", async () => {
      await service.initiateStk(
        {} as EntityManager,
        {
          studentId: "student-1",
          amountKes: Money.fromInt(1000),
          msisdn: "254700000001",
          accountRef: "ADM1",
          invoiceIds: ["invoice-a", "invoice-b"],
        },
        "cashier-1",
      );
      expect(mpesaTransactionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          rawRequest: expect.objectContaining({ invoiceIds: ["invoice-a", "invoice-b"] }),
        }),
        expect.anything(),
      );
    });

    it("Phase 6 Slice 9 (Part A): omitting invoiceIds leaves rawRequest.invoiceIds undefined (unscoped, byte-for-byte prior behavior)", async () => {
      await service.initiateStk(
        {} as EntityManager,
        { studentId: "student-1", amountKes: Money.fromInt(1000), msisdn: "254700000001", accountRef: "ADM1" },
        "cashier-1",
      );
      expect(mpesaTransactionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          rawRequest: expect.objectContaining({ invoiceIds: undefined }),
        }),
        expect.anything(),
      );
    });
  });

  describe("handleStkCallback — BR-PAY-06 idempotent replay", () => {
    it("throws NotFoundException when no transaction matches checkoutRequestId", async () => {
      mpesaTransactionRepository.findByCheckoutRequestId.mockResolvedValueOnce(null);
      await expect(service.handleStkCallback(makeStkCallbackPayload())).rejects.toBeInstanceOf(NotFoundException);
    });

    it("acknowledges a callback for an already-CONFIRMED transaction with no second effect", async () => {
      mpesaTransactionRepository.findByCheckoutRequestId.mockResolvedValueOnce(makeTxn({ state: "CONFIRMED" }));
      const result = await service.handleStkCallback(makeStkCallbackPayload());
      expect(result.resultCode).toBe("0");
      expect(receiptsService.captureReceipt).not.toHaveBeenCalled();
    });

    it("marks FAILED when Daraja's ResultCode is non-zero, without capturing a receipt", async () => {
      mpesaTransactionRepository.findByCheckoutRequestId.mockResolvedValueOnce(makeTxn({ state: "PENDING" }));
      const result = await service.handleStkCallback(makeStkCallbackPayload({ resultCode: "1032" }));
      expect(result.resultCode).toBe("0");
      expect(receiptsService.captureReceipt).not.toHaveBeenCalled();
      expect(mpesaTransactionRepository.save).toHaveBeenCalledWith(expect.objectContaining({ state: "FAILED" }), expect.anything());
    });

    it("on a genuine first success, captures ONE MPESA_STK receipt and marks CONFIRMED", async () => {
      mpesaTransactionRepository.findByCheckoutRequestId.mockResolvedValueOnce(makeTxn({ state: "PENDING", checkoutRequestId: "checkout-1" }));
      const result = await service.handleStkCallback(makeStkCallbackPayload({ amount: "1000", mpesaRef: "NEX1234567" }));

      expect(result.resultCode).toBe("0");
      expect(receiptsService.captureReceipt).toHaveBeenCalledTimes(1);
      const captureInput = receiptsService.captureReceipt.mock.calls[0][1];
      expect(captureInput.studentId).toBe("student-1");
      expect(captureInput.splits).toEqual([
        expect.objectContaining({ method: "MPESA_STK", amount: Money.fromInt(1000), externalRef: "NEX1234567" }),
      ]);
      expect(captureInput.idempotencyKey).toBe("mpesa-stk-checkout-1");

      expect(mpesaTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ state: "CONFIRMED", mpesaRef: "NEX1234567", matchedReceiptId: "receipt-1" }),
        expect.anything(),
      );
    });

    it("Phase 6 Slice 9 (Part A): forwards rawRequest.invoiceIds to captureReceipt() when present", async () => {
      mpesaTransactionRepository.findByCheckoutRequestId.mockResolvedValueOnce(
        makeTxn({
          state: "PENDING",
          checkoutRequestId: "checkout-1",
          rawRequest: {
            studentId: "student-1",
            initiatedBy: "cashier-1",
            accountRef: "ADM123",
            msisdn: "254700000001",
            invoiceIds: ["invoice-a", "invoice-b"],
          },
        }),
      );
      await service.handleStkCallback(makeStkCallbackPayload());
      const captureInput = receiptsService.captureReceipt.mock.calls[0][1];
      expect(captureInput.invoiceIds).toEqual(["invoice-a", "invoice-b"]);
    });

    it("Phase 6 Slice 9 (Part A) regression guard: forwards undefined to captureReceipt() when rawRequest carries no invoiceIds (byte-for-byte prior STK behavior)", async () => {
      mpesaTransactionRepository.findByCheckoutRequestId.mockResolvedValueOnce(
        makeTxn({
          state: "PENDING",
          checkoutRequestId: "checkout-1",
          rawRequest: { studentId: "student-1", initiatedBy: "cashier-1", accountRef: "ADM123", msisdn: "254700000001" },
        }),
      );
      await service.handleStkCallback(makeStkCallbackPayload());
      const captureInput = receiptsService.captureReceipt.mock.calls[0][1];
      expect(captureInput.invoiceIds).toBeUndefined();
    });

    it("BR-PAY-06: rejects when the mpesa_ref is already CONFIRMED on a different transaction", async () => {
      mpesaTransactionRepository.findByCheckoutRequestId.mockResolvedValueOnce(makeTxn({ id: "txn-1", state: "PENDING" }));
      mpesaTransactionRepository.findByMpesaRef.mockResolvedValueOnce(makeTxn({ id: "txn-other", state: "CONFIRMED" }));
      await expect(service.handleStkCallback(makeStkCallbackPayload())).rejects.toBeInstanceOf(ConflictException);
      expect(receiptsService.captureReceipt).not.toHaveBeenCalled();
    });

    it("rejects a malformed payload before touching the database", async () => {
      await expect(service.handleStkCallback({ Body: {} })).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("handleC2BValidation", () => {
    it("accepts a well-formed payload without reaching for the database", async () => {
      const result = await service.handleC2BValidation(makeC2BPayload());
      expect(result.resultCode).toBe("0");
    });

    it("rejects a malformed payload", async () => {
      await expect(service.handleC2BValidation({})).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("handleC2BConfirmation — regex-match-vs-suspense-fallback branching", () => {
    it("auto-matches on an exact admission-number BillRefNumber and captures an MPESA_C2B receipt", async () => {
      // resolveAdmissionNo() checks existence via one findByAdmissionNo() call, then
      // handleC2BConfirmation() re-fetches the student via a second call — mockResolvedValue
      // (not -Once) satisfies both.
      studentRepository.findByAdmissionNo.mockResolvedValue({ id: "student-9", firstName: "Amina", lastName: "Otieno" });

      const result = await service.handleC2BConfirmation(makeC2BPayload({ BillRefNumber: "123", TransAmount: "500" }));

      expect(result.resultDesc).toMatch(/auto-matched/i);
      expect(receiptsService.captureReceipt).toHaveBeenCalledTimes(1);
      const captureInput = receiptsService.captureReceipt.mock.calls[0][1];
      expect(captureInput.studentId).toBe("student-9");
      expect(captureInput.splits).toEqual([expect.objectContaining({ method: "MPESA_C2B", amount: Money.fromInt(500) })]);
      expect(captureInput.cashierId).toBe("system-actor-1");
      expect(suspenseItemRepository.create).not.toHaveBeenCalled();
    });

    it("falls back to suspense (BR-PAY-07) when no admission number resolves", async () => {
      studentRepository.findByAdmissionNo.mockResolvedValue(null);

      const result = await service.handleC2BConfirmation(makeC2BPayload({ BillRefNumber: "does-not-exist" }));

      expect(result.resultDesc).toMatch(/suspense/i);
      expect(receiptsService.captureReceipt).not.toHaveBeenCalled();
      expect(suspenseItemRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ source: "C2B", amount: Money.fromInt(500) }),
        expect.anything(),
      );
    });

    it("acknowledges an already-parked C2B confirmation with no second suspense item", async () => {
      suspenseItemRepository.findOpen.mockResolvedValueOnce([makeSuspenseItem({ externalRef: "QGH1234567" })]);

      const result = await service.handleC2BConfirmation(makeC2BPayload({ TransID: "QGH1234567" }));

      expect(result.resultDesc).toMatch(/already parked/i);
      expect(suspenseItemRepository.create).not.toHaveBeenCalled();
      expect(receiptsService.captureReceipt).not.toHaveBeenCalled();
    });

    it("throws when a student matches but no MPESA_SYSTEM_ACTOR_SETTING_KEY is configured", async () => {
      studentRepository.findByAdmissionNo.mockResolvedValue({ id: "student-9", firstName: "Amina", lastName: "Otieno" });
      settingsService.getTyped.mockImplementation(async (key: string, defaultValue: unknown) => (key === MPESA_SYSTEM_ACTOR_SETTING_KEY ? null : defaultValue));

      await expect(service.handleC2BConfirmation(makeC2BPayload({ BillRefNumber: "123" }))).rejects.toBeInstanceOf(ValidationException);
    });
  });

  describe("handleB2cResult", () => {
    it("throws NotFoundException when no transaction matches conversationId", async () => {
      mpesaTransactionRepository.findByConversationId.mockResolvedValueOnce(null);
      await expect(service.handleB2cResult(makeB2cResultPayload())).rejects.toBeInstanceOf(NotFoundException);
    });

    it("is a no-op for an already-terminal transaction", async () => {
      mpesaTransactionRepository.findByConversationId.mockResolvedValueOnce(makeTxn({ kind: "B2C", state: "CONFIRMED" }));
      await service.handleB2cResult(makeB2cResultPayload());
      expect(mpesaTransactionRepository.save).not.toHaveBeenCalled();
    });

    it("marks CONFIRMED and records the transaction receipt on ResultCode '0'", async () => {
      mpesaTransactionRepository.findByConversationId.mockResolvedValueOnce(makeTxn({ kind: "B2C", state: "PENDING", checkoutRequestId: null }));
      await service.handleB2cResult(makeB2cResultPayload({ resultCode: "0", receipt: "NEX9999999" }));
      expect(mpesaTransactionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ state: "CONFIRMED", mpesaRef: "NEX9999999" }),
        expect.anything(),
      );
    });

    it("marks FAILED on a non-zero ResultCode", async () => {
      mpesaTransactionRepository.findByConversationId.mockResolvedValueOnce(makeTxn({ kind: "B2C", state: "PENDING", checkoutRequestId: null }));
      await service.handleB2cResult(makeB2cResultPayload({ resultCode: "1" }));
      expect(mpesaTransactionRepository.save).toHaveBeenCalledWith(expect.objectContaining({ state: "FAILED" }), expect.anything());
    });
  });
});
