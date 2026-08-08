import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { StdStudentEntity, StdStudentStatus } from "../domain/std-student.entity";

export interface ListStdStudentsFilter {
  classId?: string;
  streamId?: string | null;
  status?: StdStudentStatus;
  /** Phase 6 Slice 2c — real server-side pagination, mirroring `UsrUserRepository.list()`'s `skip`/`take` shape exactly. */
  skip?: number;
  take?: number;
}

/** Raw-row shape returned by `searchByNameOrAdmissionNo()`'s hand-written SQL — snake_case, matching `app.std_student`'s columns 1:1. */
interface RawStdStudentSearchRow {
  id: string;
  admission_no: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  search_name: string;
  class_id: string;
  stream_id: string | null;
  status: StdStudentStatus;
  boarding: string;
  fee_group_id: string | null;
  sponsor_id: string | null;
  transport_route_id: string | null;
  photo_file_id: string | null;
  custom_fields: Record<string, unknown>;
  enrolled_on: string;
  exited_on: string | null;
  exit_cleared: boolean;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  version: number;
  relevance: number;
}

function mapRawSearchRow(row: RawStdStudentSearchRow): StdStudentEntity {
  return {
    id: row.id,
    admissionNo: row.admission_no,
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    searchName: row.search_name,
    classId: row.class_id,
    streamId: row.stream_id,
    status: row.status,
    boarding: row.boarding,
    feeGroupId: row.fee_group_id,
    sponsorId: row.sponsor_id,
    transportRouteId: row.transport_route_id,
    photoFileId: row.photo_file_id,
    customFields: row.custom_fields,
    enrolledOn: row.enrolled_on,
    exitedOn: row.exited_on,
    exitCleared: row.exit_cleared,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    version: row.version,
  } as StdStudentEntity;
}

/**
 * Plain repository wrapper for `std_student`, plus `searchByNameOrAdmissionNo()`
 * — the FR-PAY-002 ≤2s cashier lookup, a real, meaningfully-implemented
 * trigram search (not a stub): a hand-written raw SQL query using `pg_trgm`'s
 * `%` similarity operator (fast, index-backed by the GIN trgm index on
 * `(search_name, admission_no)`, migration `0065`) plus an `ILIKE` prefix
 * match on `admission_no` (cashiers very often type/scan the exact admission
 * number), ranked by `GREATEST(similarity(search_name, q), similarity(admission_no,
 * q))` descending so the closest name/admission-number match wins regardless
 * of which field matched.
 */
@Injectable()
export class StdStudentRepository {
  constructor(
    @InjectRepository(StdStudentEntity)
    private readonly repo: Repository<StdStudentEntity>,
  ) {}

