import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BillInvoiceLineEntity } from "../domain/bill-invoice-line.entity";

@Injectable()
export class BillInvoiceLineRepository {
  constructor(
    @InjectRepository(BillInvoiceLineEntity)
    private readonly repo: Repository<BillInvoiceLineEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BillInvoiceLineEntity | null> {
    return (manager?.getRepository(BillInvoiceLineEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BillInvoiceLineEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BillInvoiceLine", id);
    return row;
  }

  async listByInvoice(invoiceId: string, manager?: EntityManager): Promise<BillInvoiceLineEntity[]> {
    return (manager?.getRepository(BillInvoiceLineEntity) ?? this.repo).find({
      where: { invoiceId },
      order: { lineNo: "ASC" },
    });
  }

  async create(data: Partial<BillInvoiceLineEntity>, manager?: EntityManager): Promise<BillInvoiceLineEntity> {
    const repo = manager?.getRepository(BillInvoiceLineEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BillInvoiceLineEntity, manager?: EntityManager): Promise<BillInvoiceLineEntity> {
    return (manager?.getRepository(BillInvoiceLineEntity) ?? this.repo).save(entity);
  }

  /**
   * Phase 6 Slice 12 (Part C) — the duplicate fee-category-per-term guard's
   * own lookup: of the GIVEN `feeCategoryIds`, which ones does this student
   * already have a real (non-`VOID`) `bill_invoice_line` for, this term.
   * Joins `bill_invoice_line` -> `bill_invoice` via the entity's own
   * `invoice` relation (`createQueryBuilder`, not a nested-relation `find()`
   * `where`, matching this domain's own established convention for any
   * cross-table filter — see `BillInvoiceRepository.findOpenForStudent()`/
   * `findOpenPaginated()`'s own doc comments for why this codebase prefers
   * `QueryBuilder` here over TypeORM's relation-`where` sugar). Raw
   * snake_case column-name form throughout (`line.fee_category_id`,
   * `invoice.student_id`, ...) — matching `BillInvoiceRepository`'s own
   * established `where`/`andWhere`/`select` convention in THIS domain (its
   * own `findOpenPaginated()` doc comment explains why property-path form is
   * ONLY required inside `.orderBy()` when combined with `skip()`/`take()`
   * and a join — not here, no pagination is involved). `.innerJoin("line.invoice",
   * "invoice")` still uses property-path form — relation-join specifications
   * are a different, always-property-path TypeORM API, same as
   * `findOpenPaginated()`'s own `.leftJoinAndSelect("invoice.student", ...)`.
   * Deliberately does NOT include `DISTINCT` — the caller only ever folds the
   * result into a `Set`, which already dedupes for free.
   */
  async listAlreadyBilledCategoryIds(
    studentId: string,
    termId: string,
    feeCategoryIds: string[],
    manager?: EntityManager,
  ): Promise<Set<string>> {
    if (feeCategoryIds.length === 0) return new Set();
    const repo = manager?.getRepository(BillInvoiceLineEntity) ?? this.repo;
    const rows: { feeCategoryId: string }[] = await repo
      .createQueryBuilder("line")
      .innerJoin("line.invoice", "invoice")
      .select("line.fee_category_id", "feeCategoryId")
      .where("line.fee_category_id IN (:...feeCategoryIds)", { feeCategoryIds })
      .andWhere("invoice.student_id = :studentId", { studentId })
      .andWhere("invoice.term_id = :termId", { termId })
      .andWhere("invoice.status <> 'VOID'")
      .getRawMany();
    return new Set(rows.map((r) => r.feeCategoryId));
  }
}
