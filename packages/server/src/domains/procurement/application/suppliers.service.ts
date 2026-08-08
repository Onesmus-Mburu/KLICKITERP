import { Injectable } from "@nestjs/common";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { ProcSupplierEntity, ProcSupplierStatus } from "../domain/proc-supplier.entity";
import { ListProcSuppliersFilter, ProcSupplierRepository } from "../infrastructure/proc-supplier.repository";

export interface CreateSupplierInput {
  name: string;
  tradingName?: string | null;
  kraPin?: string | null;
  contacts?: Record<string, unknown>;
  paymentDetails?: Record<string, unknown>;
  categories?: string[];
  paymentTermsDays?: number;
}

export interface UpdateSupplierInput {
  name?: string;
  tradingName?: string | null;
  kraPin?: string | null;
  contacts?: Record<string, unknown>;
  paymentDetails?: Record<string, unknown>;
  categories?: string[];
  paymentTermsDays?: number;
}

/**
 * CRUD for `proc_supplier` + `search()`/`blacklist()`/`reactivate()`.
 *
 * **BR-PROC-05 enforcement lives in `PurchaseOrdersService`, not here** — per
 * the task brief's explicit instruction: "blacklisted suppliers block NEW
 * POs" is a cross-entity check (does the supplier being referenced by a new
 * PO carry `status='BLACKLISTED'`?) that belongs where the PO is created,
 * not duplicated here; `blacklist()`/`reactivate()` only manage this
 * entity's own `status`/`blacklist_reason` columns.
 *
 * `ratingDelivery`/`ratingQuality`/`ratingManual` are deliberately untouched
 * by this service — FR-PROC-011.1's "auto-metrics (on-time delivery %,
 * rejection rate) + manual 1-5 scores" is scoped to Pass B ("supplier
 * ratings" in the task brief's own Pass-B list).
 */
@Injectable()
export class SuppliersService {
  constructor(private readonly supplierRepository: ProcSupplierRepository) {}

  async create(input: CreateSupplierInput, actorId: string | null): Promise<ProcSupplierEntity> {
    if (await this.supplierRepository.findByName(input.name)) {
      throw new ConflictException(`proc_supplier name already in use: ${input.name}`);
    }
    return this.supplierRepository.create({
      name: input.name,
      tradingName: input.tradingName ?? null,
      kraPin: input.kraPin ?? null,
      contacts: input.contacts ?? {},
      paymentDetails: input.paymentDetails ?? {},
      categories: input.categories ?? [],
      paymentTermsDays: input.paymentTermsDays ?? 30,
      status: "ACTIVE",
      blacklistReason: null,
      ratingDelivery: null,
      ratingQuality: null,
      ratingManual: null,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async findByIdOrFail(id: string): Promise<ProcSupplierEntity> {
    return this.supplierRepository.findByIdOrFail(id);
  }

  async list(filter: ListProcSuppliersFilter = {}): Promise<ProcSupplierEntity[]> {
    return this.supplierRepository.list(filter);
  }

  /** Trigram search against `name` (`ix_proc_supplier_name_trgm`) — see `ProcSupplierRepository.searchByName()`. */
  async search(query: string, limit = 20): Promise<ProcSupplierEntity[]> {
    return this.supplierRepository.searchByName(query, limit);
  }

  async update(id: string, changes: UpdateSupplierInput, actorId: string | null): Promise<ProcSupplierEntity> {
    const supplier = await this.supplierRepository.findByIdOrFail(id);
    if (changes.name !== undefined && changes.name !== supplier.name) {
      if (await this.supplierRepository.findByName(changes.name)) {
        throw new ConflictException(`proc_supplier name already in use: ${changes.name}`);
      }
      supplier.name = changes.name;
    }
    if (changes.tradingName !== undefined) supplier.tradingName = changes.tradingName;
    if (changes.kraPin !== undefined) supplier.kraPin = changes.kraPin;
    if (changes.contacts !== undefined) supplier.contacts = changes.contacts;
    if (changes.paymentDetails !== undefined) supplier.paymentDetails = changes.paymentDetails;
    if (changes.categories !== undefined) supplier.categories = changes.categories;
    if (changes.paymentTermsDays !== undefined) supplier.paymentTermsDays = changes.paymentTermsDays;
    supplier.updatedBy = actorId;
    return this.supplierRepository.save(supplier);
  }

  /** BR-PROC-05: flips ACTIVE/INACTIVE -> BLACKLISTED. Existing obligations (open POs/invoices) remain payable — this method only touches this supplier's own row. */
  async blacklist(supplierId: string, reason: string, actorId: string | null = null): Promise<ProcSupplierEntity> {
    const supplier = await this.supplierRepository.findByIdOrFail(supplierId);
    if (supplier.status === "BLACKLISTED") {
      throw new ValidationException(`Supplier ${supplierId} is already BLACKLISTED`);
    }
    if (!reason || reason.trim().length === 0) {
      throw new ValidationException("blacklist() requires a non-empty reason");
    }
    supplier.status = "BLACKLISTED" as ProcSupplierStatus;
    supplier.blacklistReason = reason;
    supplier.updatedBy = actorId;
    return this.supplierRepository.save(supplier);
  }

  /** BLACKLISTED -> ACTIVE, clearing `blacklist_reason`. */
  async reactivate(supplierId: string, actorId: string | null = null): Promise<ProcSupplierEntity> {
    const supplier = await this.supplierRepository.findByIdOrFail(supplierId);
    if (supplier.status !== "BLACKLISTED") {
      throw new ValidationException(`Supplier ${supplierId} is not BLACKLISTED (status=${supplier.status})`);
    }
    supplier.status = "ACTIVE" as ProcSupplierStatus;
    supplier.blacklistReason = null;
    supplier.updatedBy = actorId;
    return this.supplierRepository.save(supplier);
  }
}
