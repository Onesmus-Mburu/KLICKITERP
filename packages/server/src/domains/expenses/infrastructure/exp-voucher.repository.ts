import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ExpVoucherEntity, ExpVoucherStatus } from "../domain/exp-voucher.entity";

/** Plain repository wrapper for `exp_voucher`. */
@Injectable()
export class ExpVoucherRepository {
  constructor(
    @InjectRepository(ExpVoucherEntity)
    private readonly repo: Repository<ExpVoucherEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<ExpVoucherEntity | null> {
    return (manager?.getRepository(ExpVoucherEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<ExpVoucherEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("ExpVoucher", id);
    return row;
  }

  async findByNumber(number: string, manager?: EntityManager): Promise<ExpVoucherEntity | null> {
    return (manager?.getRepository(ExpVoucherEntity) ?? this.repo).findOne({ where: { number } });
  }

  /** Forward-looking finder for the next pass's voucher listing/approval-queue endpoints. */
  async listByStatus(status: ExpVoucherStatus, manager?: EntityManager): Promise<ExpVoucherEntity[]> {
    return (manager?.getRepository(ExpVoucherEntity) ?? this.repo).find({
      where: { status },
      order: { createdAt: "DESC" },
    });
  }

  async listAll(manager?: EntityManager): Promise<ExpVoucherEntity[]> {
    return (manager?.getRepository(ExpVoucherEntity) ?? this.repo).find({ order: { createdAt: "DESC" } });
  }

  async create(data: Partial<ExpVoucherEntity>, manager?: EntityManager): Promise<ExpVoucherEntity> {
    const repo = manager?.getRepository(ExpVoucherEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: ExpVoucherEntity, manager?: EntityManager): Promise<ExpVoucherEntity> {
    return (manager?.getRepository(ExpVoucherEntity) ?? this.repo).save(entity);
  }
}
