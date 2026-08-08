import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BillConcessionEntity } from "../domain/bill-concession.entity";

@Injectable()
export class BillConcessionRepository {
  constructor(
    @InjectRepository(BillConcessionEntity)
    private readonly repo: Repository<BillConcessionEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BillConcessionEntity | null> {
    return (manager?.getRepository(BillConcessionEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BillConcessionEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BillConcession", id);
    return row;
  }

  async listByInvoice(invoiceId: string, manager?: EntityManager): Promise<BillConcessionEntity[]> {
    return (manager?.getRepository(BillConcessionEntity) ?? this.repo).find({ where: { invoiceId } });
  }

  async listByStudent(studentId: string, manager?: EntityManager): Promise<BillConcessionEntity[]> {
    return (manager?.getRepository(BillConcessionEntity) ?? this.repo).find({ where: { studentId } });
  }

  async create(data: Partial<BillConcessionEntity>, manager?: EntityManager): Promise<BillConcessionEntity> {
    const repo = manager?.getRepository(BillConcessionEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BillConcessionEntity, manager?: EntityManager): Promise<BillConcessionEntity> {
    return (manager?.getRepository(BillConcessionEntity) ?? this.repo).save(entity);
  }
}
