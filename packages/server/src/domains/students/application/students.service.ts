import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { OutboxWriterService } from "../../../shared/events/outbox-writer.service";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { NumberingService, SettingsService } from "../../../platform/settings";
import {
  StdStudentBoarding,
  StdStudentEntity,
  StdStudentStatus,
  STD_STUDENT_EXIT_STATUSES,
} from "../domain/std-student.entity";
import { StdClassRepository } from "../infrastructure/std-class.repository";
import { StdFeeGroupRepository } from "../infrastructure/std-fee-group.repository";
import { StdLedgerEntryRepository } from "../infrastructure/std-ledger-entry.repository";
import { StdStreamRepository } from "../infrastructure/std-stream.repository";
import { ListStdStudentsFilter, StdStudentRepository } from "../infrastructure/std-student.repository";
import { StdStudentGuardianRepository } from "../infrastructure/std-student-guardian.repository";
import { StudentEnrolledEvent } from "../events/student-enrolled.event";
import { StudentStatusChangedEvent } from "../events/student-status-changed.event";

/** `set_setting` key for the admission-number autogen toggle (Phase 6 Slice 2b item 8). */
const ADMISSION_NO_AUTOGEN_SETTING_KEY = "students.admissionNoAutogenSetting";
/** `set_numbering_series.doc_type` for auto-generated admission numbers. */
const ADMISSION_NO_DOC_TYPE = "STD_ADMISSION";

export interface AdmissionNoAutogenSetting {
  enabled: boolean;
  prefix: string;
}

const DEFAULT_ADMISSION_NO_AUTOGEN_SETTING: AdmissionNoAutogenSetting = { enabled: false, prefix: "" };

export interface CreateStdStudentInput {
  /** Optional (Phase 6 Slice 2b item 8) — see `StudentsService.create()`'s doc comment. */
  admissionNo?: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  classId: string;
  streamId?: string | null;
  /** Phase 6 Slice 2b follow-up item 3 — optional; `create()` defaults an omitted value to `"DAY"`, see that method's own doc comment. */
  boarding?: StdStudentBoarding;
  feeGroupId?: string | null;
  sponsorId?: string | null;
  transportRouteId?: string | null;
  photoFileId?: string | null;
  customFields?: Record<string, unknown>;
  enrolledOn: string;
}

export interface UpdateStdStudentInput {
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  classId?: string;
  streamId?: string | null;
  boarding?: StdStudentBoarding;
  feeGroupId?: string | null;
  sponsorId?: string | null;
  transportRouteId?: string | null;
  photoFileId?: string | null;
  customFields?: Record<string, unknown>;
}

/**
 * `std_student` CRUD + admission workflow + status transitions.
 *
 * **BR-BILL-15 ("cannot flip to an exit status with a nonzero balance
 * without a documented clearance decision") is only PARTIALLY implemented
 * here, and deliberately so — documented placeholder, same pattern as every
 * other forward-dependency deferral throughout this build**: `changeStatus()`
 * enforces the mechanical half of the rule (an exit-status transition is
 * rejected unless `exit_cleared=true` is already set on the row), mirroring
 * `trg_std_student_exit_guard` (migration `0065`) as defense-in-depth (G-04)
 * — but the REAL "does this student have a nonzero balance" check requires
 * Billing (Module 9)'s AR data, which doesn't exist yet. `markExitCleared()`
 * is a manually-invoked flag-setter standing in for that real check until
 * Module 9 lands with a proper "verify zero balance or record a documented
 * write-off/acknowledgment" workflow (BR-BILL-15's `billing:clearance:override`
 * permission gate).
 */
