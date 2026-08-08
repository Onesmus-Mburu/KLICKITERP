import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ProcVoucherAllocationEntity } from "../domain/proc-voucher-allocation.entity";

/** Plain repository wrapper for `proc_voucher_allocation`. */
@Injectable()
export class ProcVoucherAllocationRepository {
  constructor(
    @InjectRepository(ProcVoucherAllocationEntity)
    private readonly repo: Repository<ProcVoucherAllocationEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<ProcVoucherAllocationEntity | null> {
    return (manager?.getRepository(ProcVoucherAllocationEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<ProcVoucherAllocationEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("ProcVoucherAllocation", id);
    return row;
  }

  async findByVoucherId(voucherId: string, manager?: EntityManager): Promise<ProcVoucherAllocationEntity[]> {
    return (manager?.getRepository(ProcVoucherAllocationEntity) ?? this.repo).find({
      where: { voucherId },
      order: { createdAt: "ASC" },
    });
  }

  async findBySupplierInvoiceId(
    supplierInvoiceId: string,
    manager?: EntityManager,
  ): Promise<ProcVoucherAllocationEntity[]> {
    return (manager?.getRepository(ProcVoucherAllocationEntity) ?? this.repo).find({
      where: { supplierInvoiceId },
      order: { createdAt: "ASC" },
    });
  }

  async create(
    data: Partial<ProcVoucherAllocationEntity>,
    manager?: EntityManager,
  ): Promise<ProcVoucherAllocationEntity> {
    const repo = manager?.getRepository(ProcVoucherAllocationEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: ProcVoucherAllocationEntity, manager?: EntityManager): Promise<ProcVoucherAllocationEntity> {
    return (manager?.getRepository(ProcVoucherAllocationEntity) ?? this.repo).save(entity);
  }
}
