import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { BillFeeCategoryEntity } from "../domain/bill-fee-category.entity";
import { BillFeeStructureLineEntity } from "../domain/bill-fee-structure-line.entity";
import { BillFeeCategoryRepository } from "../infrastructure/bill-fee-category.repository";
import { BillFeeStructureLineRepository } from "../infrastructure/bill-fee-structure-line.repository";
import { BillInvoiceLineRepository } from "../infrastructure/bill-invoice-line.repository";
import { FeeStructuresService } from "./fee-structures.service";
import { InvoicingService } from "./invoicing.service";

export interface BulkAdhocGenerateInput {
  termId: string;
  /**
   * Accepted for interface/DTO completeness with the frontend's own
   * class-scoped student picker — not independently re-validated against
   * each student's own `classId` here (that would need an extra
   * `StdStudentRepository` lookup per student for no requirement this plan
   * actually calls for): `studentIds` is already the real, authoritative
   * population — the caller's own `useStudents({classId,
   * status:"ACTIVE"})` call already scoped it to this class. Mirrors
   * `FeeStructuresService.delete()`'s own accepted-but-signature-only
   * `actorId` precedent.
   */
  classId: string;
  feeCategoryIds: string[];
  studentIds: string[];
}

export interface BulkAdhocGenerateSuccess {
  studentId: string;
  invoiceIds: string[];
  /**
   * Phase 6 Slice 12 (Part C) — set (and non-empty) only on a PARTIAL skip:
   * some, but not all, of this student's SELECTED categories were already
   * really billed (a non-VOID `bill_invoice_line`) this term, so this
   * student still got invoiced for the remaining categories, but the
   * accountant needs to see which ones were quietly left out. Omitted
   * entirely (not just empty) when every selected category was billable —
   * the common case.
   */
  alreadyBilledCategoryIds?: string[];
}

export interface BulkAdhocGenerateFailure {
  studentId: string;
  error: string;
}

/**
 * Phase 6 Slice 12 (Part C) — a FULL skip: EVERY one of this student's
 * selected categories was already really billed this term, so nothing was
 * generated for them at all. Deliberately its own array, not folded into
 * `failed[]` — this is not an error (nothing went wrong; the student simply
 * doesn't need re-billing), it's a signal for the accountant to uncheck this
 * student and retry with the rest of the batch, per the plan's own framing.
 */
export interface BulkAdhocGenerateSkip {
  studentId: string;
  alreadyBilledCategoryIds: string[];
}

export interface BulkAdhocGenerateResult {
  succeeded: BulkAdhocGenerateSuccess[];
  failed: BulkAdhocGenerateFailure[];
  skipped: BulkAdhocGenerateSkip[];
}

/**
 * `generateForStudent()`'s own internal result (Phase 6 Slice 12, Part C) —
 * a discriminated union returned rather than thrown for the "already fully
 * billed" case, since it is NOT an error: `bulkGenerate()`'s existing
 * try/catch around `generateForStudent()` (unchanged) still exists purely
 * for genuine failures (`NotFoundException`/`ValidationException` — no
 * applicable structure at all, or none of the selected categories appear on
 * it), which stay real thrown exceptions exactly as before and still land in
 * `failed[]`. A full duplicate-billing skip is a normal, successful outcome
 * of running the guard — modeling it as a return value (not a thrown
 * exception subclass the caller would need to specifically catch) keeps
 * exceptions reserved for genuine errors and lets `bulkGenerate()`'s routing
 * logic be a plain, exhaustive `switch`/discriminant check instead of an
 * extra `catch` block whose job is to NOT treat something as an error.
 */
type GenerateForStudentResult =
  | { kind: "generated"; invoiceIds: string[]; alreadyBilledCategoryIds: string[] }
  | { kind: "skipped"; alreadyBilledCategoryIds: string[] };

