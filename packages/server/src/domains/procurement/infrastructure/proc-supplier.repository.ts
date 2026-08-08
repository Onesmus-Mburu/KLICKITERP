import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ProcSupplierEntity, ProcSupplierStatus } from "../domain/proc-supplier.entity";

export interface ListProcSuppliersFilter {
  status?: ProcSupplierStatus;
}

/** Raw-row shape returned by `searchByName()`'s hand-written SQL — snake_case, matching `app.proc_supplier`'s columns 1:1. */
interface RawProcSupplierSearchRow {
  id: string;
  name: string;
  trading_name: string | null;
  kra_pin: string | null;
  contacts: Record<string, unknown>;
  payment_details: Record<string, unknown>;
  categories: string[];
  payment_terms_days: number;
  status: ProcSupplierStatus;
  blacklist_reason: string | null;
  rating_delivery: string | null;
  rating_quality: string | null;
  rating_manual: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  version: number;
  relevance: number;
}

function mapRawSearchRow(row: RawProcSupplierSearchRow): ProcSupplierEntity {
  return {
    id: row.id,
    name: row.name,
    tradingName: row.trading_name,
    kraPin: row.kra_pin,
    contacts: row.contacts,
    paymentDetails: row.payment_details,
    categories: row.categories,
    paymentTermsDays: row.payment_terms_days,
    status: row.status,
    blacklistReason: row.blacklist_reason,
    ratingDelivery: row.rating_delivery,
    ratingQuality: row.rating_quality,
    ratingManual: row.rating_manual,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    version: row.version,
  } as ProcSupplierEntity;
}

/**
 * Plain repository wrapper for `proc_supplier`, plus `searchByName()` — a
 * real trigram search against `ix_proc_supplier_name_trgm` (migration
 * `0100`), the same `pg_trgm` `%` similarity pattern
 * `StdStudentRepository.searchByNameOrAdmissionNo()` established for the
 * FR-PAY-002-style cashier lookup, applied here to procurement's own
 * supplier-lookup use case (quotation entry, PO creation).
 */
@Injectable()
export class ProcSupplierRepository {
  constructor(
    @InjectRepository(ProcSupplierEntity)
    private readonly repo: Repository<ProcSupplierEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<ProcSupplierEntity | null> {
    return (manager?.getRepository(ProcSupplierEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<ProcSupplierEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("ProcSupplier", id);
    return row;
  }

  async findByName(name: string, manager?: EntityManager): Promise<ProcSupplierEntity | null> {
    return (manager?.getRepository(ProcSupplierEntity) ?? this.repo).findOne({ where: { name } });
  }

  async list(filter: ListProcSuppliersFilter = {}, manager?: EntityManager): Promise<ProcSupplierEntity[]> {
    const where: Record<string, unknown> = {};
    if (filter.status !== undefined) where.status = filter.status;
    return (manager?.getRepository(ProcSupplierEntity) ?? this.repo).find({ where, order: { name: "ASC" } });
  }

  async create(data: Partial<ProcSupplierEntity>, manager?: EntityManager): Promise<ProcSupplierEntity> {
    const repo = manager?.getRepository(ProcSupplierEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  async save(entity: ProcSupplierEntity, manager?: EntityManager): Promise<ProcSupplierEntity> {
    return (manager?.getRepository(ProcSupplierEntity) ?? this.repo).save(entity);
  }

  /**
   * Trigram similarity search against `name` (`ix_proc_supplier_name_trgm`).
   * Returns at most `limit` rows, most-relevant first.
   */
  async searchByName(query: string, limit = 20, manager?: EntityManager): Promise<ProcSupplierEntity[]> {
    const source = manager ?? this.repo.manager;
    const normalized = query.trim().toLowerCase();
    const rows: RawProcSupplierSearchRow[] = await source.query(
      `
      SELECT s.*, similarity(s.name, $1) AS relevance
      FROM app.proc_supplier s
      WHERE s.name % $1
      ORDER BY relevance DESC, s.name ASC
      LIMIT $2
      `,
      [normalized, limit],
    );
    return rows.map(mapRawSearchRow);
  }
}
