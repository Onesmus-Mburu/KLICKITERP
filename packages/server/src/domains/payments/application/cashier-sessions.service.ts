import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { SettingsService } from "../../../platform/settings";
import { PayCashierSessionEntity } from "../domain/pay-cashier-session.entity";
import { PayReceiptSplitMethod } from "../domain/pay-receipt-split.entity";
import { PayCashierSessionRepository } from "../infrastructure/pay-cashier-session.repository";
import { PayReceiptRepository } from "../infrastructure/pay-receipt.repository";
import { PayReceiptSplitRepository } from "../infrastructure/pay-receipt-split.repository";

/** Postgres unique_violation SQLSTATE — same pattern as `NumberingService.allocate()`/`InvoicingService.generateInvoice()`. */
const PG_UNIQUE_VIOLATION = "23505";

/** `set_setting.key` FR-PAY-011.1 reads for the session-close variance tolerance (default `0.00`). */
export const SESSION_VARIANCE_TOLERANCE_SETTING_KEY = "payments.session_variance_tolerance";

export interface CloseSessionApproval {
  supervisorId: string;
  varianceReason: string;
}

/**
 * Cashier session open/close workflow (FR-PAY-011.1, BR-PAY-04/BR-PAY-05).
 * Both methods own their own transaction (`runInTransaction` + injected
 * `DataSource`) rather than taking a caller's `EntityManager` — unlike
 * `ReceiptsService`/`AllocationService`, session open/close are standalone
 * top-level actions with no other domain's write to compose with, the same
 * shape `ConcessionsService.requestConcession()`/`.postStandalone()` use.
 */