/**
 * Phase 6 Slice 8 (Bulk Generate Invoice) — the category+grade+student-scoped
 * counterpart to `BulkBillingService.bulkGenerate()`'s whole-structure bulk
 * run: bills only the SELECTED fee categories (`feeCategoryIds`) for the
 * SELECTED students (`studentIds`), via the ADHOC invoice path rather than
 * STRUCTURE (so a partial subset of a student's applicable structure can be
 * billed on its own, independent of the rest of that structure). Same
 * partial-failure-tolerant, one-transaction-PER-STUDENT shape
 * `BulkBillingService.bulkGenerate()` already establishes (see that class's
 * own doc comment) — a failure on one student never aborts the batch.
 *
 * Per student, per due-date group, `InvoicingService.generateInvoice()` +
 * `.postInvoice()` are reused EXACTLY as they exist (no generate/post logic
 * duplicated here) — this service's only real job is resolving which
 * structure lines apply (`FeeStructuresService.findApplicableFor()`,
 * per-student, since stream/boarding/fee-group can differ within one
 * class), filtering to the selected categories, and grouping the filtered
 * lines by `dueDate` (a single `termId` is already fixed for the whole
 * batch, so due date alone is a correct, sufficient grouping key — a
 * student whose selected categories span two due dates gets two invoices,
 * one per due-date group, keeping later Pending/Upcoming bucketing correct
 * per invoice). A student whose applicable structure has zero lines
 * matching ANY selected category (no applicable PUBLISHED structure at all,
 * or none of the selected categories appear in it) lands in `failed[]` with
 * a clear reason, mirroring `generateInvoice()`'s own "produced zero lines"
 * guard shape.
 *
 * **Past-due structure lines are billed with their REAL due date, never
 * rejected (Phase 6 Slice 10, corrected)**: an earlier pass clamped a
 * past-due line's effective due date up to today so `generateInvoice()`
 * wouldn't throw — that was wrong; it silently changed the invoice away
 * from what the fee structure actually configures. Migration `0232`
 * dropped the `ck_bill_invoice_due_after_issue` constraint that made the
 * clamp seem necessary in the first place — `due_date` can legitimately
 * precede `issue_date`, since `issue_date` stays "today" (it's the real GL
 * journal posting date, tied to an open accounting period) while
 * `due_date` genuinely was due earlier. Grouping is therefore on each
 * line's own REAL `dueDate`, unmodified — a structure line whose due date
 * has already passed produces an invoice honestly dated with that same
 * past due date, correctly landing it in the "Pending" (overdue) bucket
 * immediately (`due_date < today`, Slice 8 Part 2's own bucketing rule),
 * not "Upcoming." Two matched lines that happen to share the exact same
 * real due date (past or future) still collapse into one invoice, exactly
 * as before — only the SOURCE of the grouping key changed, not the
 * grouping mechanism itself.
 *
 * **Duplicate fee-category-per-term guard (Phase 6 Slice 12, Part C)** — ADHOC
 * generation (unlike STRUCTURE's `uq_bill_invoice_structure_p`/BR-BILL-04)
 * has no DB-level unique constraint preventing the same student/category/term
 * from being billed twice, so this service enforces the equivalent rule in
 * application code instead: right after matching the selected categories
 * against the applicable structure (before due-date grouping),
 * `BillInvoiceLineRepository.listAlreadyBilledCategoryIds()` is consulted for
 * which of the matched categories this student already has a real
 * (non-`VOID`) `bill_invoice_line` for, this term. Categories already billed
 * are filtered OUT before any invoice is generated — never re-billed by this
 * path. A student whose ENTIRE selection was already billed lands in a new
 * `skipped[]` result array (see `BulkAdhocGenerateSkip`), distinct from
 * `failed[]`. A student with only SOME categories already billed still gets
 * invoiced for the rest, with the skipped categories surfaced on their own
 * success entry (`BulkAdhocGenerateSuccess.alreadyBilledCategoryIds`).
 * Deliberately scoped to only THIS service, not `InvoicingService
 * .generateInvoice()` itself — `LateFeeBatchesService`/`DebitNotesService`
 * both call `generateInvoice()` directly and legitimately re-bill the same
 * category across runs (late fees accrue per batch run; debit notes are
 * one-off ad hoc charges); a guard living inside the shared method would
 * incorrectly block them.
 *
 * **Still an application-level check, not a DB constraint** — unlike
 * STRUCTURE's real `uq_bill_invoice_structure_p` unique index,
 * `listAlreadyBilledCategoryIds()` is a plain read-then-filter inside the
 * per-student transaction, not enforced by the database itself. It correctly
 * catches the case this request exists for (an accountant re-running a bulk
 * generate over a class that includes students already billed for some
 * category, whether from an earlier run or an individual `GenerateInvoiceDialog`
 * call) since the check re-reads fresh on every call. It does NOT close a true
 * concurrent double-submit race (two overlapping calls for the very same
 * student both reading "not yet billed" before either one's transaction
 * commits) — the same class of pre-existing gap this class's own prior
 * revision flagged, now narrowed to that one remaining race window rather
 * than the whole "any repeat submission" surface, and still mitigated the
 * same way (a disabled-while-submitting frontend button), not by new DDL.
 */
