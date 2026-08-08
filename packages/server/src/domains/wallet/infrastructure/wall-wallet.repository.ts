import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { WallWalletEntity } from "../domain/wall-wallet.entity";

/**
 * Plain repository wrapper for `wall_wallet`, plus `findByIdForUpdate()` —
 * the load-bearing pessimistic row lock every debit/credit path in
 * `WalletTransactionsService` uses (BR-WALL-01/02), mirroring
 * `NumberingService.allocate()`/`PostingService`'s `findOneForUpdate()`
 * locking discipline exactly (`SELECT ... FOR UPDATE` via TypeORM's
 * `lock: { mode: "pessimistic_write" }`).
 */
@Injectable()
export class WallWalletRepository {
  constructor(
    @InjectRepository(WallWalletEntity)
    private readonly repo: Repository<WallWalletEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<WallWalletEntity | null> {
    return (manager?.getRepository(WallWalletEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<WallWalletEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("WallWallet", id);
    return row;
  }

  async findByStudentId(studentId: string, manager?: EntityManager): Promise<WallWalletEntity | null> {
    return (manager?.getRepository(WallWalletEntity) ?? this.repo).findOne({ where: { studentId } });
  }

  /**
   * `SELECT ... FOR UPDATE` on the wallet row — MUST be called inside the
   * caller's own open transaction (a lock only means something inside one).
   * `WalletTransactionsService.transferToWallet()` calls this twice, once per
   * side, always in ascending-id order (see that method's own doc comment)
   * to prevent a deadlock between two concurrent opposite-direction
   * transfers.
   */
  async findByIdForUpdate(em: EntityManager, id: string): Promise<WallWalletEntity | null> {
    return em.getRepository(WallWalletEntity).findOne({
      where: { id },
      lock: { mode: "pessimistic_write" },
    });
  }

  async listAll(manager?: EntityManager): Promise<WallWalletEntity[]> {
    return (manager?.getRepository(WallWalletEntity) ?? this.repo).find();
  }

  async create(data: Partial<WallWalletEntity>, manager?: EntityManager): Promise<WallWalletEntity> {
    const repo = manager?.getRepository(WallWalletEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: WallWalletEntity, manager?: EntityManager): Promise<WallWalletEntity> {
    return (manager?.getRepository(WallWalletEntity) ?? this.repo).save(entity);
  }

  /**
   * Phase 6 Slice 11 (Part 2) — the new Wallets list screen's paginated,
   * joined query. Mirrors `BillInvoiceRepository.findOpenPaginated()`
   * (Slice 8 Part 2) / `PayReceiptRepository.findAllPaginated()` (Slice 8
   * Part 4)'s exact join+ILIKE+paginate shape:
   *
   *  - Joined via `wallet.student` — the entity's own pre-existing
   *    `ManyToOne` relation (`WallWalletEntity.student`), not a hand-written
   *    raw SQL join: a to-one relation never fans out rows, so
   *    `getManyAndCount()`'s count stays correct under `skip`/`take`.
   *  - `q` ILIKE-matched against `(student.first_name || ' ' ||
   *    student.last_name)`, `student.search_name`, AND `student.admission_no`
   *    (OR'd) — the plain concat is required ALONGSIDE `search_name` (not
   *    instead of it), per `findOpenPaginated()`'s own doc comment: for a
   *    student with no middle name, `search_name`'s
   *    `coalesce(middle_name,'') || ' '` still inserts a blank token,
   *    producing a double space that breaks a naturally single-spaced typed
   *    query's ILIKE substring match.
   *  - Ordered by the joined student's name (ascending) — `wall_wallet` has
   *    no natural date/document-number column of its own to sort by (unlike
   *    an invoice's `due_date` or a receipt's `receipt_date`), and an
   *    alphabetical-by-student list is the more browsable default for this
   *    screen. Property-path form (`student.firstName`/`student.lastName`,
   *    not the raw `student.first_name`/`student.last_name` column names) —
   *    REQUIRED here, not stylistic: with `leftJoinAndSelect()` in play,
   *    TypeORM's pagination fix-up (`createOrderByCombinedWithSelectExpression()`,
   *    triggered by `skip()`/`take()` alongside a join) resolves `orderBy`
   *    entries via `alias.metadata.findColumnWithPropertyPath(propertyPath)`,
   *    which only recognizes entity PROPERTY names — see
   *    `findOpenPaginated()`'s own doc comment for the real crash this
   *    caused there when the raw-column form was tried first.
   */
  async findAllPaginated(
    filters: { q?: string },
    pagination: { skip: number; take: number },
    manager?: EntityManager,
  ): Promise<{ items: WallWalletEntity[]; total: number }> {
    const repo = manager?.getRepository(WallWalletEntity) ?? this.repo;
    const qb = repo.createQueryBuilder("wallet").leftJoinAndSelect("wallet.student", "student");
    const trimmedQ = filters.q?.trim();
    if (trimmedQ) {
      qb.andWhere(
        "((student.first_name || ' ' || student.last_name) ILIKE :q OR student.search_name ILIKE :q OR student.admission_no ILIKE :q)",
        { q: `%${trimmedQ}%` },
      );
    }
    const [items, total] = await qb
      .orderBy("student.firstName", "ASC")
      .addOrderBy("student.lastName", "ASC")
      .skip(pagination.skip)
      .take(pagination.take)
      .getManyAndCount();
    return { items, total };
  }
}