@Injectable()
export class StudentsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly studentRepository: StdStudentRepository,
    private readonly classRepository: StdClassRepository,
    private readonly streamRepository: StdStreamRepository,
    private readonly feeGroupRepository: StdFeeGroupRepository,
    private readonly ledgerEntryRepository: StdLedgerEntryRepository,
    private readonly studentGuardianRepository: StdStudentGuardianRepository,
    private readonly outboxWriter: OutboxWriterService,
    private readonly settingsService: SettingsService,
    private readonly numberingService: NumberingService,
  ) {}

  /**
   * `admissionNo` is optional (Phase 6 Slice 2b item 8):
   *  - **Supplied**: unchanged behavior — uniqueness is checked BEFORE the
   *    transaction opens (a plain pre-check, same as always).
   *  - **Omitted**: the pre-transaction uniqueness check is skipped
   *    entirely (a freshly-`NumberingService.allocate()`-d number cannot
   *    collide by construction — `set_numbering_series`'s own row lock is
   *    the real correctness guarantee) and the admission-no-autogen setting
   *    (`GET/PUT /students/settings/admission-no-autogen`) is read instead:
   *    if disabled, rejected with a clear `ValidationException`; if
   *    enabled, `NumberingService.allocate(manager, "STD_ADMISSION")` is
   *    called INSIDE the same transaction as the student insert, mirroring
   *    `InvoicingService.postInvoice()`'s `numberingService.allocate(em,
   *    "BILL_INVOICE")` precedent exactly (allocate-then-write, same
   *    transaction, never a separate round trip).
   *
   * `boarding` is optional (Phase 6 Slice 2b follow-up item 3): when
   * omitted, defaults to `"DAY"` — a plain code default applied here,
   * before the insert, deliberately NOT a nullable `std_student.boarding`
   * DB column (that would ripple into every read path that currently
   * assumes a valid non-null enum, e.g. `student-response.dto.ts`/the
   * repository row-mapper). No migration needed for this — matches this
   * codebase's general preference for a sensible server-side default over
   * nullable-column sprawl where the default is uncontroversial.
   */
  async create(input: CreateStdStudentInput, actorId: string | null): Promise<StdStudentEntity> {
    const admissionNoSupplied = !!input.admissionNo;
    if (admissionNoSupplied) {
      if (await this.studentRepository.findByAdmissionNo(input.admissionNo!)) {
        throw new ConflictException(`std_student admission_no already in use: ${input.admissionNo}`);
      }
    } else {
      const autogen = await this.getAdmissionNoAutogenSetting();
      if (!autogen.enabled) {
        throw new ValidationException(
          "StudentsService.create: admissionNo is required — admission-number autogen is not enabled " +
            "(enable it via PUT /students/settings/admission-no-autogen, or supply admissionNo explicitly)",
        );
      }
    }
    await this.classRepository.findByIdOrFail(input.classId);
    if (input.streamId) {
      await this.streamRepository.findByIdOrFail(input.streamId);
    }
    if (input.feeGroupId) {
      await this.feeGroupRepository.findByIdOrFail(input.feeGroupId);
    }

    return runInTransaction(this.dataSource, async (manager) => {
      const admissionNo = admissionNoSupplied
        ? input.admissionNo!
        : await this.numberingService.allocate(manager, ADMISSION_NO_DOC_TYPE);

      const student = await this.studentRepository.create(
        {
          admissionNo,
          firstName: input.firstName,
          middleName: input.middleName ?? null,
          lastName: input.lastName,
          classId: input.classId,
          streamId: input.streamId ?? null,
          status: "ACTIVE",
          boarding: input.boarding ?? "DAY",
          feeGroupId: input.feeGroupId ?? null,
          sponsorId: input.sponsorId ?? null,
          transportRouteId: input.transportRouteId ?? null,
          photoFileId: input.photoFileId ?? null,
          customFields: input.customFields ?? {},
          enrolledOn: input.enrolledOn,
          exitedOn: null,
          exitCleared: false,
          createdBy: actorId,
          updatedBy: actorId,
        },
        manager,
      );

      await this.outboxWriter.write(
        manager,
        new StudentEnrolledEvent(student.id, {
          studentId: student.id,
          admissionNo: student.admissionNo,
          classId: student.classId,
          streamId: student.streamId,
          enrolledOn: student.enrolledOn,
          actorId,
        }),
      );

      return student;
    });
  }

  async findByIdOrFail(id: string): Promise<StdStudentEntity> {
    return this.studentRepository.findByIdOrFail(id);
  }

  /**
   * Phase 6 Slice 2c — real server-side pagination, mirroring
   * `UsersService.list()`'s exact `{items, total}` shape (no `meta` envelope)
   * — `page`/`pageSize` converted to `skip`/`take` here, same as that
   * precedent, so `StudentsController.list()` stays a thin DTO-in/call-out.
   */
  async list(
    filter: ListStdStudentsFilter & { page?: number; pageSize?: number } = {},
  ): Promise<{ items: StdStudentEntity[]; total: number }> {
    const { page, pageSize, ...rest } = filter;
    const effectivePage = page ?? 1;
    const effectivePageSize = pageSize ?? 20;
    const [items, total] = await this.studentRepository.list({
      ...rest,
      skip: (effectivePage - 1) * effectivePageSize,
      take: effectivePageSize,
    });
    return { items, total };
  }

  /** FR-PAY-002 ≤2s cashier lookup — delegates straight to the repository's trigram search. */
  async search(query: string, limit = 20): Promise<StdStudentEntity[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }
    return this.studentRepository.searchByNameOrAdmissionNo(query, limit);
  }

  async update(id: string, changes: UpdateStdStudentInput, actorId: string | null): Promise<StdStudentEntity> {
    const student = await this.studentRepository.findByIdOrFail(id);

    if (changes.classId !== undefined) {
      await this.classRepository.findByIdOrFail(changes.classId);
      student.classId = changes.classId;
    }
    if (changes.streamId !== undefined) {
      if (changes.streamId) await this.streamRepository.findByIdOrFail(changes.streamId);
      student.streamId = changes.streamId;
    }
    if (changes.feeGroupId !== undefined) {
      if (changes.feeGroupId) await this.feeGroupRepository.findByIdOrFail(changes.feeGroupId);
      student.feeGroupId = changes.feeGroupId;
    }
    if (changes.firstName !== undefined) student.firstName = changes.firstName;
    if (changes.middleName !== undefined) student.middleName = changes.middleName;
    if (changes.lastName !== undefined) student.lastName = changes.lastName;
    if (changes.boarding !== undefined) student.boarding = changes.boarding;
    if (changes.sponsorId !== undefined) student.sponsorId = changes.sponsorId;
    if (changes.transportRouteId !== undefined) student.transportRouteId = changes.transportRouteId;
    if (changes.photoFileId !== undefined) student.photoFileId = changes.photoFileId;
    if (changes.customFields !== undefined) student.customFields = changes.customFields;
    student.updatedBy = actorId;

    return this.studentRepository.save(student);
  }

  /**
   * `ACTIVE → ALUMNI/TRANSFERRED/SUSPENDED/WITHDRAWN` (and back, e.g.
   * `SUSPENDED → ACTIVE`) — the DDL's CHECK constraint is the only hard
   * state-machine boundary; this service adds exactly one extra rule, the
   * exit-clearance gate, matching `trg_std_student_exit_guard` (migration
   * `0065`) exactly: a transition INTO an exit status
   * (`ALUMNI`/`TRANSFERRED`/`WITHDRAWN`) FROM a non-exit status is rejected
   * unless `exit_cleared=true` is already set (see class doc comment for the
   * honest BR-BILL-15 scope caveat). Sets `exited_on` to today (UTC) the
   * first time a student lands in an exit status.
   */
  async changeStatus(id: string, toStatus: StdStudentStatus, actorId: string | null): Promise<StdStudentEntity> {
    const student = await this.studentRepository.findByIdOrFail(id);
    const fromStatus = student.status;
    const enteringExit = STD_STUDENT_EXIT_STATUSES.includes(toStatus);
    const wasAlreadyExited = STD_STUDENT_EXIT_STATUSES.includes(fromStatus);

    if (enteringExit && !wasAlreadyExited && !student.exitCleared) {
      throw new ValidationException(
        `StudentsService.changeStatus: student ${id} cannot move to ${toStatus} — exit_cleared must be true first ` +
          "(mirrors trg_std_student_exit_guard; BR-BILL-15's real zero-balance check is a Module 9/Billing placeholder, see markExitCleared())",
        { studentId: id, fromStatus, toStatus },
      );
    }

    return runInTransaction(this.dataSource, async (manager) => {
      student.status = toStatus;
      if (enteringExit && !student.exitedOn) {
        student.exitedOn = new Date().toISOString().slice(0, 10);
      }
      student.updatedBy = actorId;
      const saved = await this.studentRepository.save(student, manager);

      await this.outboxWriter.write(
        manager,
        new StudentStatusChangedEvent(saved.id, {
          studentId: saved.id,
          fromStatus,
          toStatus,
          exitCleared: saved.exitCleared,
          actorId,
        }),
      );

      return saved;
    });
  }

  /**
   * Manually-invoked flag-setter — documented placeholder for BR-BILL-15's
   * real "no outstanding balance, or a documented clearance decision"
   * workflow, which requires Billing (Module 9)'s AR data and doesn't exist
   * yet. Once set, `changeStatus()` will admit the exit-status transition.
   */
  async markExitCleared(studentId: string, actorId: string | null): Promise<StdStudentEntity> {
    const student = await this.studentRepository.findByIdOrFail(studentId);
    student.exitCleared = true;
    student.updatedBy = actorId;
    return this.studentRepository.save(student);
  }

  /**
   * Hard DELETE (Phase 6 Slice 2b — Student delete). **Deliberately NOT a
   * copy of `ClassesService.delete()`/`StreamsService.delete()`** — students
   * carry real financial/relational significance those two don't. This is
   * exactly why the status state machine above (`changeStatus()`, exit
   * statuses gated on `exitCleared`) exists at all: "removing" a student with
   * any real history is supposed to go through that lifecycle mechanism
   * (`ACTIVE → ALUMNI/TRANSFERRED/WITHDRAWN/SUSPENDED`), not deletion.
   * Deletion here is reserved for cleaning up mistaken/duplicate/test records
   * with zero real activity — it BLOCKS on any real financial/cross-module
   * reference rather than silently cascading through it.
   *
   * **Financial/historical references checked (all real `onDelete:
   * "RESTRICT"` FKs to `std_student`, confirmed exhaustively by grepping
   * every migration for `REFERENCES app.std_student` AND every entity for
   * `@ManyToOne(() => StdStudentEntity` — both searches agree on exactly 11
   * referencing tables, all 11 covered below or by the guardian-link
   * auto-cleanup)**: `std_ledger_entry` (this module, migration `0065`);
   * `bill_invoice`/`bill_debit_note`/`bill_refund_voucher`/
   * `bill_sponsor_award`/`bill_concession`/`bill_student_optional_item`
   * (`domains/billing`, migration `0070`); `pay_receipt`/
   * `pay_bulk_allocation_batch_line` (`domains/payments`, migration `0080`);
   * `wall_wallet` (`domains/wallet`, migration `0090`) — see
   * `StdStudentRepository`'s `countInvoiceReferences()`..`countWalletReferences()`
   * doc comment for why these are raw SQL, not cross-module repository
   * imports.
   *
   * **Guardian links are different, deliberately not blocked on**:
   * `std_student_guardian` is purely administrative metadata (which
   * guardians are associated with this student), not an independent
   * financial/historical record — this method auto-deletes the student's
   * link rows in the SAME transaction as the student row itself, via
   * `StdStudentGuardianRepository.deleteByStudentId()`. This does NOT touch
   * `std_guardian` — a guardian who has other children stays fully intact,
   * and even a guardian left with zero links afterward stays as a standalone
   * record (no guardian-delete endpoint exists or is being added here).
   */
  async delete(id: string, actorId: string | null): Promise<void> {
    await this.studentRepository.findByIdOrFail(id);

    const [
      ledgerEntryCount,
      invoiceCount,
      debitNoteCount,
      refundVoucherCount,
      sponsorAwardCount,
      concessionCount,
      optionalItemCount,
      receiptCount,
      bulkAllocationLineCount,
      walletCount,
    ] = await Promise.all([
      this.ledgerEntryRepository.countByStudentId(id),
      this.studentRepository.countInvoiceReferences(id),
      this.studentRepository.countDebitNoteReferences(id),
      this.studentRepository.countRefundVoucherReferences(id),
      this.studentRepository.countSponsorAwardReferences(id),
      this.studentRepository.countConcessionReferences(id),
      this.studentRepository.countOptionalItemReferences(id),
      this.studentRepository.countReceiptReferences(id),
      this.studentRepository.countBulkAllocationLineReferences(id),
      this.studentRepository.countWalletReferences(id),
    ]);

    const parts: string[] = [];
    if (ledgerEntryCount > 0) parts.push(`${ledgerEntryCount} ledger entry(s)`);
    if (invoiceCount > 0) parts.push(`${invoiceCount} invoice(s)`);
    if (debitNoteCount > 0) parts.push(`${debitNoteCount} debit note(s)`);
    if (refundVoucherCount > 0) parts.push(`${refundVoucherCount} refund voucher(s)`);
    if (sponsorAwardCount > 0) parts.push(`${sponsorAwardCount} sponsor award(s)`);
    if (concessionCount > 0) parts.push(`${concessionCount} concession(s)`);
    if (optionalItemCount > 0) parts.push(`${optionalItemCount} optional item(s)`);
    if (receiptCount > 0) parts.push(`${receiptCount} receipt(s)`);
    if (bulkAllocationLineCount > 0) parts.push(`${bulkAllocationLineCount} bulk allocation line(s)`);
    if (walletCount > 0) parts.push(`${walletCount} wallet(s)`);

    if (parts.length > 0) {
      throw new ConflictException(`Cannot delete student: ${parts.join(" and ")} still reference it`);
    }

    await runInTransaction(this.dataSource, async (manager) => {
      await this.studentGuardianRepository.deleteByStudentId(id, manager);
      await this.studentRepository.delete(id, manager);
    });
    void actorId; // accepted for signature parity with create()/update()/ClassesService.delete()'s own precedent — a deleted row has no updatedBy to stamp.
  }

  /**
   * Phase 6 Slice 2b item 8 — reads the `students.admissionNoAutogenSetting`
   * `set_setting` row via the generic `SettingsService` (reused, not
   * reimplemented). Returns the honest `{enabled:false, prefix:""}` default
   * when the setting has never been configured, rather than throwing —
   * `create()`'s omitted-`admissionNo` path treats "never configured" the
   * same as "explicitly disabled".
   */
  async getAdmissionNoAutogenSetting(): Promise<AdmissionNoAutogenSetting> {
    const stored = await this.settingsService.get<AdmissionNoAutogenSetting>(ADMISSION_NO_AUTOGEN_SETTING_KEY);
    return stored ?? DEFAULT_ADMISSION_NO_AUTOGEN_SETTING;
  }

  /**
   * Upserts the `set_setting` row AND the `set_numbering_series` row for
   * `(docType: "STD_ADMISSION", seriesCode: "MAIN")` via
   * `NumberingService.upsertSeriesPrefix()`, so a custom prefix takes effect
   * from the very first real `allocate()` call — not just the setting flag
   * alone, which by itself would only gate whether autogen is used, not
   * what prefix it uses.
   */
  async setAdmissionNoAutogenSetting(
    input: AdmissionNoAutogenSetting,
    actorId: string | null,
  ): Promise<AdmissionNoAutogenSetting> {
    await this.settingsService.set(ADMISSION_NO_AUTOGEN_SETTING_KEY, input, false, actorId);
    await this.numberingService.upsertSeriesPrefix(ADMISSION_NO_DOC_TYPE, input.prefix);
    return input;
  }
}
