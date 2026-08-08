import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import {
  PROC_SUPPLIER_INVOICE_OPEN_STATUSES,
  ProcSupplierInvoiceEntity,
  ProcSupplierInvoiceStatus,
} from "../domain/proc-supplier-invoice.entity";

export interface ListProcSupplierInvoicesFilter {
  status?: ProcSupplierInvoiceStatus;
  supplierId?: string;
}

/** Plain repository wrapper for `proc_supplier_invoice`, plus `findOpenForSupplier()` (BR-PROC-04). */
@Injectable()
export class ProcSupplierInvoiceRepository {
  constructor(
    @InjectRepository(ProcSupplierInvoiceEntity)
    private readonly repo: Repository<ProcSupplierInvoiceEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<ProcSupplierInvoiceEntity | null> {
    return (manager?.getRepository(ProcSupplierInvoiceEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<ProcSupplierInvoiceEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("ProcSupplierInvoice", id);
    return row;
  }

  async findByNumber(number: string, manager?: EntityManager): Promise<ProcSupplierInvoiceEntity | null> {
    return (manager?.getRepository(ProcSupplierInvoiceEntity) ?? this.repo).findOne({ where: { number } });
  }

  async list(
    filter: ListProcSupplierInvoicesFilter = {},
    manager?: EntityManager,
  ): Promise<ProcSupplierInvoiceEntity[]> {
    const where: Record<string, unknown> = {};
    if (filter.status !== undefined) where.status = filter.status;
    if (filter.supplierId !== undefined) where.supplierId = filter.supplierId;
    return (manager?.getRepository(ProcSupplierInvoiceEntity) ?? this.repo).find({
      where,
      order: { dueDate: "ASC" },
    });
  }

  /**
   * Open (POSTED/PARTIALLY_PAID) invoices for a supplier — the
   * `ix_proc_inv_supplier_open` partial index's own lookup, BR-PROC-04's
   * "supplier payments may not exceed the open invoice balance" check.
   */
  async findOpenForSupplier(supplierId: string, manager?: EntityManager): Promise<ProcSupplierInvoiceEntity[]> {
    return (manager?.getRepository(ProcSupplierInvoiceEntity) ?? this.repo)
      .createQueryBuilder("inv")
      .where("inv.supplierId = :supplierId", { supplierId })
      .andWhere("inv.status IN (:...statuses)", { statuses: PROC_SUPPLIER_INVOICE_OPEN_STATUSES })
      .orderBy("inv.dueDate", "ASC")
      .getMany();
  }

  async create(
    data: Partial<ProcSupplierInvoiceEntity>,
    manager?: EntityManager,
  ): Promise<ProcSupplierInvoiceEntity> {
    const repo = manager?.getRepository(ProcSupplierInvoiceEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: ProcSupplierInvoiceEntity, manager?: EntityManager): Promise<ProcSupplierInvoiceEntity> {
    return (manager?.getRepository(ProcSupplierInvoiceEntity) ?? this.repo).save(entity);
  }
}
