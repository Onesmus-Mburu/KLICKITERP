import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
// Barrel import (application-layer service, not an entity file) — safe, see
// billing.module.ts's doc comment on import ordering for why this differs
// from the entity-level direct-file-import convention.
import { StdClassRepository, StdStreamRepository, StdStudentRepository } from "../../students";
import { AcademicCalendarService } from "../../../platform/settings";
// Phase 6 Slice 16 (Part 1) — barrel import, the same one-directional
// exception `module-deps.json`'s updated `domains/billing` entry documents.
import { DocumentVerificationService } from "../../../platform/document-verification";
import { BillFeeStructureBoarding, BillFeeStructureEntity } from "../domain/bill-fee-structure.entity";
import { BillFeeStructureLineEntity } from "../domain/bill-fee-structure-line.entity";
import { BillFeeCategoryRepository } from "../infrastructure/bill-fee-category.repository";
import { BillFeeStructureLineRepository } from "../infrastructure/bill-fee-structure-line.repository";
import { BillFeeStructureRepository } from "../infrastructure/bill-fee-structure.repository";
import { BillInvoiceRepository } from "../infrastructure/bill-invoice.repository";

export interface FeeCategoryForScope {
  feeCategoryId: string;
  name: string;
  /** One representative structure-line amount for this category within the scope — display context only (e.g. a chip label), not a canonical/aggregate price. */
  exampleAmount: Money;
}

export interface CreateFeeStructureInput {
  academicYearId: string;
  classId: string;
  streamId?: string | null;
  boarding?: BillFeeStructureBoarding | null;
  feeGroupId?: string | null;
}

export interface CreateFeeStructureLineInput {
  feeCategoryId: string;
  termId: string;
  dueDate: string;
  amount: Money;
  isOptional?: boolean;
}

export interface UpdateFeeStructureLineInput {
  amount: Money;
  termId: string;
  dueDate: string;
}

/** Phase 6 Slice 16 (Part 1) — the `docv_record.document_type` value `publish()` mints under, and `FeeStructuresController`'s "get by id" path looks up by. */
export const FEE_STRUCTURE_DOCUMENT_TYPE = "FEE_STRUCTURE";

