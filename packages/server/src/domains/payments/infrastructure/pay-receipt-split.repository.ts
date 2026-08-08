import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { PayReceiptSplitEntity } from "../domain/pay-receipt-split.entity";

@Injectable()
export class PayReceiptSplitRepository {
  constructor(
    @InjectRepository(PayReceiptSplitEntity)
    private readonly repo: Repository<PayReceiptSplitEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<PayReceiptSplitEntity | null> {
    return (manager?.getRepository(PayReceiptSplitEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<PayReceiptSplitEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("PayReceiptSplit", id);
    return row;
  }

  async listByReceipt(receiptId: string, manager?: EntityManager): Promise<PayReceiptSplitEntity[]> {
    return (manager?.getRepository(PayReceiptSplitEntity) ?? this.repo).find({ where: { receiptId } });
  }

  /** Module 10 PASS B — `ChequesService.bounce()`'s lookup from a `pay_cheque.id` back to the split(s) referencing it (at most one in practice, since a cheque row is created fresh per CHEQUE split at capture time — see `PayChequeEntity`'s doc comment). */
  async listByChequeId(chequeId: string, manager?: EntityManager): Promise<PayReceiptSplitEntity[]> {
    return (manager?.getRepository(PayReceiptSplitEntity) ?? this.repo).find({ where: { chequeId } });
  }

  async create(data: Partial<PayReceiptSplitEntity>, manager?: EntityManager): Promise<PayReceiptSplitEntity> {
    const repo = manager?.getRepository(PayReceiptSplitEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }
}
