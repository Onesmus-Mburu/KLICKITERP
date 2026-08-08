import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ProcPurchaseOrderEntity, ProcPurchaseOrderStatus } from "../domain/proc-purchase-order.entity";

export interface ListProcPurchaseOrdersFilter {
  status?: ProcPurchaseOrderStatus;
  supplierId?: string;
}

/** Statuses `findOpenForSupplier()` treats as "still open" (issued but not yet fully closed out). */
const OPEN_PO_STATUSES: readonly ProcPurchaseOrderStatus[] = ["ISSUED", "PARTIALLY_RECEIVED"];

/** Plain repository wrapper for `proc_purchase_order`, plus `findOpenForSupplier()`. */
@Injectable()
export class ProcPurchaseOrderRepository {
  constructor(
    @InjectRepository(ProcPurchaseOrderEntity)
    private readonly repo: Repository<ProcPurchaseOrderEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<ProcPurchaseOrderEntity | null> {
    return (manager?.getRepository(ProcPurchaseOrderEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<ProcPurchaseOrderEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("ProcPurchaseOrder", id);
    return row;
  }

  async findByNumber(number: string, manager?: EntityManager): Promise<ProcPurchaseOrderEntity | null> {
    return (manager?.getRepository(ProcPurchaseOrderEntity) ?? this.repo).findOne({ where: { number } });
  }

  async list(
    filter: ListProcPurchaseOrdersFilter = {},
    manager?: EntityManager,
  ): Promise<ProcPurchaseOrderEntity[]> {
    const where: Record<string, unknown> = {};
    if (filter.status !== undefined) where.status = filter.status;
    if (filter.supplierId !== undefined) where.supplierId = filter.supplierId;
    return (manager?.getRepository(ProcPurchaseOrderEntity) ?? this.repo).find({
      where,
      order: { orderDate: "DESC" },
    });
  }

  /** Purchase orders still open (ISSUED/PARTIALLY_RECEIVED) for a supplier — GRN receiving/3-way-match lookups. */
  async findOpenForSupplier(supplierId: string, manager?: EntityManager): Promise<ProcPurchaseOrderEntity[]> {
    return (manager?.getRepository(ProcPurchaseOrderEntity) ?? this.repo)
      .createQueryBuilder("po")
      .where("po.supplierId = :supplierId", { supplierId })
      .andWhere("po.status IN (:...statuses)", { statuses: OPEN_PO_STATUSES })
      .orderBy("po.orderDate", "ASC")
      .getMany();
  }

  async create(data: Partial<ProcPurchaseOrderEntity>, manager?: EntityManager): Promise<ProcPurchaseOrderEntity> {
    const repo = manager?.getRepository(ProcPurchaseOrderEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: ProcPurchaseOrderEntity, manager?: EntityManager): Promise<ProcPurchaseOrderEntity> {
    return (manager?.getRepository(ProcPurchaseOrderEntity) ?? this.repo).save(entity);
  }
}
