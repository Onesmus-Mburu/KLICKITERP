import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { BillStudentCreditEntryEntity } from "../domain/bill-student-credit-entry.entity";

/** Plain repository wrapper for the append-only `bill_student_credit_entry` ledger — `create()` only, mirroring `wall_transaction`'s own repository (no `save()` on an existing row — see that entity's doc comment). */
@Injectable()
export class BillStudentCreditEntryRepository {
  constructor(
    @InjectRepository(BillStudentCreditEntryEntity)
    private readonly repo: Repository<BillStudentCreditEntryEntity>,
  ) {}

  async create(data: Partial<BillStudentCreditEntryEntity>, manager?: EntityManager): Promise<BillStudentCreditEntryEntity> {
    const repo = manager?.getRepository(BillStudentCreditEntryEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  /** Newest-first — Part E's future student-detail "Credit Balance" card history, if it ever grows one; also directly useful for this pass's own Jest specs. */
  async listByStudent(studentId: string, manager?: EntityManager): Promise<BillStudentCreditEntryEntity[]> {
    return (manager?.getRepository(BillStudentCreditEntryEntity) ?? this.repo).find({
      where: { studentId },
      order: { createdAt: "DESC" },
    });
  }
}
