import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { PayCashierSessionEntity } from "../domain/pay-cashier-session.entity";

/**
 * Plain repository wrapper for `pay_cashier_session`, plus
 * `findOpenForCashier()` — the BR-PAY-04 lookup ("cash receipts can only be
 * captured within an OPEN cashier session belonging to the capturing
 * cashier") the next pass's receipt-capture service will need immediately.
 */
@Injectable()
export class PayCashierSessionRepository {
  constructor(
    @InjectRepository(PayCashierSessionEntity)
    private readonly repo: Repository<PayCashierSessionEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<PayCashierSessionEntity | null> {
    return (manager?.getRepository(PayCashierSessionEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<PayCashierSessionEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("PayCashierSession", id);
    return row;
  }

  /** BR-PAY-04: the cashier's currently OPEN session, if any (at most one, enforced by `uq_pay_session_open_p`). */
  async findOpenForCashier(cashierId: string, manager?: EntityManager): Promise<PayCashierSessionEntity | null> {
    return (manager?.getRepository(PayCashierSessionEntity) ?? this.repo).findOne({
      where: { cashierId, status: "OPEN" },
    });
  }

  async create(data: Partial<PayCashierSessionEntity>, manager?: EntityManager): Promise<PayCashierSessionEntity> {
    const repo = manager?.getRepository(PayCashierSessionEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: PayCashierSessionEntity, manager?: EntityManager): Promise<PayCashierSessionEntity> {
    return (manager?.getRepository(PayCashierSessionEntity) ?? this.repo).save(entity);
  }
}