/**
 * CRUD for `bill_fee_structure` + `bill_fee_structure_line`
 * (BR-BILL-02/BR-BILL-03), plus `publish()` (DRAFT -> PUBLISHED, superseding
 * any prior PUBLISHED version of the same scope), `findApplicableFor()`
 * (the FR-BILL-011.1 resolution lookup `InvoicingService.generateInvoice()`
 * depends on), and `delete()`.
 *
 * **Phase 6 Slice 3b (2026-07-29, migration `0210`) — Fee Structure
 * Redesign.** A structure now spans a WHOLE academic year instead of a
 * single term — `term_id` moved OFF `bill_fee_structure` and onto
 * `bill_fee_structure_line` (each line now carries its own `termId`/
 * `dueDate`). This service's scope/versioning/publish logic is now keyed on
 * `academicYearId` in place of `termId` throughout; `addLine()`/
 * `updateLine()` additionally validate that the line's given term actually
 * belongs to the structure's own academic year (a line for a term from a
 * DIFFERENT year would be a real data-integrity bug this service actively
 * rejects, not silently allows). `findApplicableFor()` now resolves the
 * caller's `termId` to its `academicYearId` first (via
 * `AcademicCalendarService.findTermByIdOrFail()`), then delegates to the
 * now-year-scoped `findCurrentPublished()` — it returns the STRUCTURE only;
 * filtering the structure's lines down to the specific term being billed is
 * `InvoicingService.generateInvoice()`'s job now
 * (`BillFeeStructureLineRepository.listByStructureAndTerm()`), one layer up
 * from this service.
 *
 * **Line mutability** — lines are only editable while the parent structure is
 * `DRAFT` (a strict service-level gate: `status === 'DRAFT'`, not merely
 * `!== 'PUBLISHED'`, so a `SUPERSEDED` structure's lines are ALSO frozen at
 * this layer even though `trg_bill_structure_immutable` (migration `0070`)
 * only conditions on `status = 'PUBLISHED'` at the DB layer — a documented,
 * intentionally stricter service-level rule than the DB trigger's minimum).
 *
 * **Versioning** — each DRAFT created for a given exact scope
 * `(academic_year_id, class_id, stream_id, boarding, fee_group_id)` (NULL
 * treated as an exact-match dimension here, unlike `findApplicableFor()`'s
 * wildcard-NULL specificity ranking below) gets `version = 1 +
 * max(existing version for that exact scope)`, mirroring the DDL's
 * `uq_bill_fee_structure_scope_version` expression index.
 *
 * **`publish()`** — the unset-then-set transactional pattern this codebase
 * uses everywhere an "exactly one current/PUBLISHED row per scope" invariant
 * exists (`AcademicCalendarService.setCurrentYear`/`ThemesService.publish()`/
 * `BudgetsService.onApprovalDecided()`): inside one transaction, any existing
 * `PUBLISHED` structure for the exact same scope is flipped to `SUPERSEDED`,
 * then this structure is flipped to `PUBLISHED` — so no window exists where
 * two `PUBLISHED` rows for the same scope coexist.
 *
 * **`delete()`** — blocked (`ConflictException`, naming the real count) once
 * any `bill_invoice` still references the structure; otherwise deletes it
 * outright — `bill_fee_structure_line` rows cascade automatically
 * (`ON DELETE CASCADE`, migration `0070`), no explicit line cleanup needed.
 *
 * **`findApplicableFor()`** delegates to
 * `BillFeeStructureRepository.findCurrentPublished()` — that repository
 * method (written during the foundation pass, see its own doc comment)
 * already implements the exact most-specific-match-wins ranking this
 * service needs: a structure row with a NULL scope dimension
 * (`stream_id`/`boarding`/`fee_group_id`) matches ANY value for that
 * dimension (a wildcard), a non-NULL dimension must match exactly, and among
 * every row that matches, the one with the most non-NULL matched dimensions
 * wins (specificity = count of non-NULL dims), ties broken by highest
 * `version`. Reusing it here (rather than re-deriving the same algorithm in
 * this service) is a deliberate reuse decision, documented per the task
 * brief's instruction to "implement a reasonable specificity ranking,
 * document it."
 */
@Injectable()
export class FeeStructuresService {
  constructor(
    private readonly feeStructureRepository: BillFeeStructureRepository,
    private readonly feeStructureLineRepository: BillFeeStructureLineRepository,
    private readonly studentRepository: StdStudentRepository,
    private readonly academicCalendarService: AcademicCalendarService,
    private readonly invoiceRepository: BillInvoiceRepository,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly feeCategoryRepository: BillFeeCategoryRepository,
    // Phase 6 Slice 16 (Part 1) — both appended at the END of the existing
    // constructor param list (not interleaved), keeping every pre-existing
    // positional `new FeeStructuresService(...)` call (real code and every
    // prior test file) valid with only an append. `StdClassRepository`/
    // `StdStreamRepository` resolve human-readable class/stream names for
    // `publish()`'s minted `documentRef`/`summary` — both already exported
    // from `domains/students`' barrel (already imported into `BillingModule`
    // via `StudentsModule`, `domains/students` already in this module's
    // `mayImport`), so no new module-level wiring was needed for them.
    private readonly classRepository: StdClassRepository,
    private readonly streamRepository: StdStreamRepository,
    private readonly documentVerificationService: DocumentVerificationService,
  ) {}

