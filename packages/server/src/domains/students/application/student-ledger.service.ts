import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { Money } from "../../../shared/money/money";
import { StdLedgerEntryEntity } from "../domain/std-ledger-entry.entity";
import { StdLedgerEntryRepository, StdLedgerStatementRow } from "../infrastructure/std-ledger-entry.repository";

export interface AppendLedgerEntryInput {
  studentId: string;
  entryDate: string;
  docType: string;
  docId: string;
  docNumber: string;
  debit: Money;
  credit: Money;
  memo?: string | null;
}

/**
 * `std_ledger_entry` — the student sub-ledger. `appendEntry()` is documented
 * as the SOLE intended write path for this table (the DDL's own comment says
 * "written by posting flows") — **but, unlike `gl_journal`/`gl_journal_line`'s
 * `trg_gl_writer_guard`, there is no DB trigger enforcing that exclusivity
 * here.** This is an honest architectural convention this service embodies,
 * not yet a hard DB guarantee — stated plainly rather than overclaiming
 * enforcement that doesn't exist. `StdLedgerEntryRepository` itself has no
 * `save()`/`update()`/`delete()` method (only `create()`), which narrows the
 * accidental-misuse surface at the repository layer, but a determined caller
 * could still reach `EntityManager.save(StdLedgerEntryEntity, ...)` directly.
 *
 * `appendEntry()` takes the caller's own `EntityManager` and opens no
 * transaction of its own — the exact same composable-transaction pattern as
 * `PostingService.post()`/`NumberingService.allocate()`/`ApprovalEngineService.submit()`
 * — since Billing (Module 9) and Payments (Module 10) are expected to call
 * this inside their own posting transactions once built, so a receipt/invoice
 * write and its student-ledger mirror commit or roll back together.
 */
@Injectable()
export class StudentLedgerService {
  constructor(private readonly ledgerEntryRepository: StdLedgerEntryRepository) {}

  async appendEntry(em: EntityManager, input: AppendLedgerEntryInput): Promise<StdLedgerEntryEntity> {
    return this.ledgerEntryRepository.create(
      {
        studentId: input.studentId,
        entryDate: input.entryDate,
        postedAt: new Date(),
        docType: input.docType,
        docId: input.docId,
        docNumber: input.docNumber,
        debit: input.debit,
        credit: input.credit,
        memo: input.memo ?? null,
      },
      em,
    );
  }

  /** The running-balance statement view — `std_ledger_entry`'s balance is computed at query time, never stored (see `StdLedgerEntryRepository`'s doc comment). */
  async getStatement(studentId: string): Promise<StdLedgerStatementRow[]> {
    return this.ledgerEntryRepository.getStatementWithRunningBalance(studentId);
  }
}
