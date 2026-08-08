import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { Money } from "../../../shared/money/money";
import { NumberingService } from "../../../platform/settings";
import { BillDebitNoteEntity } from "../domain/bill-debit-note.entity";
import { BillDebitNoteLineEntity } from "../domain/bill-debit-note-line.entity";
import { BillDebitNoteLineRepository } from "../infrastructure/bill-debit-note-line.repository";
import { BillDebitNoteRepository } from "../infrastructure/bill-debit-note.repository";
import { InvoicingService } from "./invoicing.service";

export interface CreateDebitNoteLineInput {
  feeCategoryId: string;
  description: string;
  amount: Money;
}

export interface CreateDebitNoteInput {
  studentId: string;
  termId: string;
  lines: CreateDebitNoteLineInput[];
  reason: string;
}

/**
 * `bill_debit_note` + `bill_debit_note_line` — new charges raised directly
 * against a student (unlike a credit note, not scoped to one existing
 * invoice; per the task's own clarification).
 *
 * **Design decision (the DDL's own comment leaves this open): a debit note
 * IS a new invoice, realized through the ordinary posting engine.**
 * `bill_invoice.source` already carries a `'DEBIT_NOTE'` enum value with no
 * DDL-level distinction from `'ADHOC'` beyond that tag — so rather than
 * inventing a second, parallel P-07 posting algorithm inside this service
 * (duplicating `InvoicingService.postInvoice()`'s P-01..P-04 machinery: control
 * account resolution, concession/sponsor-coverage folding, numbering,
 * student-ledger mirroring), `post()` calls
 * `InvoicingService.generateInvoice()` (with `source: 'DEBIT_NOTE'`, the debit
 * note's own lines as `adhocLines`) then `.postInvoice()` on the resulting
 * invoice. P-07's debit/credit direction
 * (docs/phase-2/01-functional-requirements.md: "Debit note | Debit: AR–Student
 * control | Credit: Income per line") is IDENTICAL to P-01's own shape (gross
 * AR-Student debit, per-category fee-income credit) — the only difference is
 * narration/`source` tagging, both of which `generateInvoice()`/`postInvoice()`
 * already parameterize correctly. `post()` then records the resulting
 * `bill_invoice.id`/`journal_id` back onto the `bill_debit_note` row
 * (migration `0072`'s `invoice_id` column) and marks it `POSTED`.
 *
 * **No approval workflow.** The task brief's own seed-domain-code list (the
 * complete set of `appr_workflow_def` rows this pass registers:
 * `GL_BUDGET`/`BILLING_CONCESSION`/`BILLING_CREDIT_NOTE`/`REFUNDS`/
 * `BILLING_LATE_FEE`) omits a `BILLING_DEBIT_NOTE` code, and this service's
 * own task description names only `create()` (DRAFT) and `post()` — no
 * `submitForApproval()`/`onApprovalDecided()`. `post()` is therefore callable
 * directly from `DRAFT`, mirroring `InvoicingService.postInvoice()`'s own
 * documented precedent ("this pass does not route ordinary structure
 * invoices through PENDING_APPROVAL/APPROVED... a documented scope decision")
 * — `BillNoteStatus`'s `PENDING_APPROVAL`/`APPROVED` values remain unused by
 * this particular service, available for a future pass that adds one.
 *
 * **`term_id`/`invoice_id`** live on the entity via migration `0072` — see
 * `BillDebitNoteEntity`'s doc comment for why both were needed, not just the
 * `invoice_id` the task brief named explicitly.
 */
@Injectable()
export class DebitNotesService {
  constructor(
    private readonly debitNoteRepository: BillDebitNoteRepository,
    private readonly debitNoteLineRepository: BillDebitNoteLineRepository,
    private readonly invoicingService: InvoicingService,
    private readonly numberingService: NumberingService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async create(input: CreateDebitNoteInput, initiatedBy: string): Promise<BillDebitNoteEntity> {
    if (input.lines.length === 0) {
      throw new ValidationException("bill_debit_note requires at least one line");
    }
    let total = Money.ZERO;
    for (const line of input.lines) {
      if (!line.amount.isPositive()) {
        throw new ValidationException("bill_debit_note_line.amount must be positive (ck_bill_debit_note_line_amount_nonneg)");
      }
      total = total.add(line.amount);
    }

    return runInTransaction(this.dataSource, async (manager) => {
      const debitNoteId = generateUuidV7();
      const debitNote = await this.debitNoteRepository.create(
        {
          id: debitNoteId,
          // `number varchar(30)` (migration 0070) can't hold "DRAFT-" (6) + a full UUID (36) = 42
          // chars — truncate the hyphen-stripped UUID to fit.
          number: `DRAFT-${debitNoteId.replace(/-/g, "").slice(0, 24)}`,
          studentId: input.studentId,
          termId: input.termId,
          invoiceId: null,
          reason: input.reason,
          status: "DRAFT",
          approvalRef: null,
          journalId: null,
          total,
          createdBy: initiatedBy,
          updatedBy: initiatedBy,
        },
        manager,
      );

      let lineNo = 1;
      for (const line of input.lines) {
        await this.debitNoteLineRepository.create(
          {
            debitNoteId: debitNote.id,
            lineNo: lineNo++,
            feeCategoryId: line.feeCategoryId,
            description: line.description,
            amount: line.amount,
          },
          manager,
        );
      }

      return debitNote;
    });
  }

  async findByIdOrFail(id: string): Promise<BillDebitNoteEntity> {
    return this.debitNoteRepository.findByIdOrFail(id);
  }

  async listByStudent(studentId: string): Promise<BillDebitNoteEntity[]> {
    return this.debitNoteRepository.listByStudent(studentId);
  }

  async listLines(debitNoteId: string): Promise<BillDebitNoteLineEntity[]> {
    return this.debitNoteLineRepository.listByDebitNote(debitNoteId);
  }

  /** See class doc comment "Design decision" — reuses `InvoicingService`, does not duplicate posting logic. */
  async post(em: EntityManager, debitNoteId: string, postedBy: string): Promise<BillDebitNoteEntity> {
    const debitNote = await this.debitNoteRepository.findByIdOrFail(debitNoteId, em);
    if (debitNote.status !== "DRAFT") {
      throw new ValidationException(`Only a DRAFT bill_debit_note may be posted (status=${debitNote.status})`);
    }
    if (!debitNote.termId) {
      throw new Error(`bill_debit_note ${debitNoteId} has no term_id — data integrity issue (migration 0072)`);
    }

    const lines = await this.debitNoteLineRepository.listByDebitNote(debitNoteId, em);
    if (lines.length === 0) {
      throw new ValidationException(`bill_debit_note ${debitNoteId} has no lines — nothing to post`);
    }

    const invoice = await this.invoicingService.generateInvoice(em, {
      studentId: debitNote.studentId,
      termId: debitNote.termId,
      source: "DEBIT_NOTE",
      adhocLines: lines.map((line) => ({
        feeCategoryId: line.feeCategoryId,
        description: line.description,
        amount: line.amount,
      })),
      issueDate: new Date().toISOString().slice(0, 10),
      createdBy: postedBy,
    });
    const posted = await this.invoicingService.postInvoice(em, invoice.id, postedBy);

    const number = await this.numberingService.allocate(em, "BILL_DEBIT_NOTE");
    debitNote.number = number;
    debitNote.status = "POSTED";
    debitNote.invoiceId = posted.id;
    debitNote.journalId = posted.journalId;
    debitNote.updatedBy = postedBy;
    return this.debitNoteRepository.save(debitNote, em);
  }
}
