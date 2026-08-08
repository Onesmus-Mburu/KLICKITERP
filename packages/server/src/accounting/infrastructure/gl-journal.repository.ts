import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../shared/exceptions/not-found.exception";
import { GlJournalEntity } from "../domain/gl-journal.entity";

export interface ListGlJournalsFilter {
  sourceModule?: string;
  sourceDocType?: string;
  sourceDocId?: string;
  periodId?: string;
  fromDate?: string;
  toDate?: string;
}

/**
 * Plain repository wrapper. `gl_journal` is immutable after insert
 * (`trg_gl_journal_immutable`, migration `0060`) and writable only by the
 * future `PostingService` under `trg_gl_writer_guard`'s `application_name`
 * gate — `create()` is exposed for that service to call inside its own
 * transaction; nothing here bypasses either trigger (they're DB-layer, not
 * app-layer, defenses).
 */
@Injectable()
export class GlJournalRepository {
  constructor(
    @InjectRepository(GlJournalEntity)
    private readonly repo: Repository<GlJournalEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<GlJournalEntity | null> {
    return (manager?.getRepository(GlJournalEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<GlJournalEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("GlJournal", id);
    return row;
  }

  async findByNumber(number: string, manager?: EntityManager): Promise<GlJournalEntity | null> {
    return (manager?.getRepository(GlJournalEntity) ?? this.repo).findOne({ where: { number } });
  }

  /** The "has this source document already been posted" lookup every future posting map calls first. */
  async findBySource(
    sourceDocType: string,
    sourceDocId: string,
    manager?: EntityManager,
  ): Promise<GlJournalEntity[]> {
    return (manager?.getRepository(GlJournalEntity) ?? this.repo).find({
      where: { sourceDocType, sourceDocId },
      order: { postedAt: "ASC" },
    });
  }

  async listByPeriod(periodId: string, manager?: EntityManager): Promise<GlJournalEntity[]> {
    return (manager?.getRepository(GlJournalEntity) ?? this.repo).find({
      where: { periodId },
      order: { journalDate: "ASC" },
    });
  }

  async create(data: Partial<GlJournalEntity>, manager: EntityManager): Promise<GlJournalEntity> {
    const repo = manager.getRepository(GlJournalEntity);
    return repo.save(repo.create(data));
  }

  /** `journals.controller.ts`'s `GET /accounting/journals` filter surface (source/period/date range). */
  async list(filter: ListGlJournalsFilter = {}, manager?: EntityManager): Promise<GlJournalEntity[]> {
    const repo = manager?.getRepository(GlJournalEntity) ?? this.repo;
    const qb = repo.createQueryBuilder("j");
    if (filter.sourceModule) qb.andWhere("j.source_module = :sourceModule", { sourceModule: filter.sourceModule });
    if (filter.sourceDocType) qb.andWhere("j.source_doc_type = :sourceDocType", { sourceDocType: filter.sourceDocType });
    if (filter.sourceDocId) qb.andWhere("j.source_doc_id = :sourceDocId", { sourceDocId: filter.sourceDocId });
    if (filter.periodId) qb.andWhere("j.period_id = :periodId", { periodId: filter.periodId });
    if (filter.fromDate) qb.andWhere("j.journal_date >= :fromDate", { fromDate: filter.fromDate });
    if (filter.toDate) qb.andWhere("j.journal_date <= :toDate", { toDate: filter.toDate });
    qb.orderBy("j.journal_date", "DESC").addOrderBy("j.posted_at", "DESC");
    return qb.getMany();
  }
}
