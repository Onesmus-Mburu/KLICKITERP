import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BillInvoiceEntity } from "../domain/bill-invoice.entity";

/**
 * Plain repository wrapper for `bill_invoice`, plus `findOpenForStudent()` —
 * the cashier/statement-of-account lookup the next pass's payment-allocation
 * and clearance-check services will need immediately (mirrors
 * `ix_bill_invoice_open_p`'s `WHERE balance > 0` partial index shape).
 */
@Injectable()
export class BillInvoiceRepository {
  constructor(
    @InjectRepository(BillInvoiceEntity)
    private readonly repo: Repository<BillInvoiceEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BillInvoiceEntity | null> {
    return (manager?.getRepository(BillInvoiceEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BillInvoiceEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BillInvoice", id);
    return row;
  }

  async findByNumber(number: string, manager?: EntityManager): Promise<BillInvoiceEntity | null> {
    return (manager?.getRepository(BillInvoiceEntity) ?? this.repo).findOne({ where: { number } });
  }

  async listByStudent(studentId: string, manager?: EntityManager): Promise<BillInvoiceEntity[]> {
    return (manager?.getRepository(BillInvoiceEntity) ?? this.repo).find({
      where: { studentId },
      order: { issueDate: "DESC" },
    });
  }

  async create(data: Partial<BillInvoiceEntity>, manager?: EntityManager): Promise<BillInvoiceEntity> {
    const repo = manager?.getRepository(BillInvoiceEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BillInvoiceEntity, manager?: EntityManager): Promise<BillInvoiceEntity> {
    return (manager?.getRepository(BillInvoiceEntity) ?? this.repo).save(entity);
  }

  /** Phase 6 Slice 3b — `FeeStructuresService.delete()`'s safety check: how many invoices (any status) still reference this structure. */
  async countByFeeStructureId(feeStructureId: string, manager?: EntityManager): Promise<number> {
    return (manager?.getRepository(BillInvoiceEntity) ?? this.repo).count({ where: { feeStructureId } });
  }

  /** BR-BILL-04 idempotency lookup: the live (non-VOID) structure-generated invoice for a (student, term, structure). */
  async findByStudentTermStructure(
    studentId: string,
    termId: string,
    feeStructureId: string,
    manager?: EntityManager,
  ): Promise<BillInvoiceEntity | null> {
    return (manager?.getRepository(BillInvoiceEntity) ?? this.repo).findOne({
      where: { studentId, termId, feeStructureId, source: "STRUCTURE" },
    });
  }

  /**
   * Every invoice with `balance > 0` for a student, oldest due date first —
   * the FR-PAY statement-of-account / clearance-check (BR-BILL-15) lookup.
   * Mirrors `ix_bill_invoice_open_p`'s partial-index scope (`WHERE balance >
   * 0`) — a raw `QueryBuilder` `>` comparison rather than TypeORM's `MoreThan()`
   * operator, since `balance` carries a `Money` transformer and `MoreThan()`
   * would compare the *transformed* value, not the raw decimal column.
   */
  async findOpenForStudent(studentId: string, manager?: EntityManager): Promise<BillInvoiceEntity[]> {
    const repo = manager?.getRepository(BillInvoiceEntity) ?? this.repo;
    return repo
      .createQueryBuilder("invoice")
      .where("invoice.student_id = :studentId", { studentId })
      .andWhere("invoice.balance > 0")
      .orderBy("invoice.due_date", "ASC")
      .getMany();
  }

  /**
   * PASS B — `LateFeeBatchesService.runBatch()`'s overdue-population lookup
   * (FR-BILL-025.1): every non-`VOID` invoice with `balance > 0` and
   * `due_date < cutoffDate` (the caller pre-subtracts `policy.grace_days`
   * from the run date before calling this). Same raw `>`/`<` comparison
   * convention as `findOpenForStudent()` — `balance` carries a `Money`
   * transformer, so TypeORM's `LessThan()`/`MoreThan()` operators would
   * compare the *transformed* value, not the raw decimal column.
   */
  async findOverdueOpen(cutoffDate: string, manager?: EntityManager): Promise<BillInvoiceEntity[]> {
    const repo = manager?.getRepository(BillInvoiceEntity) ?? this.repo;
    return repo
      .createQueryBuilder("invoice")
      .where("invoice.due_date < :cutoffDate", { cutoffDate })
      .andWhere("invoice.balance > 0")
      .andWhere("invoice.status <> 'VOID'")
      .orderBy("invoice.due_date", "ASC")
      .getMany();
  }

  /**
   * Every open invoice across ALL students (`balance > 0 AND status <>
   * 'VOID'`), regardless of due date — added for Module 18 (Reporting)'s
   * `AgingOutstandingReport` (`domains/reporting/application/aging-outstanding.report.ts`),
   * the FR-RPT-008 report-of-record equivalent of what `mv_ar_summary`
   * approximates for dashboard speed. Unlike `findOverdueOpen()`, this
   * deliberately does NOT filter by `due_date` — the Aging/Outstanding
   * report needs NOT-YET-DUE open invoices too (they fold into its "0-30"
   * bucket, the same convention `mv_ar_summary`'s own migration SQL
   * documents). Same raw `>`/`<>` comparison convention as
   * `findOpenForStudent()`/`findOverdueOpen()` — `balance` carries a `Money`
   * transformer, so TypeORM's `MoreThan()` operator would compare the
   * *transformed* value, not the raw decimal column.
   */
  async findAllOpen(manager?: EntityManager): Promise<BillInvoiceEntity[]> {
    const repo = manager?.getRepository(BillInvoiceEntity) ?? this.repo;
    return repo
      .createQueryBuilder("invoice")
      .where("invoice.balance > 0")
      .andWhere("invoice.status <> 'VOID'")
      .orderBy("invoice.due_date", "ASC")
      .getMany();
  }

  /**
   * Phase 6 Slice 8 (Part 2) — the Pending/Upcoming invoice list screens'
   * paginated, joined query. `bucket:"PENDING"` is `due_date < asOfDate`
   * (already overdue); `bucket:"UPCOMING"` is `due_date >= asOfDate` (due
   * today or later — an invoice due exactly today lands in UPCOMING, not
   * PENDING, the same strict-`<` "overdue" convention `findOverdueOpen()`
   * above already establishes for its own `cutoffDate` comparison). Same raw
   * `>`/`<>`/`</>=` comparison convention as `findOpenForStudent()`/
   * `findOverdueOpen()`/`findAllOpen()` — `balance` carries a `Money`
   * transformer, so TypeORM's `LessThan()`/`MoreThan()` operators would
   * compare the *transformed* value, not the raw decimal column.
   *
   * Joined via `invoice.student` — the entity's own pre-existing `ManyToOne`
   * relation (`BillInvoiceEntity.student`), not a hand-written raw SQL join:
   * a to-one relation never fans out rows, so `getManyAndCount()`'s count
   * stays correct under `skip`/`take`. This is what backs each row's
   * admission-no/name/class columns on the two list screens without a
   * per-row N+1 lookup.
   *
   * Phase 6 Slice 9 (Part B) — gained an optional `q` search filter: ILIKE
   * against `(first_name || ' ' || last_name)` (the plan's own literal
   * spec), `admission_no`, AND — additionally — the joined student's
   * `search_name` (the entity's own existing generated/GIN-trigram-indexed
   * column, `lower(first_name || ' ' || coalesce(middle_name,'') || ' ' ||
   * last_name)`, the same column `StdStudentRepository.
   * searchByNameOrAdmissionNo()` already searches for `GET /students/search`)
   * OR'd in, so a query that happens to hit the middle name still matches.
   *
   * **A real, live-test-caught mistake, not shipped**: the first version of
   * this filter searched `search_name` ALONE (reasoning it was "already
   * indexed, why hand-roll a concat") — this broke the exact common case it
   * needed to handle: for a student with NO middle name, `search_name`'s own
   * `coalesce(middle_name,'') || ' '` still inserts a blank token, producing
   * a real DOUBLE space between first and last name (`"first  last"`), so a
   * naturally-typed single-spaced query like `"first last"` does NOT
   * ILIKE-match it as a substring. Caught live by this method's own
   * integration test (`pending-upcoming-invoices.integration.spec.ts`,
   * real Postgres, not a mock) failing on exactly this — fixed by ALSO
   * matching the plan's originally-specified plain `first_name || ' ' ||
   * last_name` concat (which never has this double-space problem, since it
   * never touches middle_name at all), keeping `search_name` as an
   * additional OR'd clause rather than dropping it outright.
   */
  async findOpenPaginated(
    bucket: "PENDING" | "UPCOMING",
    asOfDate: string,
    pagination: { skip: number; take: number },
    q?: string,
    manager?: EntityManager,
  ): Promise<{ items: BillInvoiceEntity[]; total: number }> {
    const repo = manager?.getRepository(BillInvoiceEntity) ?? this.repo;
    const qb = repo
      .createQueryBuilder("invoice")
      .leftJoinAndSelect("invoice.student", "student")
      .where("invoice.balance > 0")
      .andWhere("invoice.status <> 'VOID'")
      .andWhere(bucket === "PENDING" ? "invoice.due_date < :asOfDate" : "invoice.due_date >= :asOfDate", { asOfDate });
    const trimmedQ = q?.trim();
    if (trimmedQ) {
      qb.andWhere(
        "((student.first_name || ' ' || student.last_name) ILIKE :q OR student.search_name ILIKE :q OR student.admission_no ILIKE :q)",
        { q: `%${trimmedQ}%` },
      );
    }
    const [items, total] = await qb
      // Property-path form (`invoice.dueDate`, not the raw `invoice.due_date`
      // this file's other methods use in `where`/`andWhere`) — REQUIRED here,
      // not a stylistic choice: with `leftJoinAndSelect()` in play, TypeORM's
      // pagination fix-up (`createOrderByCombinedWithSelectExpression()`,
      // triggered by `skip()`/`take()` alongside a join) resolves `orderBy`
      // entries via `alias.metadata.findColumnWithPropertyPath(propertyPath)`
      // — which only recognizes entity PROPERTY names, not raw column names.
      // Confirmed by reading TypeORM's own source after this exact call threw
      // `TypeError: Cannot read properties of undefined (reading
      // 'databaseName')` with the raw-column form during this pass's own
      // verification run.
      .orderBy("invoice.dueDate", "ASC")
      .skip(pagination.skip)
      .take(pagination.take)
      .getManyAndCount();
    return { items, total };
  }
}
