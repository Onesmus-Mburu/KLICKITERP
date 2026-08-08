import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ExpPettyCashVoucherEntity, ExpPettyCashVoucherStatus } from "../domain/exp-petty-cash-voucher.entity";

/** Plain repository wrapper for `exp_petty_cash_voucher`. */
@Injectable()
export class ExpPettyCashVoucherRepository {
  constructor(
    @InjectRepository(ExpPettyCashVoucherEntity)
    private readonly repo: Repository<ExpPettyCashVoucherEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<ExpPettyCashVoucherEntity | null> {
    return (manager?.getRepository(ExpPettyCashVoucherEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<ExpPettyCashVoucherEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("ExpPettyCashVoucher", id);
    return row;
  }

  async findByNumber(number: string, manager?: EntityManager): Promise<ExpPettyCashVoucherEntity | null> {
    return (manager?.getRepository(ExpPettyCashVoucherEntity) ?? this.repo).findOne({ where: { number } });
  }

  async listByFloatId(
    floatId: string,
    status?: ExpPettyCashVoucherStatus,
    manager?: EntityManager,
  ): Promise<ExpPettyCashVoucherEntity[]> {
    const where: Record<string, unknown> = { floatId };
    if (status !== undefined) where.status = status;
    return (manager?.getRepository(ExpPettyCashVoucherEntity) ?? this.repo).find({
      where,
      order: { createdAt: "DESC" },
    });
  }

  async create(
    data: Partial<ExpPettyCashVoucherEntity>,
    manager?: EntityManager,
  ): Promise<ExpPettyCashVoucherEntity> {
    const repo = manager?.getRepository(ExpPettyCashVoucherEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: ExpPettyCashVoucherEntity, manager?: EntityManager): Promise<ExpPettyCashVoucherEntity> {
    return (manager?.getRepository(ExpPettyCashVoucherEntity) ?? this.repo).save(entity);
  }
}
