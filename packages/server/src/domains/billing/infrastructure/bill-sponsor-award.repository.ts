import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BillSponsorAwardEntity } from "../domain/bill-sponsor-award.entity";

/**
 * Plain repository wrapper for `bill_sponsor_award`, plus
 * `findActiveForStudent()` — the sponsor-allocation lookup the next pass's
 * `PostingService`-driven award-application service will need immediately:
 * every award for a student in a term that still has unapplied balance
 * (`applied_amount < amount`).
 */
@Injectable()
export class BillSponsorAwardRepository {
  constructor(
    @InjectRepository(BillSponsorAwardEntity)
    private readonly repo: Repository<BillSponsorAwardEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BillSponsorAwardEntity | null> {
    return (manager?.getRepository(BillSponsorAwardEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BillSponsorAwardEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BillSponsorAward", id);
    return row;
  }

  async listByStudent(studentId: string, manager?: EntityManager): Promise<BillSponsorAwardEntity[]> {
    return (manager?.getRepository(BillSponsorAwardEntity) ?? this.repo).find({ where: { studentId } });
  }

  async create(data: Partial<BillSponsorAwardEntity>, manager?: EntityManager): Promise<BillSponsorAwardEntity> {
    const repo = manager?.getRepository(BillSponsorAwardEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BillSponsorAwardEntity, manager?: EntityManager): Promise<BillSponsorAwardEntity> {
    return (manager?.getRepository(BillSponsorAwardEntity) ?? this.repo).save(entity);
  }

  /**
   * Every award for a (student, term) with unapplied balance
   * (`applied_amount < amount`) — a raw `QueryBuilder` comparison since both
   * columns carry a `Money` transformer (see `BillInvoiceRepository.findOpenForStudent()`'s
   * doc comment for why `MoreThan()`/`LessThan()` don't apply here).
   */
  async findActiveForStudent(
    studentId: string,
    termId: string,
    manager?: EntityManager,
  ): Promise<BillSponsorAwardEntity[]> {
    const repo = manager?.getRepository(BillSponsorAwardEntity) ?? this.repo;
    return repo
      .createQueryBuilder("award")
      .where("award.student_id = :studentId", { studentId })
      .andWhere("award.term_id = :termId", { termId })
      .andWhere("award.applied_amount < award.amount")
      .getMany();
  }
}
