import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { BillRefundVoucherEntity } from "../domain/bill-refund-voucher.entity";

@Injectable()
export class BillRefundVoucherRepository {
  constructor(
    @InjectRepository(BillRefundVoucherEntity)
    private readonly repo: Repository<BillRefundVoucherEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<BillRefundVoucherEntity | null> {
    return (manager?.getRepository(BillRefundVoucherEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<BillRefundVoucherEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("BillRefundVoucher", id);
    return row;
  }

  async findByNumber(number: string, manager?: EntityManager): Promise<BillRefundVoucherEntity | null> {
    return (manager?.getRepository(BillRefundVoucherEntity) ?? this.repo).findOne({ where: { number } });
  }

  async listByStudent(studentId: string, manager?: EntityManager): Promise<BillRefundVoucherEntity[]> {
    return (manager?.getRepository(BillRefundVoucherEntity) ?? this.repo).find({ where: { studentId } });
  }

  async create(data: Partial<BillRefundVoucherEntity>, manager?: EntityManager): Promise<BillRefundVoucherEntity> {
    const repo = manager?.getRepository(BillRefundVoucherEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: BillRefundVoucherEntity, manager?: EntityManager): Promise<BillRefundVoucherEntity> {
    return (manager?.getRepository(BillRefundVoucherEntity) ?? this.repo).save(entity);
  }
}
