import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BillStudentCreditEntity } from "../domain/bill-student-credit.entity";

/**
 * Plain repository wrapper for `bill_student_credit`, plus
 * `findByStudentIdForUpdate()` — the load-bearing pessimistic row lock every
 * balance-mutating path in `StudentCreditService` uses, mirroring
 * `WallWalletRepository.findByIdForUpdate()`'s identical `SELECT ... FOR
 * UPDATE` locking discipline (via TypeORM's `lock: { mode:
 * "pessimistic_write" }`) exactly.
 */
@Injectable()
export class BillStudentCreditRepository {
  constructor(
    @InjectRepository(BillStudentCreditEntity)
    private readonly repo: Repository<BillStudentCreditEntity>,
  ) {}

  async findByStudentId(studentId: string, manager?: EntityManager): Promise<BillStudentCreditEntity | null> {
    return (manager?.getRepository(BillStudentCreditEntity) ?? this.repo).findOne({ where: { studentId } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BillStudentCreditEntity> {
    const row = await (manager?.getRepository(BillStudentCreditEntity) ?? this.repo).findOne({ where: { id } });
    if (!row) throw new NotFoundException("BillStudentCredit", id);
    return row;
  }

  /**
   * `SELECT ... FOR UPDATE` on the student's credit row — MUST be called
   * inside the caller's own open transaction (a lock only means something
   * inside one). Returns `null` (no lock taken — nothing to lock) when the
   * student has never had a `bill_student_credit` row provisioned yet;
   * callers that are about to INSERT the first row for a student (`issue()`)
   * simply proceed to create it, which is safe under this codebase's
   * existing "check-then-create, no retry-on-conflict" lazy-provisioning
   * precedent (`WalletsService.getOrCreateWallet()`).
   */
  async findByStudentIdForUpdate(em: EntityManager, studentId: string): Promise<BillStudentCreditEntity | null> {
    return em.getRepository(BillStudentCreditEntity).findOne({
      where: { studentId },
      lock: { mode: "pessimistic_write" },
    });
  }

  async create(data: Partial<BillStudentCreditEntity>, manager?: EntityManager): Promise<BillStudentCreditEntity> {
    const repo = manager?.getRepository(BillStudentCreditEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BillStudentCreditEntity, manager?: EntityManager): Promise<BillStudentCreditEntity> {
    return (manager?.getRepository(BillStudentCreditEntity) ?? this.repo).save(entity);
  }
}