  async findById(id: string, manager?: EntityManager): Promise<StdStudentEntity | null> {
    return (manager?.getRepository(StdStudentEntity) ?? this.repo).findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<StdStudentEntity> {
    const row = await this.findById(id, manager);
    if (!row) throw new NotFoundException("StdStudent", id);
    return row;
  }

  async findByAdmissionNo(admissionNo: string, manager?: EntityManager): Promise<StdStudentEntity | null> {
    return (manager?.getRepository(StdStudentEntity) ?? this.repo).findOne({ where: { admissionNo } });
  }

  /**
   * Phase 6 Slice 2c — real server-side pagination (G-03), Students list
   * only (see the plan's own scope note — the other 5 list endpoints in this
   * module are deliberately untouched). `findAndCount()` over TypeORM's
   * plain `find()` — same built-in method, just also returning the total
   * row count matching `where` (ignoring `skip`/`take`), mirroring
   * `UsrUserRepository.list()`'s `getManyAndCount()` shape (that one uses a
   * `createQueryBuilder` since it also needs a `leftJoinAndSelect`; this one
   * has no join, so the plain `find`-family `findAndCount()` is sufficient —
   * same net effect, less code). `admissionNo ASC` order kept unchanged;
   * dynamic sort stays out of scope for this pass.
   */
  async list(filter: ListStdStudentsFilter = {}, manager?: EntityManager): Promise<[StdStudentEntity[], number]> {
    const where: Record<string, unknown> = {};
    if (filter.classId !== undefined) where.classId = filter.classId;
    if (filter.streamId !== undefined) where.streamId = filter.streamId;
    if (filter.status !== undefined) where.status = filter.status;
    return (manager?.getRepository(StdStudentEntity) ?? this.repo).findAndCount({
      where,
      order: { admissionNo: "ASC" },
      skip: filter.skip,
      take: filter.take,
    });
  }

  async create(data: Partial<StdStudentEntity>, manager?: EntityManager): Promise<StdStudentEntity> {
    const repo = manager?.getRepository(StdStudentEntity) ?? this.repo;
    return repo.save(repo.create(data));
  }

  /** Phase 6 Slice 2b — Class/Stream delete: `ClassesService.delete()`'s referencing-student pre-check (`std_student.class_id` is `onDelete: "RESTRICT"`). */
  async countByClassId(classId: string, manager?: EntityManager): Promise<number> {
    return (manager?.getRepository(StdStudentEntity) ?? this.repo).count({ where: { classId } });
  }

  /** Phase 6 Slice 2b — Class/Stream delete: `StreamsService.delete()`'s referencing-student pre-check (`std_student.stream_id` is `onDelete: "RESTRICT"`). */
  async countByStreamId(streamId: string, manager?: EntityManager): Promise<number> {
    return (manager?.getRepository(StdStudentEntity) ?? this.repo).count({ where: { streamId } });
  }

  async save(entity: StdStudentEntity, manager?: EntityManager): Promise<StdStudentEntity> {
    return (manager?.getRepository(StdStudentEntity) ?? this.repo).save(entity);
  }

  /**
   * Hard DELETE (Phase 6 Slice 2b — Student delete). `StudentsService.delete()`'s
   * only caller, called only after that service has confirmed zero real
   * financial/cross-module references remain (ledger entries + every table
   * `countInvoiceReferences()`..`countWalletReferences()` below check) AND
   * the student's `std_student_guardian` link rows have already been removed
   * in the SAME transaction (guardian links are administrative metadata, not
   * financial history — see `StdStudentGuardianRepository.deleteByStudentId()`'s
   * doc comment).
   */
  async delete(id: string, manager?: EntityManager): Promise<void> {
    await (manager?.getRepository(StdStudentEntity) ?? this.repo).delete(id);
  }

  /**
   * Cross-domain reference checks ahead of student delete — one raw-SQL count
   * method per real referencing table, mirroring `StdClassRepository
   * .countFeeStructureReferences()`'s exact pattern/rationale: every table
   * below has a real `onDelete: "RESTRICT"` FK to `std_student` (confirmed by
   * grepping the whole `packages/server/src` tree for both
   * `REFERENCES app.std_student` across every migration AND
   * `@ManyToOne(() => StdStudentEntity` across every entity — the two
   * searches agree on exactly 11 referencing tables total: `std_ledger_entry`
   * and `std_student_guardian`, both same-module — see
   * `StdLedgerEntryRepository.countByStudentId()`/
   * `StdStudentGuardianRepository.deleteByStudentId()` — plus these 9
   * cross-domain ones). Raw SQL, NOT a `domains/billing`/`domains/payments`/
   * `domains/wallet` repository/module import: `billing.module.ts`,
   * `payments.module.ts`, AND `wallet.module.ts` all already import
   * `StudentsModule` (confirmed by reading all three), so a reverse
   * TS-level import from here would be a genuine circular NestJS module
   * dependency in three directions at once — a raw query sidesteps that
   * entirely, same mechanism `GlAccountRepository.hasPostings()` and
   * `StdClassRepository.countFeeStructureReferences()` already use for an
   * analogous before-delete external-reference check.
   */
  async countInvoiceReferences(studentId: string, manager?: EntityManager): Promise<number> {
    return this.rawCount("bill_invoice", studentId, manager);
  }

  /** See `countInvoiceReferences()`'s doc comment — `bill_debit_note.student_id`, migration `0070`. */
  async countDebitNoteReferences(studentId: string, manager?: EntityManager): Promise<number> {
    return this.rawCount("bill_debit_note", studentId, manager);
  }

  /** See `countInvoiceReferences()`'s doc comment — `bill_refund_voucher.student_id`, migration `0070`. */
  async countRefundVoucherReferences(studentId: string, manager?: EntityManager): Promise<number> {
    return this.rawCount("bill_refund_voucher", studentId, manager);
  }

  /** See `countInvoiceReferences()`'s doc comment — `bill_sponsor_award.student_id`, migration `0070`. */
  async countSponsorAwardReferences(studentId: string, manager?: EntityManager): Promise<number> {
    return this.rawCount("bill_sponsor_award", studentId, manager);
  }

  /** See `countInvoiceReferences()`'s doc comment — `bill_concession.student_id`, migration `0070`. */
  async countConcessionReferences(studentId: string, manager?: EntityManager): Promise<number> {
    return this.rawCount("bill_concession", studentId, manager);
  }

  /** See `countInvoiceReferences()`'s doc comment — `bill_student_optional_item.student_id`, migration `0070`. */
  async countOptionalItemReferences(studentId: string, manager?: EntityManager): Promise<number> {
    return this.rawCount("bill_student_optional_item", studentId, manager);
  }

  /** See `countInvoiceReferences()`'s doc comment — `pay_receipt.student_id`, migration `0080`. */
  async countReceiptReferences(studentId: string, manager?: EntityManager): Promise<number> {
    return this.rawCount("pay_receipt", studentId, manager);
  }

  /** See `countInvoiceReferences()`'s doc comment — `pay_bulk_allocation_batch_line.student_id`, migration `0080`. */
  async countBulkAllocationLineReferences(studentId: string, manager?: EntityManager): Promise<number> {
    return this.rawCount("pay_bulk_allocation_batch_line", studentId, manager);
  }

  /** See `countInvoiceReferences()`'s doc comment — `wall_wallet.student_id` (unique — at most one row), migration `0090`. */
  async countWalletReferences(studentId: string, manager?: EntityManager): Promise<number> {
    return this.rawCount("wall_wallet", studentId, manager);
  }

  /** Shared raw-SQL count helper for the 9 cross-domain methods above — `table` is always a hardcoded literal from this file, never user input, so string interpolation of the table name is safe (the studentId value itself is always parameterized as `$1`). */
  private async rawCount(table: string, studentId: string, manager?: EntityManager): Promise<number> {
    const source = manager ?? this.repo.manager;
    const rows: Array<{ count: string }> = await source.query(
      `SELECT COUNT(*)::int AS count FROM app.${table} WHERE student_id = $1`,
      [studentId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  /**
   * FR-PAY-002 ≤2s lookup. `query` is matched against both `search_name`
   * (lowercased server-side to match the generated column's own
   * `lower(...)` expression) and `admission_no`. Returns at most `limit`
   * rows, most-relevant first.
   */
  async searchByNameOrAdmissionNo(
    query: string,
    limit = 20,
    manager?: EntityManager,
  ): Promise<StdStudentEntity[]> {
    const source = manager ?? this.repo.manager;
    const normalized = query.trim().toLowerCase();
    const rows: RawStdStudentSearchRow[] = await source.query(
      `
      SELECT s.*,
        GREATEST(similarity(s.search_name, $1), similarity(s.admission_no, $1)) AS relevance
      FROM app.std_student s
      WHERE s.search_name % $1
         OR s.admission_no % $1
         OR s.admission_no ILIKE $2
      ORDER BY relevance DESC, s.admission_no ASC
      LIMIT $3
      `,
      [normalized, `${normalized}%`, limit],
    );
    return rows.map(mapRawSearchRow);
  }
}
