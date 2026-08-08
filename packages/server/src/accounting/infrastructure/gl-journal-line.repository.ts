import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { GlJournalLineEntity } from "../domain/gl-journal-line.entity";

/**
 * Plain repository wrapper. `gl_journal_line` is immutable after insert
 * and writable only by the future `PostingService` (see
 * `GlJournalRepository`'s doc comment — same trigger guards apply here).
 * `trg_gl_journal_balanced` (deferred constraint trigger) validates
 * `SUM(debit) = SUM(credit)` per `journal_id` at COMMIT, so `createMany()`
 * inserting an unbalanced set of lines fails only when the caller's
 * transaction commits, not on the individual INSERT.
 */
@Injectable()
export class GlJournalLineRepository {
  constructor(
    @InjectRepository(GlJournalLineEntity)
    private readonly repo: Repository<GlJournalLineEntity>,
  ) {}

  async listByJournal(journalId: string, manager?: EntityManager): Promise<GlJournalLineEntity[]> {
    return (manager?.getRepository(GlJournalLineEntity) ?? this.repo).find({
      where: { journalId },
      order: { lineNo: "ASC" },
    });
  }

  /** The trial-balance/ledger-detail access path: every line ever posted to an account, across journals. */
  async listByAccount(accountId: string, manager?: EntityManager): Promise<GlJournalLineEntity[]> {
    return (manager?.getRepository(GlJournalLineEntity) ?? this.repo).find({
      where: { accountId },
      order: { journalId: "ASC", lineNo: "ASC" },
    });
  }

  /** The sub-ledger reconciliation access path (e.g. "which GL lines back this bill_invoice_line?"). */
  async listByEntityRef(
    entityRefType: string,
    entityRefId: string,
    manager?: EntityManager,
  ): Promise<GlJournalLineEntity[]> {
    return (manager?.getRepository(GlJournalLineEntity) ?? this.repo).find({
      where: { entityRefType, entityRefId },
    });
  }

  async create(data: Partial<GlJournalLineEntity>, manager: EntityManager): Promise<GlJournalLineEntity> {
    const repo = manager.getRepository(GlJournalLineEntity);
    return repo.save(repo.create(data));
  }

  async createMany(data: Partial<GlJournalLineEntity>[], manager: EntityManager): Promise<GlJournalLineEntity[]> {
    const repo = manager.getRepository(GlJournalLineEntity);
    return repo.save(data.map((line) => repo.create(line)));
  }
}
