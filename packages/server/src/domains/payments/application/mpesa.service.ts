import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { SettingsService } from "../../../platform/settings";
// Barrel import of an application-layer repository — same precedent
// `ReceiptsService`/`AllocationService` already use for `domains/students`'
// barrel (see those files' own import comments).
import { StdStudentRepository } from "../../students";
import { PayMpesaTransactionEntity, PayMpesaTransactionState } from "../domain/pay-mpesa-transaction.entity";
import { PayMpesaTransactionRepository } from "../infrastructure/pay-mpesa-transaction.repository";
import { PaySuspenseItemRepository } from "../infrastructure/pay-suspense-item.repository";
import { MpesaAdapterResolverService } from "../infrastructure/mpesa-adapter-resolver.service";
import { ReceiptsService } from "./receipts.service";

/** `set_setting.key` this service reads for the informational `pay_mpesa_transaction.shortcode` column. Not used for any GL/control-account logic. */
export const MPESA_SHORTCODE_SETTING_KEY = "payments.mpesa_shortcode";
const DEFAULT_MPESA_SHORTCODE = "000000";

/**
 * FR-PAY-009.1 — configurable regex list Settings carries for extracting an
 * admission number out of a C2B `BillRefNumber`. Each pattern is tried in
 * order; a pattern with a capture group uses group 1 as the candidate
 * admission number, otherwise the whole match is used. Sensible digits-only
 * default (a school admission number is almost always numeric, possibly with
 * a short alpha prefix like `ADM1234`).
 */
export const C2B_BILL_REF_PATTERNS_SETTING_KEY = "payments.c2b_bill_ref_patterns";
const DEFAULT_C2B_BILL_REF_PATTERNS: readonly string[] = ["^(\\d{3,10})$", "(\\d{3,10})"];

/**
 * FR-PAY-009.1 — no real actor initiates a C2B confirmation (it is a fully
 * inbound Safaricom callback), yet `pay_receipt.cashier_id` is NOT NULL. A
 * Settings-configured "system actor" `usr_user.id` (e.g. a seeded
 * "M-Pesa System" service account) stands in as the capturing cashier for
 * auto-matched C2B receipts — same documented-gap shape as
 * `payments.session_variance_tolerance`/`billing.allocation_default_rule`:
 * this key MUST be configured before C2B auto-capture can succeed; a clear
 * `ValidationException` is thrown otherwise rather than silently using a
 * fabricated id.
 */
export const MPESA_SYSTEM_ACTOR_SETTING_KEY = "payments.mpesa_system_actor_user_id";

export interface InitiateStkInput {
  studentId: string;
  amountKes: Money;
  msisdn: string;
  accountRef: string;
  /**
   * Phase 6 Slice 9 (Part A) — "Collect Fees" directed STK push. When
   * present and non-empty, threaded onto `rawRequest.invoiceIds` and, on a
   * successful callback, forwarded straight to
   * `ReceiptsService.captureReceipt()`'s own `invoiceIds` (the exact same
   * optional field Slice 8 Part 3 added for the plain cashier-capture path
   * — this is just a new caller of it, no new allocation logic). When
   * absent, `handleStkCallback()` forwards `undefined` and the resulting
   * receipt auto-FIFOs across every open invoice, byte-for-byte the same as
   * every STK payment before this field existed.
   */
  invoiceIds?: string[];
}

export interface InitiateB2cInput {
  amountKes: Money;
  msisdn: string;
  remarks: string;
  originatingReason?: string;
}

interface StkRawRequest {
  studentId: string;
  initiatedBy: string;
  accountRef: string;
  msisdn: string;
  /** See `InitiateStkInput.invoiceIds`'s own doc comment. */
  invoiceIds?: string[];
}

interface B2cRawRequest {
  initiatedBy: string;
  remarks: string;
  originatingReason: string | null;
  msisdn: string;
}

/** `PAY_MPESA_TRANSACTION_OPEN_STATES` (`INITIATED`/`PENDING`) — terminal states a late/duplicate callback should be acknowledged against without reprocessing. */
const TERMINAL_STATES: readonly PayMpesaTransactionState[] = ["CONFIRMED", "FAILED", "TIMEOUT", "REVERSED"];