  async createDraft(input: CreateFeeStructureInput, actorId: string | null): Promise<BillFeeStructureEntity> {
    const scopeRows = await this.feeStructureRepository.listByYearAndClass(input.academicYearId, input.classId);
    const sameScope = scopeRows.filter((row) => this.sameExactScope(row, input));
    const nextVersion = sameScope.length === 0 ? 1 : Math.max(...sameScope.map((row) => row.version)) + 1;

    return this.feeStructureRepository.create({
      academicYearId: input.academicYearId,
      classId: input.classId,
      streamId: input.streamId ?? null,
      boarding: input.boarding ?? null,
      feeGroupId: input.feeGroupId ?? null,
      version: nextVersion,
      status: "DRAFT",
      publishedAt: null,
      publishedBy: null,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async findByIdOrFail(id: string): Promise<BillFeeStructureEntity> {
    return this.feeStructureRepository.findByIdOrFail(id);
  }

  async listByYearAndClass(academicYearId: string, classId: string): Promise<BillFeeStructureEntity[]> {
    return this.feeStructureRepository.listByYearAndClass(academicYearId, classId);
  }

  async listLines(feeStructureId: string): Promise<BillFeeStructureLineEntity[]> {
    return this.feeStructureLineRepository.listByStructure(feeStructureId);
  }

  /**
   * Phase 6 Slice 8 — the chip-picker catalog for the bulk "Generate
   * Invoice" screen: every fee category (deduped by `feeCategoryId`)
   * appearing on ANY line of ANY `PUBLISHED` fee structure for this
   * (academic year, class) scope, across every term (no `termId` filter —
   * this endpoint intentionally lets a user pick categories before/without
   * committing to a specific term; the bulk-generate call itself is what's
   * term-scoped). Reuses `listByYearAndClass()` (already this service's own
   * method, itself a thin `BillFeeStructureRepository.listByYearAndClass()`
   * pass-through) rather than a new repository method — filters to
   * `PUBLISHED` here since a `DRAFT`/`SUPERSEDED` structure cannot bill
   * (BR-BILL-02). `exampleAmount` is the FIRST matching line's own amount
   * encountered for that category (display context only, e.g. a chip label
   * like "Caution Fees (KSh 5,000.00)") — not an aggregate/canonical price,
   * since the same category can legitimately carry different amounts across
   * different structures/terms within the same scope.
   */
  async listCategoriesForScope(academicYearId: string, classId: string): Promise<FeeCategoryForScope[]> {
    const structures = await this.feeStructureRepository.listByYearAndClass(academicYearId, classId);
    const published = structures.filter((structure) => structure.status === "PUBLISHED");

    const seen = new Map<string, FeeCategoryForScope>();
    for (const structure of published) {
      const lines = await this.feeStructureLineRepository.listByStructure(structure.id);
      for (const line of lines) {
        if (seen.has(line.feeCategoryId)) continue;
        const category = await this.feeCategoryRepository.findByIdOrFail(line.feeCategoryId);
        seen.set(line.feeCategoryId, { feeCategoryId: line.feeCategoryId, name: category.name, exampleAmount: line.amount });
      }
    }
    return [...seen.values()];
  }

  async addLine(
    feeStructureId: string,
    input: CreateFeeStructureLineInput,
    actorId: string | null,
  ): Promise<BillFeeStructureLineEntity> {
    const structure = await this.requireDraft(feeStructureId);
    await this.requireTermInStructureYear(input.termId, structure);
    return this.feeStructureLineRepository.create({
      feeStructureId,
      feeCategoryId: input.feeCategoryId,
      termId: input.termId,
      dueDate: input.dueDate,
      amount: input.amount,
      isOptional: input.isOptional ?? false,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async updateLine(
    lineId: string,
    input: UpdateFeeStructureLineInput,
    actorId: string | null,
  ): Promise<BillFeeStructureLineEntity> {
    const line = await this.feeStructureLineRepository.findByIdOrFail(lineId);
    const structure = await this.requireDraft(line.feeStructureId);
    await this.requireTermInStructureYear(input.termId, structure);
    line.amount = input.amount;
    line.termId = input.termId;
    line.dueDate = input.dueDate;
    line.updatedBy = actorId;
    return this.feeStructureLineRepository.save(line);
  }

  async removeLine(lineId: string): Promise<void> {
    const line = await this.feeStructureLineRepository.findByIdOrFail(lineId);
    await this.requireDraft(line.feeStructureId);
    await this.feeStructureLineRepository.delete(lineId);
  }

  /** BR-BILL-03: DRAFT -> PUBLISHED, superseding any prior PUBLISHED row for the exact same scope. */
  async publish(structureId: string, publishedBy: string): Promise<BillFeeStructureEntity> {
    return runInTransaction(this.dataSource, async (manager) => {
      const structure = await this.feeStructureRepository.findByIdOrFail(structureId, manager);
      if (structure.status !== "DRAFT") {
        throw new ValidationException(`Only a DRAFT fee structure can be published (status=${structure.status})`);
      }
      const lines = await this.feeStructureLineRepository.listByStructure(structureId, manager);
      if (lines.length === 0) {
        throw new ValidationException(`bill_fee_structure ${structureId} has no lines — nothing to publish`);
      }

      const scopeRows = await this.feeStructureRepository.listByYearAndClass(
        structure.academicYearId,
        structure.classId,
        manager,
      );
      const previousPublished = scopeRows.find(
        (row) => row.id !== structure.id && row.status === "PUBLISHED" && this.sameExactScope(row, structure),
      );
      if (previousPublished) {
        previousPublished.status = "SUPERSEDED";
        previousPublished.updatedBy = publishedBy;
        await this.feeStructureRepository.save(previousPublished, manager);
      }

      structure.status = "PUBLISHED";
      structure.publishedAt = new Date();
      structure.publishedBy = publishedBy;
      structure.updatedBy = publishedBy;
      const published = await this.feeStructureRepository.save(structure, manager);

      // Phase 6 Slice 16 (Part 1) — mint an opaque verification token for
      // the newly-published structure, inside this same transaction,
      // immediately after its status is confirmed PUBLISHED. Only publish()
      // mints — a DRAFT or SUPERSEDED-without-having-been-republished
      // structure correctly has no token (`findByDocument()` returns `null`
      // via `FeeStructuresController`'s "get by id" path). Resolves the
      // class (and, if set, stream) name for a genuinely human-readable
      // `documentRef`/`summary` — a bare classId/streamId uuid would be
      // meaningless to a parent/guardian scanning the printed document's QR
      // code (Part 2, frontend).
      const klass = await this.classRepository.findByIdOrFail(published.classId, manager);
      const stream = published.streamId ? await this.streamRepository.findById(published.streamId, manager) : null;
      const documentRef = `${klass.name}${stream ? ` (${stream.name})` : ""} v${published.version}`;
      await this.documentVerificationService.mint(manager, {
        documentType: FEE_STRUCTURE_DOCUMENT_TYPE,
        documentId: published.id,
        documentRef,
        summary: {
          className: klass.name,
          streamName: stream?.name ?? null,
          boarding: published.boarding,
          version: published.version,
          publishedAt: published.publishedAt,
        },
      });

      return published;
    });
  }

  /**
   * Cannot delete once any `bill_invoice` references this structure
   * (`ConflictException`, naming the real count) — mirrors
   * `StudentsService.delete()`'s count-naming precedent. Otherwise deletes
   * outright; `bill_fee_structure_line` rows cascade automatically
   * (`ON DELETE CASCADE`, migration `0070`).
   */
  async delete(id: string, actorId: string | null): Promise<void> {
    await this.feeStructureRepository.findByIdOrFail(id);
    const invoiceCount = await this.invoiceRepository.countByFeeStructureId(id);
    if (invoiceCount > 0) {
      throw new ConflictException(`Cannot delete fee structure ${id}: ${invoiceCount} invoice(s) still reference it`);
    }
    await this.feeStructureRepository.delete(id);
    void actorId; // accepted for signature parity with create()/publish()'s own precedent — a deleted row has no updatedBy to stamp (mirrors StudentsService.delete()).
  }

  /**
   * FR-BILL-011.1 resolution: the current `PUBLISHED` structure matching a
   * student's `(class_id, stream_id, boarding, fee_group_id)` scope for the
   * given term's academic year. Requires `termId` as an explicit parameter
   * (a documented, necessary deviation from the task brief's one-argument
   * `findApplicableFor(studentId)` signature — every caller in this pass,
   * `InvoicingService.generateInvoice()`, already has the target term in
   * hand, and a term is still needed to resolve which academic year to
   * search AND, one layer up, which of the resolved structure's lines
   * apply). Accepts an optional `EntityManager` so
   * `InvoicingService.generateInvoice()` can resolve the structure inside its
   * own caller-supplied transaction, same composable pattern as
   * `PostingService.post()`.
   *
   * Returns the STRUCTURE only — `bill_fee_structure` is year-scoped since
   * Slice 3b, so filtering its lines down to the specific term being billed
   * is the caller's job (`InvoicingService.generateInvoice()`, via
   * `BillFeeStructureLineRepository.listByStructureAndTerm()`), not this
   * method's.
   */
  async findApplicableFor(
    studentId: string,
    termId: string,
    manager?: EntityManager,
  ): Promise<BillFeeStructureEntity | null> {
    const student = await this.studentRepository.findByIdOrFail(studentId, manager);
    const term = await this.academicCalendarService.findTermByIdOrFail(termId, manager);
    return this.feeStructureRepository.findCurrentPublished(
      term.academicYearId,
      student.classId,
      student.streamId,
      student.boarding,
      student.feeGroupId,
      manager,
    );
  }

  private async requireDraft(feeStructureId: string): Promise<BillFeeStructureEntity> {
    const structure = await this.feeStructureRepository.findByIdOrFail(feeStructureId);
    if (structure.status !== "DRAFT") {
      throw new ValidationException(
        `bill_fee_structure ${feeStructureId} lines can only be edited while DRAFT (status=${structure.status})`,
      );
    }
    return structure;
  }

  /**
   * Defense-in-depth ahead of any future DB-layer check: a fee-structure
   * line's term must belong to the SAME academic year as its parent
   * structure — a line pointing at a term from a different year would be a
   * silent, confusing data-integrity bug (the structure would "apply" to a
   * year it isn't actually scoped to).
   */
  private async requireTermInStructureYear(termId: string, structure: BillFeeStructureEntity): Promise<void> {
    const term = await this.academicCalendarService.findTermByIdOrFail(termId);
    if (term.academicYearId !== structure.academicYearId) {
      throw new ValidationException(
        `Term ${termId} belongs to academic year ${term.academicYearId}, not fee structure ${structure.id}'s academic year ${structure.academicYearId}`,
      );
    }
  }

  /** Exact-match scope comparison for versioning/supersession — NULL dimensions must match NULL-for-NULL, unlike `findApplicableFor()`'s wildcard-NULL ranking. */
  private sameExactScope(
    row: Pick<BillFeeStructureEntity, "streamId" | "boarding" | "feeGroupId">,
    scope: Pick<BillFeeStructureEntity, "streamId" | "boarding" | "feeGroupId"> | CreateFeeStructureInput,
  ): boolean {
    const streamId = "streamId" in scope ? scope.streamId ?? null : null;
    const boarding = "boarding" in scope ? scope.boarding ?? null : null;
    const feeGroupId = "feeGroupId" in scope ? scope.feeGroupId ?? null : null;
    return row.streamId === streamId && row.boarding === boarding && row.feeGroupId === feeGroupId;
  }
}
