import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { Money } from "../../../shared/money/money";
import { StdLedgerEntryEntity } from "../domain/std-ledger-entry.entity";

/** One row of `getStatementWithRunningBalance()` — the entry plus its computed running balance (never stored). */
export interface StdLedgerStatementRow {
  id: string;
  studentId: string;
  entryDate: string;
  postedAt: Date;
  docType: string;
  docId: string;
  docNumber: string;
  debit: Money;
  credit: Money;
  memo: string | null;
  runningBalance: Money;
}

interface RawStatementRow {
  id: string;
  student_id: string;
  entry_date: string;
  posted_at: Date;
  doc_type: string;
  doc_id: string;
  doc_number: string;
  debit: string;
  credit: string;
  memo: string | null;
  running_balance: string;
}

/**
 * Plain repository wrapper for `std_ledger_entry`, the append-only student
 * sub-ledger. `create()` is this module's only write path (used exclusively
 * by `StudentLedgerService.appendEntry()`, see that service's doc comment)
 * — there is deliberately no `save()`/`update()`/`delete()` method here,
 * mirroring `GlJournalLineRepository`'s immutable-after-insert shape.
 */
@Injectable()
export class StdLedgerEntryRepository {
  constructor(
    @InjectRepository(StdLedgerEntryEntity)
    private readonly repo: Repository<StdLedgerEntryEntity>,
  ) {}

  async create(data: Partial<StdLedgerEntryEntity>, manager: EntityManager): Promise<StdLedgerEntryEntity> {
    const repo = manager.getRepository(StdLedgerEntryEntity);
    return repo.save(repo.create(data));
  }

  async listByStudent(studentId: string, manager?: EntityManager): Promise<StdLedgerEntryEntity[]> {
    return (manager?.getRepository(StdLedgerEntryEntity) ?? this.repo).find({
      where: { studentId },
      order: { postedAt: "ASC" },
    });
  }

  /**
   * Phase 6 Slice 2b — Student delete: `StudentsService.delete()`'s
   * referencing-ledger-entry pre-check (`std_ledger_entry.student_id` is a
   * real `onDelete: "RESTRICT"` FK, migration `0065`). Same-module, so a
   * plain TypeORM `count()` is used rather than raw SQL — no circular-import
   * concern here, unlike the cross-domain checks on `StdStudentRepository`.
   */
  async countByStudentId(studentId: string, manager?: EntityManager): Promise<number> {
    return (manager?.getRepository(StdLedgerEntryEntity) ?? this.repo).count({ where: { studentId } });
  }

  /**
   * The DDL's own comment says the running balance is "computed by window
   * function", never stored — this is that computation:
   * `SUM(debit - credit) OVER (PARTITION BY student_id ORDER BY posted_at, id)`,
   * evaluated per row in chronological order (`posted_at` then `id` as the
   * tiebreaker for entries posted in the same instant, matching insertion
   * order since `id` is a time-ordered UUIDv7).
   */
  async getStatementWithRunningBalance(
    studentId: string,
    manager?: EntityManager,
  ): Promise<StdLedgerStatementRow[]> {
    const source = manager ?? this.repo.manager;
    const rows: RawStatementRow[] = await source.query(
      `
      SELECT
        id, student_id, entry_date, posted_at, doc_type, doc_id, doc_number, debit, credit, memo,
        SUM(debit - credit) OVER (PARTITION BY student_id ORDER BY posted_at, id) AS running_balance
      FROM app.std_ledger_entry
      WHERE student_id = $1
      ORDER BY posted_at ASC, id ASC
      `,
      [studentId],
    );
    return rows.map((row) => ({
      id: row.id,
      studentId: row.student_id,
      entryDate: row.entry_date,
      postedAt: row.posted_at,
      docType: row.doc_type,
      docId: row.doc_id,
      docNumber: row.doc_number,
      debit: Money.fromDecimalString(row.debit),
      credit: Money.fromDecimalString(row.credit),
      memo: row.memo,
      runningBalance: Money.fromDecimalString(row.running_balance),
    }));
  }
}