@Injectable()
export class BulkAdhocInvoicesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly feeStructuresService: FeeStructuresService,
    private readonly feeStructureLineRepository: BillFeeStructureLineRepository,
    private readonly feeCategoryRepository: BillFeeCategoryRepository,
    private readonly invoicingService: InvoicingService,
    private readonly billInvoiceLineRepository: BillInvoiceLineRepository,
  ) {}

  async bulkGenerate(input: BulkAdhocGenerateInput, initiatedBy: string): Promise<BulkAdhocGenerateResult> {
    const categorySet = new Set(input.feeCategoryIds);
    const succeeded: BulkAdhocGenerateSuccess[] = [];
    const failed: BulkAdhocGenerateFailure[] = [];
    const skipped: BulkAdhocGenerateSkip[] = [];

    for (const studentId of input.studentIds) {
      try {
        const result = await runInTransaction(this.dataSource, (manager) =>
          this.generateForStudent(manager, studentId, input.termId, categorySet, initiatedBy),
        );
        if (result.kind === "skipped") {
          skipped.push({ studentId, alreadyBilledCategoryIds: result.alreadyBilledCategoryIds });
        } else {
          succeeded.push({
            studentId,
            invoiceIds: result.invoiceIds,
            ...(result.alreadyBilledCategoryIds.length > 0
              ? { alreadyBilledCategoryIds: result.alreadyBilledCategoryIds }
              : {}),
          });
        }
      } catch (error) {
        failed.push({ studentId, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return { succeeded, failed, skipped };
  }

  private async generateForStudent(
    manager: EntityManager,
    studentId: string,
    termId: string,
    categorySet: Set<string>,
    initiatedBy: string,
  ): Promise<GenerateForStudentResult> {
    const structure = await this.feeStructuresService.findApplicableFor(studentId, termId, manager);
    if (!structure) {
      throw new NotFoundException(
        "BillFeeStructure(applicable)",
        `no PUBLISHED fee structure matches student=${studentId} term=${termId} (BR-BILL-02)`,
      );
    }

    const structureLines = await this.feeStructureLineRepository.listByStructureAndTerm(structure.id, termId, manager);
    const matchedLines = structureLines.filter((line) => categorySet.has(line.feeCategoryId));
    if (matchedLines.length === 0) {
      throw new ValidationException(
        `None of the selected fee categories appear on student ${studentId}'s applicable fee structure ${structure.id} for term ${termId}`,
      );
    }

    // Phase 6 Slice 12 (Part C) — the duplicate fee-category-per-term guard:
    // of the categories that DID match this student's applicable structure,
    // which ones does this student already have a real (non-VOID) invoice
    // line for, this same term. Checked against only the matched-category
    // set (not the full `categorySet` the caller passed in), since a
    // category not on this student's structure at all was already excluded
    // above for an unrelated reason.
    const matchedCategoryIds = [...new Set(matchedLines.map((line) => line.feeCategoryId))];
    const alreadyBilledSet = await this.billInvoiceLineRepository.listAlreadyBilledCategoryIds(
      studentId,
      termId,
      matchedCategoryIds,
      manager,
    );
    const alreadyBilledCategoryIds = [...alreadyBilledSet];
    const billableLines = matchedLines.filter((line) => !alreadyBilledSet.has(line.feeCategoryId));

    if (billableLines.length === 0) {
      // FULL skip — every matched category was already billed this term.
      // Nothing generated; the caller routes this into `skipped[]`, not
      // `failed[]` (see `BulkAdhocGenerateSkip`'s own doc comment).
      return { kind: "skipped", alreadyBilledCategoryIds };
    }

    // Group by each line's REAL due date (Slice 10, corrected) — no clamping.
    // A past due date is preserved as-is; `generateInvoice()` no longer
    // rejects `dueDate < issueDate` (migration `0232`), so this needs no
    // special-casing — see the class doc comment above for the full reasoning.
    // Grouped from `billableLines` (post duplicate-category filter), NOT the
    // original `matchedLines` — a PARTIAL skip must only generate invoices
    // for the categories that are actually still billable.
    const groupsByDueDate = new Map<string, BillFeeStructureLineEntity[]>();
    for (const line of billableLines) {
      const group = groupsByDueDate.get(line.dueDate);
      if (group) {
        group.push(line);
      } else {
        groupsByDueDate.set(line.dueDate, [line]);
      }
    }

    const categoryCache = new Map<string, BillFeeCategoryEntity>();
    const categoryFor = async (id: string): Promise<BillFeeCategoryEntity> => {
      const cached = categoryCache.get(id);
      if (cached) return cached;
      const category = await this.feeCategoryRepository.findByIdOrFail(id, manager);
      categoryCache.set(id, category);
      return category;
    };

    const invoiceIds: string[] = [];
    for (const [dueDate, lines] of groupsByDueDate) {
      const adhocLines = await Promise.all(
        lines.map(async (line) => {
          const category = await categoryFor(line.feeCategoryId);
          return { feeCategoryId: line.feeCategoryId, description: category.name, amount: line.amount };
        }),
      );
      const invoice = await this.invoicingService.generateInvoice(manager, {
        studentId,
        termId,
        source: "ADHOC",
        adhocLines,
        dueDate,
        createdBy: initiatedBy,
      });
      await this.invoicingService.postInvoice(manager, invoice.id, initiatedBy);
      invoiceIds.push(invoice.id);
    }

    return { kind: "generated", invoiceIds, alreadyBilledCategoryIds };
  }
}
