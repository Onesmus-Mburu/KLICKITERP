import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { BankChequeLeafEntity } from "../domain/bank-cheque-leaf.entity";
import { BankChequeLeafRepository, ListBankChequeLeavesFilter } from "../infrastructure/bank-cheque-leaf.repository";

/** BR-BANK-04 — the 6-month `ISSUED` -> `STALE` auto-flag threshold. */
const STALE_THRESHOLD_MONTHS = 6;

export interface IssueChequeLeafInput {
  bookId: string;
  voucherId?: string | null;
  payee: string;
  amount: Money;
}

/**
 * FR-BANK-005.1's cheque register lifecycle — BR-BANK-04: leaves issue
 * strictly sequentially per book (`findNextUnused()`'s lowest-numbered
 * `UNUSED` leaf), statuses `UNUSED -> ISSUED -> PRESENTED -> CLEARED` (or
 * `STOPPED`/`CANCELLED` off `ISSUED`/`PRESENTED`, or auto-flagged `STALE`
 * off `ISSUED` past 6 months). `issueNext()` never skips an unused leaf on
 * its own — the only way to skip one is `cancel()`'s explicit reason,
 * mirroring `ChequeLeafEntity`'s own doc comment.
 *
 * `flagStale()` is a callable method, not auto-scheduled — no
 * scheduler/worker exists anywhere in this codebase yet (the same
 * "config/detection logic exists, dispatcher doesn't" gap every other
 * cron-shaped feature in this codebase has documented, e.g.
 * `RecurringService.runDue()`/`appr_level.sla_hours`'s reminder dispatch) —
 * it must be manually triggered (e.g. via its own controller endpoint) for
 * now.
 */
@Injectable()
export class ChequeLeavesService {
  constructor(private readonly chequeLeafRepository: BankChequeLeafRepository) {}

  async findByIdOrFail(id: string): Promise<BankChequeLeafEntity> {
    return this.chequeLeafRepository.findByIdOrFail(id);
  }

  async list(filter: ListBankChequeLeavesFilter = {}): Promise<BankChequeLeafEntity[]> {
    return this.chequeLeafRepository.list(filter);
  }

  /** BR-BANK-04 — see class doc comment. */
  async issueNext(em: EntityManager, input: IssueChequeLeafInput, issuedBy: string): Promise<BankChequeLeafEntity> {
    if (!input.amount.isPositive()) {
      throw new ValidationException("issueNext: amount must be > 0");
    }
    const leaf = await this.chequeLeafRepository.findNextUnused(input.bookId, em);
    if (!leaf) {
      throw new ValidationException(`No UNUSED leaves remain in cheque book ${input.bookId}`);
    }

    leaf.status = "ISSUED";
    leaf.voucherId = input.voucherId ?? null;
    leaf.payee = input.payee;
    leaf.amount = input.amount;
    leaf.issuedOn = new Date().toISOString().slice(0, 10);
    leaf.updatedBy = issuedBy;
    return this.chequeLeafRepository.save(leaf, em);
  }

  async markPresented(id: string, actorId: string): Promise<BankChequeLeafEntity> {
    const leaf = await this.requireStatus(id, ["ISSUED"], "markPresented");
    leaf.status = "PRESENTED";
    leaf.updatedBy = actorId;
    return this.chequeLeafRepository.save(leaf);
  }

  async markCleared(id: string, actorId: string): Promise<BankChequeLeafEntity> {
    const leaf = await this.requireStatus(id, ["PRESENTED"], "markCleared");
    leaf.status = "CLEARED";
    leaf.updatedBy = actorId;
    return this.chequeLeafRepository.save(leaf);
  }

  async markStopped(id: string, reason: string, actorId: string): Promise<BankChequeLeafEntity> {
    requireReason(reason, "markStopped");
    const leaf = await this.requireStatus(id, ["ISSUED", "PRESENTED"], "markStopped");
    leaf.status = "STOPPED";
    leaf.statusReason = reason;
    leaf.updatedBy = actorId;
    return this.chequeLeafRepository.save(leaf);
  }

  /** BR-BANK-04's explicit-skip path — cancelling an UNUSED (never-issued) or ISSUED leaf always requires a reason. */
  async cancel(id: string, reason: string, actorId: string): Promise<BankChequeLeafEntity> {
    requireReason(reason, "cancel");
    const leaf = await this.requireStatus(id, ["UNUSED", "ISSUED"], "cancel");
    leaf.status = "CANCELLED";
    leaf.statusReason = reason;
    leaf.updatedBy = actorId;
    return this.chequeLeafRepository.save(leaf);
  }

  /** See class doc comment "flagStale()" — manual-trigger, no scheduler exists. */
  async flagStale(now: Date = new Date()): Promise<BankChequeLeafEntity[]> {
    const threshold = new Date(now);
    threshold.setUTCMonth(threshold.getUTCMonth() - STALE_THRESHOLD_MONTHS);
    const thresholdDate = threshold.toISOString().slice(0, 10);

    const issuedLeaves = await this.chequeLeafRepository.list({ status: "ISSUED" });
    const stale = issuedLeaves.filter((leaf) => leaf.issuedOn !== null && leaf.issuedOn < thresholdDate);

    const updated: BankChequeLeafEntity[] = [];
    for (const leaf of stale) {
      leaf.status = "STALE";
      updated.push(await this.chequeLeafRepository.save(leaf));
    }
    return updated;
  }

  private async requireStatus(
    id: string,
    allowed: readonly BankChequeLeafEntity["status"][],
    action: string,
  ): Promise<BankChequeLeafEntity> {
    const leaf = await this.chequeLeafRepository.findByIdOrFail(id);
    if (!allowed.includes(leaf.status)) {
      throw new ValidationException(
        `${action}: bank_cheque_leaf ${id} status=${leaf.status}, expected one of [${allowed.join(", ")}]`,
      );
    }
    return leaf;
  }
}

function requireReason(reason: string, action: string): void {
  if (!reason || reason.trim().length === 0) {
    throw new ValidationException(`${action}: a non-empty reason is required (BR-BANK-04)`);
  }
}
