import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { runInTransaction } from "../../../shared/database/tx";
import { OutboxWriterService } from "../../../shared/events/outbox-writer.service";
// Barrel import — a real runtime service dependency (`SettingsService.getTyped()`),
// the same one-directional-dependency shape `accounting`/`domains/billing`
// already established for `platform/settings`.
import { SettingsService } from "../../../platform/settings";
import { WallServicePointType, WALL_SERVICE_POINT_TYPES } from "../domain/wall-service-point.entity";
import { WallWalletEntity, WallWalletStatus, WALL_WALLET_STATUSES } from "../domain/wall-wallet.entity";
import { WallWalletRepository } from "../infrastructure/wall-wallet.repository";
import { WalletStatusChangedEvent } from "../events/wallet-status-changed.event";

/** School-policy maxima (Settings keys) — BR-WALL-04: guardian-set limits may only TIGHTEN these, never loosen them. */
export const WALLET_MAX_DAILY_LIMIT_SETTING_KEY = "wallet.max_daily_limit";
export const WALLET_MAX_TXN_LIMIT_SETTING_KEY = "wallet.max_txn_limit";

/** No school-wide policy configured yet — `updateLimits()` treats "no setting" as "no ceiling", not "zero allowed". */
const NO_POLICY_MAXIMUM: Money | null = null;

export interface UpdateWalletLimitsInput {
  dailyLimit?: Money | null;
  txnLimit?: Money | null;
  categoryBlocks?: WallServicePointType[];
}

/**
 * `wall_wallet` lifecycle management — provisioning, status transitions
 * (BR-WALL-03), and guardian-configurable limits (BR-WALL-04). Deliberately
 * separate from `WalletTransactionsService` (the balance-moving engine) —
 * mirrors how `domains/billing` splits `FeeStructuresService` (config) from
 * `InvoicingService` (money-moving engine).
 */
