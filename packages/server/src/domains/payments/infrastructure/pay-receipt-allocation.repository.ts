import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { PayReceiptAllocationEntity } from "../domain/pay-receipt-allocation.entity";

@Injectable()
export class PayReceiptAllocationRepository {
  constructor(
    @InjectRepository(PayReceiptAllocationEntity)
    private readonly repo: Repository<PayReceiptAllocationEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<PayReceiptAllocationEntity | null> {
    return (manager?.getRepository(PayReceiptAllocationEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<PayReceiptAllocationEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("PayReceiptAllocation", id);
    return row;
  }

  async listByReceipt(receiptId: string, manager?: EntityManager): Promise<PayReceiptAllocationEntity[]> {
    return (manager?.getRepository(PayReceiptAllocationEntity) ?? this.repo).find({ where: { receiptId } });
  }

  async listByInvoice(invoiceId: string, manager?: EntityManager): Promise<PayReceiptAllocationEntity[]> {
    return (manager?.getRepository(PayReceiptAllocationEntity) ?? this.repo).find({ where: { invoiceId } });
  }

  async create(
    data: Partial<PayReceiptAllocationEntity>,
    manager?: EntityManager,
  ): Promise<PayReceiptAllocationEntity> {
    const repo = manager?.getRepository(PayReceiptAllocationEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }
}