@Injectable()
export class CashierSessionsService {
  constructor(
    private readonly sessionRepository: PayCashierSessionRepository,
    private readonly receiptRepository: PayReceiptRepository,
    private readonly splitRepository: PayReceiptSplitRepository,
    private readonly settingsService: SettingsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * BR-PAY-04: at most one OPEN session per cashier, enforced at the DB
   * layer by `uq_pay_session_open_p` (a partial unique index on
   * `cashier_id WHERE status='OPEN'`) — this method does not pre-check;
   * it inserts and translates a `23505` unique-violation into
   * `ConflictException`, mirroring `InvoicingService.generateInvoice()`'s
   * BR-BILL-04 handling of `uq_bill_invoice_structure_p`.
   */
  async openSession(cashierId: string, till: string, floatAmount: Money): Promise<PayCashierSessionEntity> {
    return runInTransaction(this.dataSource, async (manager) => {
      try {
        return await this.sessionRepository.create(
          {
            cashierId,
            till,
            status: "OPEN",
            openedAt: new Date(),
            floatAmount,
            closedAt: null,
            counted: null,
            expectedTotals: null,
            varianceAmount: null,
            varianceReason: null,
            supervisorId: null,
            createdBy: cashierId,
            updatedBy: cashierId,
          },
          manager,
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException(
            `BR-PAY-04: cashier ${cashierId} already has an OPEN cashier session — close it before opening another (uq_pay_session_open_p)`,
          );
        }
        throw error;
      }
    });
  }

  /** BR-PAY-04 lookup — the session the next `captureReceipt()` CASH split must reference. */
  async getOpenSessionForCashier(cashierId: string): Promise<PayCashierSessionEntity | null> {
    return this.sessionRepository.findOpenForCashier(cashierId);
  }

  async findByIdOrFail(id: string): Promise<PayCashierSessionEntity> {
    return this.sessionRepository.findByIdOrFail(id);
  }

  /**
   * FR-PAY-011.1 — compares the system-computed total per payment method
   * (derived by summing this session's `POSTED` receipts' splits) against
   * `counted` (a caller-supplied `method -> counted amount` decimal-string
   * map — the denomination-breakdown UI itself is a Pass B/frontend
   * concern; `pay_cashier_session.counted` stores whatever shape the
   * caller passes, opaque at this layer per that entity's own doc comment).
   * `variance_amount` is the aggregate of each method's absolute
   * discrepancy (`|counted - expected|` summed across every method seen in
   * either side).
   *
   * Beyond `payments.session_variance_tolerance` (Settings, default
   * `0.00`), BR-PAY-05 requires a supervisor credential + reason (the
   * `approval` param) — omitting it throws `ValidationException` instead of
   * closing. Within tolerance, closes directly; `approval`, if supplied
   * anyway, is ignored (not persisted) since BR-PAY-05 only mandates it for
   * the beyond-tolerance case.
   */
  async closeSession(
    sessionId: string,
    counted: Record<string, string>,
    closedBy: string,
    approval?: CloseSessionApproval,
  ): Promise<PayCashierSessionEntity> {
    return runInTransaction(this.dataSource, async (manager) => {
      const session = await this.sessionRepository.findByIdOrFail(sessionId, manager);
      if (session.status !== "OPEN") {
        throw new ValidationException(`PayCashierSession ${sessionId} is not OPEN (status=${session.status})`);
      }

      const expectedTotals = await this.computeExpectedTotals(sessionId, manager);
      const varianceAmount = computeAggregateVariance(expectedTotals, counted);

      const toleranceRaw = await this.settingsService.getTyped<string>(SESSION_VARIANCE_TOLERANCE_SETTING_KEY, "0.00");
      const tolerance = Money.fromDecimalString(toleranceRaw);

      if (varianceAmount.compare(tolerance) > 0) {
        if (!approval) {
          throw new ValidationException(
            `BR-PAY-05: session ${sessionId} variance ${varianceAmount.toDecimalString()} exceeds tolerance ` +
              `${tolerance.toDecimalString()} — closing requires a supervisor credential and a reason`,
          );
        }
        session.supervisorId = approval.supervisorId;
        session.varianceReason = approval.varianceReason;
      }

      session.status = "CLOSED";
      session.closedAt = new Date();
      session.counted = counted;
      session.expectedTotals = expectedTotalsToRecord(expectedTotals);
      session.varianceAmount = varianceAmount;
      session.updatedBy = closedBy;
      return this.sessionRepository.save(session, manager);
    });
  }

  /**
   * Session totals are DERIVED here at close time by re-aggregating
   * `pay_receipt_split` rows, rather than maintained incrementally on
   * `pay_cashier_session` as receipts are captured — a deliberate
   * simplicity choice (see `ReceiptsService.captureReceipt()`'s doc comment,
   * step 12) that avoids a second hot-row-contention point on every receipt
   * capture.
   */
  private async computeExpectedTotals(
    sessionId: string,
    manager: EntityManager,
  ): Promise<Map<PayReceiptSplitMethod, Money>> {
    const receipts = await this.receiptRepository.listBySession(sessionId, manager);
    const totals = new Map<PayReceiptSplitMethod, Money>();
    for (const receipt of receipts) {
      if (receipt.status !== "POSTED") continue;
      const splits = await this.splitRepository.listByReceipt(receipt.id, manager);
      for (const split of splits) {
        totals.set(split.method, (totals.get(split.method) ?? Money.ZERO).add(split.amount));
      }
    }
    return totals;
  }
}

function expectedTotalsToRecord(totals: Map<PayReceiptSplitMethod, Money>): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [method, amount] of totals) record[method] = amount.toDecimalString();
  return record;
}

function computeAggregateVariance(expected: Map<PayReceiptSplitMethod, Money>, counted: Record<string, string>): Money {
  const methods = new Set<string>([...expected.keys(), ...Object.keys(counted)]);
  let variance = Money.ZERO;
  for (const method of methods) {
    const expectedAmount = expected.get(method as PayReceiptSplitMethod) ?? Money.ZERO;
    const countedAmount = counted[method] !== undefined ? Money.fromDecimalString(counted[method]) : Money.ZERO;
    const diff = countedAmount.subtract(expectedAmount);
    variance = variance.add(diff.isNegative() ? diff.negate() : diff);
  }
  return variance;
}

function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: string; driverError?: { code?: string } })?.code ??
    (error as { driverError?: { code?: string } })?.driverError?.code;
  return code === PG_UNIQUE_VIOLATION;
}
