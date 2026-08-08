import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BillInstallmentEntity } from "../domain/bill-installment.entity";

@Injectable()
export class BillInstallmentRepository {
  constructor(
    @InjectRepository(BillInstallmentEntity)
    private readonly repo: Repository<BillInstallmentEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BillInstallmentEntity | null> {
    return (manager?.getRepository(BillInstallmentEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BillInstallmentEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BillInstallment", id);
    return row;
  }

  async listByInvoice(invoiceId: string, manager?: EntityManager): Promise<BillInstallmentEntity[]> {
    return (manager?.getRepository(BillInstallmentEntity) ?? this.repo).find({
      where: { invoiceId },
      order: { seq: "ASC" },
    });
  }

  async create(data: Partial<BillInstallmentEntity>, manager?: EntityManager): Promise<BillInstallmentEntity> {
    const repo = manager?.getRepository(BillInstallmentEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BillInstallmentEntity, manager?: EntityManager): Promise<BillInstallmentEntity> {
    return (manager?.getRepository(BillInstallmentEntity) ?? this.repo).save(entity);
  }
}
