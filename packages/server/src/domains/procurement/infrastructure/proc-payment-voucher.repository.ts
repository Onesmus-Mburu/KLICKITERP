import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ProcPaymentVoucherEntity, ProcPaymentVoucherStatus } from "../domain/proc-payment-voucher.entity";

export interface ListProcPaymentVouchersFilter {
  status?: ProcPaymentVoucherStatus;
  supplierId?: string;
}

/** Plain repository wrapper for `proc_payment_voucher`. */
@Injectable()
export class ProcPaymentVoucherRepository {
  constructor(
    @InjectRepository(ProcPaymentVoucherEntity)
    private readonly repo: Repository<ProcPaymentVoucherEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<ProcPaymentVoucherEntity | null> {
    return (manager?.getRepository(ProcPaymentVoucherEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<ProcPaymentVoucherEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("ProcPaymentVoucher", id);
    return row;
  }

  async findByNumber(number: string, manager?: EntityManager): Promise<ProcPaymentVoucherEntity | null> {
    return (manager?.getRepository(ProcPaymentVoucherEntity) ?? this.repo).findOne({ where: { number } });
  }

  async list(
    filter: ListProcPaymentVouchersFilter = {},
    manager?: EntityManager,
  ): Promise<ProcPaymentVoucherEntity[]> {
    const where: Record<string, unknown> = {};
    if (filter.status !== undefined) where.status = filter.status;
    if (filter.supplierId !== undefined) where.supplierId = filter.supplierId;
    return (manager?.getRepository(ProcPaymentVoucherEntity) ?? this.repo).find({
      where,
      order: { createdAt: "DESC" },
    });
  }

  async create(data: Partial<ProcPaymentVoucherEntity>, manager?: EntityManager): Promise<ProcPaymentVoucherEntity> {
    const repo = manager?.getRepository(ProcPaymentVoucherEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: ProcPaymentVoucherEntity, manager?: EntityManager): Promise<ProcPaymentVoucherEntity> {
    return (manager?.getRepository(ProcPaymentVoucherEntity) ?? this.repo).save(entity);
  }
}
