import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { PayChequeEntity } from "../domain/pay-cheque.entity";

/**
 * Plain repository wrapper for `pay_cheque`, plus `findUncleared()` — the
 * next pass's cheque-clearing batch job's working set (FR-PAY-007.1).
 */
@Injectable()
export class PayChequeRepository {
  constructor(
    @InjectRepository(PayChequeEntity)
    private readonly repo: Repository<PayChequeEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<PayChequeEntity | null> {
    return (manager?.getRepository(PayChequeEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<PayChequeEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("PayCheque", id);
    return row;
  }

  async findUncleared(manager?: EntityManager): Promise<PayChequeEntity[]> {
    return (manager?.getRepository(PayChequeEntity) ?? this.repo).find({ where: { status: "UNCLEARED" } });
  }

  async create(data: Partial<PayChequeEntity>, manager?: EntityManager): Promise<PayChequeEntity> {
    const repo = manager?.getRepository(PayChequeEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: PayChequeEntity, manager?: EntityManager): Promise<PayChequeEntity> {
    return (manager?.getRepository(PayChequeEntity) ?? this.repo).save(entity);
  }
}