/**
 * M-Pesa STK/C2B/B2C mechanics (Module 10 PASS B, FR-PAY-008.1/FR-PAY-009.1,
 * docs/phase-3/02-communication-authentication.md §2.5). Every callback
 * handler validates the payload's shape strictly before touching the
 * database (§2.5 "payload schema validation... raw persist before
 * processing" — `raw_callback`/`raw` are always written verbatim alongside
 * the parsed fields) and opens its OWN transaction (`runInTransaction`) —
 * these are standalone, Safaricom-triggered top-level actions, the same
 * shape `CashierSessionsService.openSession()`/`.closeSession()` use.
 * `initiateStk()`/`initiateB2c()` instead take the CALLER's own
 * `EntityManager` (composable, per the task's explicit signature) since a
 * real caller (e.g. a future receipts-controller convenience endpoint) may
 * want to compose the initiation with other writes in one transaction.
 *
 * **Deferred, no infrastructure exists yet** (documented, not silently
 * skipped): WebSocket cashier notification on STK success (FR-PAY-008.1);
 * automatic 90s-timeout + 2-minute status-query-fallback scheduling
 * (`queryPendingStatus()` is fully callable, just never auto-triggered — no
 * scheduler/worker exists anywhere in this codebase, the same "engine
 * exists, dispatcher doesn't" gap every other module documents); a daily
 * suspense digest via `NotificationsService` (no scheduler either).
 */