@Injectable()
export class WalletsService {
  constructor(
    private readonly walletRepository: WallWalletRepository,
    private readonly settingsService: SettingsService,
    private readonly outboxWriter: OutboxWriterService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * Lazy provisioning (FR-WALL-004.1) — no event-driven auto-provisioning
   * exists in this codebase (no dispatcher consumes `StudentEnrolledEvent`),
   * so a wallet is created on first use here, `ACTIVE`/`balance=0`, rather
   * than at enrollment time. Idempotent: returns the existing wallet if the
   * student already has one (`uq_wall_wallet_student_id`).
   */
  async getOrCreateWallet(studentId: string, actorId?: string | null): Promise<WallWalletEntity> {
    const existing = await this.walletRepository.findByStudentId(studentId);
    if (existing) return existing;

    return this.walletRepository.create({
      studentId,
      status: "ACTIVE",
      balance: Money.ZERO,
      overdraftLimit: Money.ZERO,
      dailyLimit: null,
      txnLimit: null,
      categoryBlocks: [],
      statusReason: null,
      createdBy: actorId ?? null,
      updatedBy: actorId ?? null,
    });
  }

  async findByIdOrFail(walletId: string): Promise<WallWalletEntity> {
    return this.walletRepository.findByIdOrFail(walletId);
  }

  async findByStudentId(studentId: string): Promise<WallWalletEntity | null> {
    return this.walletRepository.findByStudentId(studentId);
  }

  /**
   * BR-WALL-03: `LOCKED` blocks debits only (spend/transfer-out remain
   * blocked; top-ups/refunds/transfer-in still land), `FROZEN` blocks
   * everything. Direct transitions INTO `CLOSED` are rejected here —
   * closing a wallet always goes through `WalletTransactionsService.closeWallet()`,
   * which applies a zeroing disposition first (BR-WALL-07). A wallet already
   * `CLOSED` can never transition again (permanently frozen, mirrors
   * `trg_wall_wallet_closed_requires_zero`'s one-way nature).
   *
   * FR-WALL-009.1's auto-freeze-on-`WITHDRAWN` (reacting to
   * `StudentStatusChangedEvent`) is a **documented deferred future
   * integration** — no event dispatcher exists anywhere in this codebase yet
   * (same "event exists, dispatcher doesn't" pattern every prior module's
   * outbox events share); wiring it is future work once a consumer exists.
   */
  async setStatus(
    walletId: string,
    toStatus: WallWalletStatus,
    reason: string | null,
    actorId: string,
  ): Promise<WallWalletEntity> {
    if (!WALL_WALLET_STATUSES.includes(toStatus)) {
      throw new ValidationException(`WalletsService.setStatus: unknown status ${String(toStatus)}`);
    }
    const wallet = await this.walletRepository.findByIdOrFail(walletId);
    if (wallet.status === "CLOSED") {
      throw new ValidationException(`WalletsService.setStatus: wallet ${walletId} is CLOSED — status is permanently frozen`);
    }
    if (toStatus === "CLOSED") {
      throw new ValidationException(
        "WalletsService.setStatus: cannot transition directly to CLOSED — use WalletTransactionsService.closeWallet() " +
          "(BR-WALL-07 requires a zeroing disposition first)",
      );
    }
    const fromStatus = wallet.status;
    wallet.status = toStatus;
    wallet.statusReason = reason;
    wallet.updatedBy = actorId;

    return runInTransaction(this.dataSource, async (em) => {
      const saved = await this.walletRepository.save(wallet, em);
      await this.outboxWriter.write(em, new WalletStatusChangedEvent(saved.id, {
        walletId: saved.id,
        studentId: saved.studentId,
        fromStatus,
        toStatus,
        reason,
        actorId,
      }));
      return saved;
    });
  }

  /**
   * BR-WALL-04: a caller-set `dailyLimit`/`txnLimit` may only TIGHTEN the
   * school-policy maxima read from Settings (`wallet.max_daily_limit`/
   * `wallet.max_txn_limit`) — rejects a request exceeding them. No school
   * policy configured (`SettingsService.get()` returns `null`) is treated as
   * "no ceiling", not "zero allowed" — `getTyped()` is called with an
   * explicit `undefined` default so a missing key surfaces as
   * `NO_POLICY_MAXIMUM` rather than throwing `NotFoundException`.
   */
  async updateLimits(walletId: string, input: UpdateWalletLimitsInput, actorId: string): Promise<WallWalletEntity> {
    const wallet = await this.walletRepository.findByIdOrFail(walletId);
    if (wallet.status === "CLOSED") {
      throw new ValidationException(`WalletsService.updateLimits: wallet ${walletId} is CLOSED`);
    }

    if (input.dailyLimit !== undefined) {
      if (input.dailyLimit !== null) {
        const maxDaily = await this.readPolicyMaximum(WALLET_MAX_DAILY_LIMIT_SETTING_KEY);
        if (maxDaily && input.dailyLimit.compare(maxDaily) > 0) {
          throw new ValidationException(
            `BR-WALL-04: dailyLimit ${input.dailyLimit.toDecimalString()} exceeds the school-policy maximum ${maxDaily.toDecimalString()}`,
          );
        }
      }
      wallet.dailyLimit = input.dailyLimit;
    }

    if (input.txnLimit !== undefined) {
      if (input.txnLimit !== null) {
        const maxTxn = await this.readPolicyMaximum(WALLET_MAX_TXN_LIMIT_SETTING_KEY);
        if (maxTxn && input.txnLimit.compare(maxTxn) > 0) {
          throw new ValidationException(
            `BR-WALL-04: txnLimit ${input.txnLimit.toDecimalString()} exceeds the school-policy maximum ${maxTxn.toDecimalString()}`,
          );
        }
      }
      wallet.txnLimit = input.txnLimit;
    }

    if (input.categoryBlocks !== undefined) {
      for (const category of input.categoryBlocks) {
        if (!WALL_SERVICE_POINT_TYPES.includes(category)) {
          throw new ValidationException(`WalletsService.updateLimits: unknown service-point type ${String(category)}`);
        }
      }
      wallet.categoryBlocks = input.categoryBlocks;
    }

    wallet.updatedBy = actorId;
    return this.walletRepository.save(wallet);
  }

  private async readPolicyMaximum(key: string): Promise<Money | null> {
    const raw = await this.settingsService.getTyped<string | null>(key, null);
    return raw ? Money.fromDecimalString(raw) : NO_POLICY_MAXIMUM;
  }
}
