import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { PayMpesaTransactionEntity } from "../domain/pay-mpesa-transaction.entity";

/**
 * Plain repository wrapper for `pay_mpesa_transaction`, plus
 * `findByMpesaRef()`/`findByCheckoutRequestId()` — BR-PAY-06's global
 * uniqueness lookup and the STK callback-correlation lookup the next pass's
 * M-Pesa STK/C2B/B2C handling will need immediately.
 */
@Injectable()
export class PayMpesaTransactionRepository {
  constructor(
    @InjectRepository(PayMpesaTransactionEntity)
    private readonly repo: Repository<PayMpesaTransactionEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<PayMpesaTransactionEntity | null> {
    return (manager?.getRepository(PayMpesaTransactionEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<PayMpesaTransactionEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("PayMpesaTransaction", id);
    return row;
  }

  /** BR-PAY-06: global uniqueness of a confirmed M-Pesa reference. */
  async findByMpesaRef(mpesaRef: string, manager?: EntityManager): Promise<PayMpesaTransactionEntity | null> {
    return (manager?.getRepository(PayMpesaTransactionEntity) ?? this.repo).findOne({ where: { mpesaRef } });
  }

  /** STK callback correlation (FR-PAY-008.1). */
  async findByCheckoutRequestId(
    checkoutRequestId: string,
    manager?: EntityManager,
  ): Promise<PayMpesaTransactionEntity | null> {
    return (manager?.getRepository(PayMpesaTransactionEntity) ?? this.repo).findOne({
      where: { checkoutRequestId },
    });
  }

  async findByConversationId(
    conversationId: string,
    manager?: EntityManager,
  ): Promise<PayMpesaTransactionEntity | null> {
    return (manager?.getRepository(PayMpesaTransactionEntity) ?? this.repo).findOne({ where: { conversationId } });
  }

  /** `ix_pay_mpesa_state_p` fallback sweep (FR-PAY-008.1: STK status-query at +2 min before marking FAILED). */
  async listOpen(manager?: EntityManager): Promise<PayMpesaTransactionEntity[]> {
    const repo = manager?.getRepository(PayMpesaTransactionEntity) ?? this.repo;
    return repo
      .createQueryBuilder("txn")
      .where("txn.state IN (:...states)", { states: ["INITIATED", "PENDING"] })
      .getMany();
  }

  async create(data: Partial<PayMpesaTransactionEntity>, manager?: EntityManager): Promise<PayMpesaTransactionEntity> {
    const repo = manager?.getRepository(PayMpesaTransactionEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: PayMpesaTransactionEntity, manager?: EntityManager): Promise<PayMpesaTransactionEntity> {
    return (manager?.getRepository(PayMpesaTransactionEntity) ?? this.repo).save(entity);
  }
}