@Injectable()
export class MpesaService {
  constructor(
    private readonly mpesaTransactionRepository: PayMpesaTransactionRepository,
    private readonly suspenseItemRepository: PaySuspenseItemRepository,
    private readonly adapterResolver: MpesaAdapterResolverService,
    private readonly receiptsService: ReceiptsService,
    private readonly studentRepository: StdStudentRepository,
    private readonly settingsService: SettingsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // ---- STK ----

  async initiateStk(em: EntityManager, input: InitiateStkInput, initiatedBy: string): Promise<PayMpesaTransactionEntity> {
    if (!input.amountKes.isPositive()) {
      throw new ValidationException("MpesaService.initiateStk: amountKes must be positive");
    }
    await this.studentRepository.findByIdOrFail(input.studentId, em);

    const rawRequest: StkRawRequest = {
      studentId: input.studentId,
      initiatedBy,
      accountRef: input.accountRef,
      msisdn: input.msisdn,
      invoiceIds: input.invoiceIds && input.invoiceIds.length > 0 ? input.invoiceIds : undefined,
    };
    const shortcode = await this.resolveShortcode();

    let txn = await this.mpesaTransactionRepository.create(
      {
        kind: "STK",
        shortcode,
        msisdnMasked: maskMsisdn(input.msisdn),
        amount: input.amountKes,
        mpesaRef: null,
        checkoutRequestId: null,
        conversationId: null,
        billRef: null,
        state: "INITIATED",
        rawRequest: rawRequest as unknown as Record<string, unknown>,
        rawCallback: null,
        matchedReceiptId: null,
        walletTransactionId: null,
        createdBy: initiatedBy,
        updatedBy: initiatedBy,
      },
      em,
    );

    const port = await this.adapterResolver.resolve();
    const result = await port.stkPush({
      amountKes: input.amountKes,
      msisdn: input.msisdn,
      accountRef: input.accountRef,
    });

    txn.checkoutRequestId = result.checkoutRequestId;
    txn.state = "PENDING";
    txn.updatedBy = initiatedBy;
    txn = await this.mpesaTransactionRepository.save(txn, em);
    return txn;
  }

  /**
   * BR-PAY-06 idempotent-replay-safe. Validates the callback's shape first
   * (§2.5), persists `raw_callback` unconditionally, then: if the
   * transaction is already in a terminal state (most commonly `CONFIRMED`
   * from an earlier delivery of the exact same callback — Safaricom retries
   * on anything but a fast `200`), acknowledges with no second effect. On a
   * genuine first success, captures ONE `MPESA_STK` receipt via
   * `ReceiptsService.captureReceipt()` (itself independently idempotent on
   * `idempotencyKey`, a second layer of the same guarantee).
   */
  async handleStkCallback(payload: unknown): Promise<{ resultCode: string; resultDesc: string }> {
    const parsed = parseStkCallbackPayload(payload);

    return runInTransaction(this.dataSource, async (manager) => {
      const txn = await this.mpesaTransactionRepository.findByCheckoutRequestId(parsed.checkoutRequestId, manager);
      if (!txn) {
        throw new NotFoundException("PayMpesaTransaction(checkout_request_id)", parsed.checkoutRequestId);
      }

      txn.rawCallback = payload as Record<string, unknown>;

      if (TERMINAL_STATES.includes(txn.state)) {
        // BR-PAY-06: already processed (or already failed) — acknowledge, no second effect.
        await this.mpesaTransactionRepository.save(txn, manager);
        return { resultCode: "0", resultDesc: `Already ${txn.state} — acknowledged, no action taken` };
      }

      if (parsed.resultCode !== "0") {
        txn.state = "FAILED";
        await this.mpesaTransactionRepository.save(txn, manager);
        return { resultCode: "0", resultDesc: "Acknowledged (STK not completed by customer)" };
      }

      if (parsed.mpesaRef) {
        const collision = await this.mpesaTransactionRepository.findByMpesaRef(parsed.mpesaRef, manager);
        if (collision && collision.id !== txn.id && collision.state === "CONFIRMED") {
          throw new ConflictException(
            `BR-PAY-06: mpesa_ref ${parsed.mpesaRef} is already CONFIRMED on a different transaction (${collision.id})`,
          );
        }
      }

      const rawRequest = txn.rawRequest as unknown as StkRawRequest;
      const student = await this.studentRepository.findByIdOrFail(rawRequest.studentId, manager);
      const confirmedAmount = parsed.amount ?? txn.amount;

      const receipt = await this.receiptsService.captureReceipt(manager, {
        studentId: rawRequest.studentId,
        payerName: `${student.firstName} ${student.lastName}`,
        payerPhone: txn.msisdnMasked,
        receiptDate: new Date().toISOString().slice(0, 10),
        total: confirmedAmount,
        splits: [{ method: "MPESA_STK", amount: confirmedAmount, mpesaTransactionId: txn.id, externalRef: parsed.mpesaRef }],
        cashierId: rawRequest.initiatedBy,
        idempotencyKey: `mpesa-stk-${parsed.checkoutRequestId}`,
        invoiceIds: rawRequest.invoiceIds,
      });

      txn.state = "CONFIRMED";
      txn.mpesaRef = parsed.mpesaRef ?? null;
      txn.matchedReceiptId = receipt.id;
      await this.mpesaTransactionRepository.save(txn, manager);
      return { resultCode: "0", resultDesc: "Accepted" };
    });
  }

  /**
   * FR-PAY-008.1's status-query fallback — the METHOD is fully callable;
   * automatic +2min-before-FAILED scheduling is deferred (see class doc
   * comment, no scheduler/worker exists anywhere in this codebase yet).
   */
  async queryPendingStatus(transactionId: string): Promise<PayMpesaTransactionEntity> {
    return runInTransaction(this.dataSource, async (manager) => {
      const txn = await this.mpesaTransactionRepository.findByIdOrFail(transactionId, manager);
      if (txn.kind !== "STK" || !txn.checkoutRequestId) {
        throw new ValidationException(`MpesaService.queryPendingStatus: ${transactionId} is not an STK transaction with a checkout_request_id`);
      }
      if (TERMINAL_STATES.includes(txn.state)) {
        return txn;
      }

      const port = await this.adapterResolver.resolve();
      const status = await port.queryStkStatus(txn.checkoutRequestId);
      if (status.resultCode === "0") {
        // A CONFIRMED result should normally arrive via the callback first;
        // a status query landing here after a genuinely lost callback is
        // documented as a gap — this pass does not auto-capture a receipt
        // from a status-query result alone (no confirmed mpesa_ref/amount
        // payload shape to trust the way the callback provides), it only
        // updates bookkeeping state so a human can follow up.
        txn.rawCallback = { ...txn.rawCallback, statusQuery: status } as Record<string, unknown>;
      } else {
        txn.state = "TIMEOUT";
        txn.rawCallback = { ...txn.rawCallback, statusQuery: status } as Record<string, unknown>;
      }
      return this.mpesaTransactionRepository.save(txn, manager);
    });
  }

  // ---- C2B ----

  /**
   * Daraja's C2B Validation phase — a fast accept/reject BEFORE the
   * transaction settles (§2.5). This pass performs strict payload-shape
   * validation and shortcode-sanity checking only; it does not reject on
   * "no matching student" (that is Confirmation's job, via suspense —
   * rejecting a real customer's payment at Validation time because the
   * BillRefNumber didn't parse would return their money, which is far more
   * disruptive than parking it in suspense).
   */
  async handleC2BValidation(payload: unknown): Promise<{ resultCode: string; resultDesc: string }> {
    parseC2BPayload(payload);
    return { resultCode: "0", resultDesc: "Accepted" };
  }

  /**
   * Daraja's C2B Confirmation phase — the final, settled notification.
   * FR-PAY-009.1: parses `BillRefNumber` against
   * `C2B_BILL_REF_PATTERNS_SETTING_KEY`'s configurable regex list, first
   * trying an exact admission-number match, then each pattern in order.
   * Match -> auto-captures an `MPESA_C2B` receipt. No match -> creates a
   * `pay_suspense_item` (`source='C2B'`) — BR-PAY-07, money is never
   * silently dropped.
   */
  async handleC2BConfirmation(payload: unknown): Promise<{ resultCode: string; resultDesc: string }> {
    const parsed = parseC2BPayload(payload);

    return runInTransaction(this.dataSource, async (manager) => {
      const existingSuspense = await this.suspenseItemRepository
        .findOpen(manager)
        .then((items) => items.find((item) => item.externalRef === parsed.transId));
      if (existingSuspense) {
        return { resultCode: "0", resultDesc: "Already parked in suspense — acknowledged, no second effect" };
      }

      const admissionNo = await this.resolveAdmissionNo(parsed.billRefNumber, manager);
      const student = admissionNo ? await this.studentRepository.findByAdmissionNo(admissionNo, manager) : null;

      if (!student) {
        await this.suspenseItemRepository.create(
          {
            source: "C2B",
            amount: parsed.amount,
            externalRef: parsed.transId,
            raw: payload as Record<string, unknown>,
            receivedAt: parsed.transTime,
            state: "OPEN",
            resolvedReceiptId: null,
            resolvedBy: null,
            resolvedAt: null,
            resolutionNote: null,
          },
          manager,
        );
        return { resultCode: "0", resultDesc: "Accepted (parked in suspense — no matching admission number)" };
      }

      const systemActorId = await this.resolveSystemActorId();
      const payerName = [parsed.firstName, parsed.middleName, parsed.lastName].filter(Boolean).join(" ") || `${student.firstName} ${student.lastName}`;

      await this.receiptsService.captureReceipt(manager, {
        studentId: student.id,
        payerName,
        payerPhone: parsed.msisdn,
        receiptDate: parsed.transTime.toISOString().slice(0, 10),
        total: parsed.amount,
        splits: [{ method: "MPESA_C2B", amount: parsed.amount, externalRef: parsed.transId }],
        cashierId: systemActorId,
        idempotencyKey: `mpesa-c2b-${parsed.transId}`,
      });

      return { resultCode: "0", resultDesc: "Accepted (auto-matched)" };
    });
  }

  // ---- B2C ----

  async initiateB2c(em: EntityManager, input: InitiateB2cInput, initiatedBy: string): Promise<PayMpesaTransactionEntity> {
    if (!input.amountKes.isPositive()) {
      throw new ValidationException("MpesaService.initiateB2c: amountKes must be positive");
    }

    const rawRequest: B2cRawRequest = {
      initiatedBy,
      remarks: input.remarks,
      originatingReason: input.originatingReason ?? null,
      msisdn: input.msisdn,
    };
    const shortcode = await this.resolveShortcode();

    let txn = await this.mpesaTransactionRepository.create(
      {
        kind: "B2C",
        shortcode,
        msisdnMasked: maskMsisdn(input.msisdn),
        amount: input.amountKes,
        mpesaRef: null,
        checkoutRequestId: null,
        conversationId: null,
        billRef: null,
        state: "INITIATED",
        rawRequest: rawRequest as unknown as Record<string, unknown>,
        rawCallback: null,
        matchedReceiptId: null,
        walletTransactionId: null,
        createdBy: initiatedBy,
        updatedBy: initiatedBy,
      },
      em,
    );

    const port = await this.adapterResolver.resolve();
    const result = await port.b2cPayment({
      amountKes: input.amountKes,
      msisdn: input.msisdn,
      remarks: input.remarks,
      occasion: input.originatingReason,
    });

    txn.conversationId = result.conversationId;
    txn.state = "PENDING";
    txn.updatedBy = initiatedBy;
    txn = await this.mpesaTransactionRepository.save(txn, em);
    return txn;
  }

  /**
   * Correlates by `conversation_id`. Marks `CONFIRMED`/`FAILED` only —
   * wiring this to `domains/billing`'s `RefundVouchersService.markPaid()`
   * (the FR-BILL-052.1 payout-completion gap that module explicitly
   * deferred) is a natural next step, deliberately OUT OF SCOPE for this
   * pass (see the task brief). A future pass reads `matched_receipt_id`-style
   * correlation off this transaction to close that gap.
   */
  async handleB2cResult(payload: unknown): Promise<{ resultCode: string }> {
    const parsed = parseB2cResultPayload(payload);

    return runInTransaction(this.dataSource, async (manager) => {
      const txn = await this.mpesaTransactionRepository.findByConversationId(parsed.conversationId, manager);
      if (!txn) {
        throw new NotFoundException("PayMpesaTransaction(conversation_id)", parsed.conversationId);
      }
      if (TERMINAL_STATES.includes(txn.state)) {
        return { resultCode: "0" };
      }

      txn.rawCallback = payload as Record<string, unknown>;
      txn.state = parsed.resultCode === "0" ? "CONFIRMED" : "FAILED";
      if (parsed.transactionReceipt) txn.mpesaRef = parsed.transactionReceipt;
      await this.mpesaTransactionRepository.save(txn, manager);
      return { resultCode: "0" };
    });
  }

  // ---- helpers ----

  private async resolveShortcode(): Promise<string> {
    return this.settingsService.getTyped<string>(MPESA_SHORTCODE_SETTING_KEY, DEFAULT_MPESA_SHORTCODE);
  }

  private async resolveSystemActorId(): Promise<string> {
    const actorId = await this.settingsService.getTyped<string | null>(MPESA_SYSTEM_ACTOR_SETTING_KEY, null);
    if (!actorId) {
      throw new ValidationException(
        `MpesaService: Settings key '${MPESA_SYSTEM_ACTOR_SETTING_KEY}' is not configured — a C2B auto-matched receipt ` +
          "needs a real usr_user id to record as its capturing cashier (pay_receipt.cashier_id is NOT NULL). " +
          "Configure this key to a service-account user id (e.g. an 'M-Pesa System' account) before enabling C2B auto-capture.",
      );
    }
    return actorId;
  }

  private async resolveAdmissionNo(billRefNumber: string, manager: EntityManager): Promise<string | null> {
    const exact = await this.studentRepository.findByAdmissionNo(billRefNumber, manager);
    if (exact) return billRefNumber;

    const patternsRaw = await this.settingsService.getTyped<string[]>(
      C2B_BILL_REF_PATTERNS_SETTING_KEY,
      DEFAULT_C2B_BILL_REF_PATTERNS as string[],
    );
    for (const source of patternsRaw) {
      const match = new RegExp(source).exec(billRefNumber);
      if (!match) continue;
      const candidate = match[1] ?? match[0];
      if (candidate) return candidate;
    }
    return null;
  }
}

// ---- payload parsing (§2.5 "payload schema validation") ----

interface ParsedStkCallback {
  checkoutRequestId: string;
  merchantRequestId: string;
  resultCode: string;
  resultDesc: string;
  amount?: Money;
  mpesaRef?: string;
}

function parseStkCallbackPayload(payload: unknown): ParsedStkCallback {
  const body = asRecord(payload, "payload");
  const outer = asRecord(body.Body, "payload.Body");
  const callback = asRecord(outer.stkCallback, "payload.Body.stkCallback");

  const checkoutRequestId = asString(callback.CheckoutRequestID, "stkCallback.CheckoutRequestID");
  const merchantRequestId = asString(callback.MerchantRequestID, "stkCallback.MerchantRequestID");
  const resultCode = String(requireField(callback.ResultCode, "stkCallback.ResultCode"));
  const resultDesc = asString(callback.ResultDesc, "stkCallback.ResultDesc");

  let amount: Money | undefined;
  let mpesaRef: string | undefined;
  const metadata = callback.CallbackMetadata as { Item?: Array<{ Name?: string; Value?: unknown }> } | undefined;
  if (metadata?.Item) {
    for (const item of metadata.Item) {
      if (item.Name === "Amount" && item.Value !== undefined) amount = Money.fromDecimalString(String(item.Value));
      if (item.Name === "MpesaReceiptNumber" && item.Value !== undefined) mpesaRef = String(item.Value);
    }
  }

  return { checkoutRequestId, merchantRequestId, resultCode, resultDesc, amount, mpesaRef };
}

interface ParsedC2BPayload {
  transId: string;
  billRefNumber: string;
  amount: Money;
  msisdn: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  transTime: Date;
}

function parseC2BPayload(payload: unknown): ParsedC2BPayload {
  const body = asRecord(payload, "payload");
  const transId = asString(body.TransID, "TransID");
  const billRefNumber = asString(body.BillRefNumber, "BillRefNumber");
  const amount = Money.fromDecimalString(asString(body.TransAmount, "TransAmount"));
  const msisdn = asString(body.MSISDN, "MSISDN");
  const transTimeRaw = asString(body.TransTime, "TransTime");
  return {
    transId,
    billRefNumber,
    amount,
    msisdn,
    firstName: typeof body.FirstName === "string" ? body.FirstName : undefined,
    middleName: typeof body.MiddleName === "string" ? body.MiddleName : undefined,
    lastName: typeof body.LastName === "string" ? body.LastName : undefined,
    transTime: parseDarajaTimestamp(transTimeRaw),
  };
}

interface ParsedB2cResult {
  conversationId: string;
  resultCode: string;
  transactionReceipt?: string;
}

function parseB2cResultPayload(payload: unknown): ParsedB2cResult {
  const body = asRecord(payload, "payload");
  const result = asRecord(body.Result, "payload.Result");
  const conversationId = asString(result.ConversationID, "Result.ConversationID");
  const resultCode = String(requireField(result.ResultCode, "Result.ResultCode"));

  let transactionReceipt: string | undefined;
  const resultParameters = result.ResultParameters as { ResultParameter?: Array<{ Key?: string; Value?: unknown }> } | undefined;
  if (resultParameters?.ResultParameter) {
    for (const param of resultParameters.ResultParameter) {
      if (param.Key === "TransactionReceipt" && param.Value !== undefined) transactionReceipt = String(param.Value);
    }
  }

  return { conversationId, resultCode, transactionReceipt };
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new ValidationException(`M-Pesa callback payload validation failed: '${field}' must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireField(value: unknown, field: string): unknown {
  if (value === undefined || value === null) {
    throw new ValidationException(`M-Pesa callback payload validation failed: '${field}' is required`);
  }
  return value;
}

function asString(value: unknown, field: string): string {
  requireField(value, field);
  return String(value);
}

/** `TransTime` is `YYYYMMDDHHmmss`; falls back to now() if unparseable rather than rejecting the whole callback over a cosmetic field. */
function parseDarajaTimestamp(raw: string): Date {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(raw);
  if (!match) return new Date();
  const [, year, month, day, hour, minute, second] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
}

/** Masks all but the last 3 digits of an MSISDN for `pay_mpesa_transaction.msisdn_masked` — never stores a full phone number in the clear on this row. */
function maskMsisdn(msisdn: string): string {
  if (msisdn.length <= 3) return msisdn;
  return `${"*".repeat(msisdn.length - 3)}${msisdn.slice(-3)}`;
}
