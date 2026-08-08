import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { PayReceiptEntity } from "../domain/pay-receipt.entity";
import { PayReceiptSplitMethod } from "../domain/pay-receipt-split.entity";

/** `PayReceiptRepository.findAllPaginated()`'s filter set — every field optional/AND-combined. */
export interface FindAllReceiptsFilters {
  studentId?: string;
  cashierId?: string;
  /** ISO date (YYYY-MM-DD), inclusive lower bound on `receipt_date`. */
  dateFrom?: string;
  /** ISO date (YYYY-MM-DD), inclusive upper bound on `receipt_date`. */
  dateTo?: string;
  method?: PayReceiptSplitMethod;
  /** Phase 6 Slice 9 (Part B) — ILIKE match against the joined student's `search_name`/`admission_no`; see `findAllPaginated()`'s own doc comment. */
  q?: string;
}

/**
 * Plain repository wrapper for `pay_receipt`, plus `findByIdempotencyKey()`
 * — the STK-callback / receipt-capture idempotency lookup (FR-PAY-008.1:
 * "success: create receipt automatically (idempotent on mpesa_ref)") the
 * next pass's posting service will need immediately.
 */
@Injectable()
export class PayReceiptRepository {
  constructor(
    @InjectRepository(PayReceiptEntity)
    private readonly repo: Repository<PayReceiptEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<PayReceiptEntity | null> {
    return (manager?.getRepository(PayReceiptEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<PayReceiptEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("PayReceipt", id);
    return row;
  }

  async findByNumber(number: string, manager?: EntityManager): Promise<PayReceiptEntity | null> {
    return (manager?.getRepository(PayReceiptEntity) ?? this.repo).findOne({ where: { number } });
  }

  /** Idempotency lookup (`uq_pay_receipt_idempotency_key`) — replayed capture requests must not double-post. */
  async findByIdempotencyKey(idempotencyKey: string, manager?: EntityManager): Promise<PayReceiptEntity | null> {
    return (manager?.getRepository(PayReceiptEntity) ?? this.repo).findOne({ where: { idempotencyKey } });
  }

  async listByStudent(studentId: string, manager?: EntityManager): Promise<PayReceiptEntity[]> {
    return (manager?.getRepository(PayReceiptEntity) ?? this.repo).find({
      where: { studentId },
      order: { receiptDate: "DESC" },
    });
  }

  async listBySession(sessionId: string, manager?: EntityManager): Promise<PayReceiptEntity[]> {
    return (manager?.getRepository(PayReceiptEntity) ?? this.repo).find({ where: { sessionId } });
  }

  /** The contra receipt for an original, if it has been reversed (BR-PAY-08 cross-reference, queried from the original's side since `pay_receipt` carries no forward-pointing column). */
  async findByReversalOfId(reversalOfId: string, manager?: EntityManager): Promise<PayReceiptEntity | null> {
    return (manager?.getRepository(PayReceiptEntity) ?? this.repo).findOne({ where: { reversalOfId } });
  }

  async create(data: Partial<PayReceiptEntity>, manager?: EntityManager): Promise<PayReceiptEntity> {
    const repo = manager?.getRepository(PayReceiptEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: PayReceiptEntity, manager?: EntityManager): Promise<PayReceiptEntity> {
    return (manager?.getRepository(PayReceiptEntity) ?? this.repo).save(entity);
  }

  /**
   * Phase 6 Slice 8 (Part 4) — the global (unscoped) Receipts list screen's
   * paginated, filterable query, backing `ReceiptsController.list()`'s new
   * "neither studentId nor sessionId" branch (gated by
   * `payments:receipt:view-all`). Every filter is optional and AND-combined;
   * `studentId` is included for the method's own general-purpose reuse value
   * even though `ReceiptsController.list()` itself never reaches this branch
   * WITH a studentId set (that always short-circuits to the existing
   * `listByStudent()` bare-array branch first) — a future caller that wants
   * "one student's receipts, but paginated/joined" can still use this method
   * directly.
   *
   * `leftJoinAndSelect("receipt.student"/"receipt.cashier", ...)` — both
   * pre-existing `ManyToOne` relations on `PayReceiptEntity`, both to-one, so
   * neither fans out rows under `getManyAndCount()`'s `skip`/`take` (same
   * safe-to-paginate reasoning `BillInvoiceRepository.findOpenPaginated()`
   * already documents for its own student join).
   *
   * `orderBy` uses the PROPERTY-path form (`receipt.receiptDate`/
   * `receipt.createdAt`, not the raw `receipt_date`/`created_at` column
   * names this file's other methods would use) — REQUIRED, not stylistic:
   * with a join in play, TypeORM's `skip()`/`take()` pagination fix-up
   * resolves `orderBy` entries via `alias.metadata.findColumnWithPropertyPath()`,
   * which only recognizes entity PROPERTY names — the raw-column form
   * crashes with `TypeError: Cannot read properties of undefined (reading
   * 'databaseName')`, the exact bug
   * `BillInvoiceRepository.findOpenPaginated()`'s own doc comment already
   * found and documents; avoided here from the start by following that
   * precedent rather than rediscovering the crash.
   *
   * `method` filters via a raw `EXISTS` subquery against `pay_receipt_split`
   * (method lives on the SPLIT, not the receipt) rather than an `innerJoin`
   * — a receipt can carry two splits of the same method (e.g. two CASH
   * lines), which an `innerJoin` would fan out into duplicate receipt rows
   * under pagination; `EXISTS` never can.
   *
   * Phase 6 Slice 9 (Part B) — `q` filters via ILIKE against
   * `(first_name || ' ' || last_name)` (the plan's own literal spec),
   * `admission_no`, and — additionally OR'd in — the joined student's
   * `search_name` (the entity's own existing generated/GIN-trigram-indexed
   * column). See `BillInvoiceRepository.findOpenPaginated()`'s own doc
   * comment for why `search_name` is deliberately NOT the only clause: a
   * middle-name-less student's `search_name` has a real double space
   * between first/last name (`coalesce(middle_name,'')` still inserts a
   * blank token), which a naturally single-spaced `"first last"` query
   * would fail to ILIKE-match against — caught live by this method's own
   * sibling integration test's identical fix, applied here identically
   * before this ever shipped broken.
   */
  async findAllPaginated(
    filters: FindAllReceiptsFilters,
    pagination: { skip: number; take: number },
    manager?: EntityManager,
  ): Promise<{ items: PayReceiptEntity[]; total: number }> {
    const repo = manager?.getRepository(PayReceiptEntity) ?? this.repo;
    const qb = repo
      .createQueryBuilder("receipt")
      .leftJoinAndSelect("receipt.student", "student")
      .leftJoinAndSelect("receipt.cashier", "cashier");

    if (filters.studentId) qb.andWhere("receipt.student_id = :studentId", { studentId: filters.studentId });
    if (filters.cashierId) qb.andWhere("receipt.cashier_id = :cashierId", { cashierId: filters.cashierId });
    if (filters.dateFrom) qb.andWhere("receipt.receipt_date >= :dateFrom", { dateFrom: filters.dateFrom });
    if (filters.dateTo) qb.andWhere("receipt.receipt_date <= :dateTo", { dateTo: filters.dateTo });
    if (filters.method) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM app.pay_receipt_split split WHERE split.receipt_id = receipt.id AND split.method = :method)`,
        { method: filters.method },
      );
    }
    const trimmedQ = filters.q?.trim();
    if (trimmedQ) {
      qb.andWhere(
        "((student.first_name || ' ' || student.last_name) ILIKE :q OR student.search_name ILIKE :q OR student.admission_no ILIKE :q)",
        { q: `%${trimmedQ}%` },
      );
    }

    const [items, total] = await qb
      .orderBy("receipt.receiptDate", "DESC")
      .addOrderBy("receipt.createdAt", "DESC")
      .skip(pagination.skip)
      .take(pagination.take)
      .getManyAndCount();
    return { items, total };
  }
}
