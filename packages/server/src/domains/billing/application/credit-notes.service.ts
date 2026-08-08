import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { Money } from "../../../shared/money/money";
import { ApprovalEngineService } from "../../../platform/approvals";
import { GlAccountRepository, PostJournalLineDraft, PostingService } from "../../../accounting";
import { NumberingService } from "../../../platform/settings";
import { StudentLedgerService } from "../../students";
import { BillCreditNoteEntity } from "../domain/bill-credit-note.entity";
import { BillCreditNoteLineRepository } from "../infrastructure/bill-credit-note-line.repository";
import { BillCreditNoteRepository } from "../infrastructure/bill-credit-note.repository";
import { BillFeeCategoryRepository } from "../infrastructure/bill-fee-category.repository";
import { BillInvoiceLineRepository } from "../infrastructure/bill-invoice-line.repository";
import { BillInvoiceRepository } from "../infrastructure/bill-invoice.repository";
import { resolveControlAccount } from "./gl-control-accounts.util";

/** `appr_workflow_def.domain_code` this module registers for credit-note approval — see the 0900 seed extension that publishes a workflow def/version under this code (closing the same bootstrapping gap `BILLING_CONCESSION`/`GL_BUDGET` had). */
export const BILLING_CREDIT_NOTE_APPROVAL_DOMAIN_CODE = "BILLING_CREDIT_NOTE";

export interface CreateCreditNoteLineInput {
  feeCategoryId: string;
  description?: string;
  amount: Money;
}

export interface CreateCreditNoteInput {
  invoiceId: string;
  lines: CreateCreditNoteLineInput[];
  reason: string;
}

/**
 * `bill_credit_note` + `bill_credit_note_line` — BR-BILL-09's correction
 * mechanism for a POSTED invoice that already has payment/settlement applied
 * (`voidInvoice()` refuses once `paid_amount > 0`; a credit note is the
 * documented path instead, docs/phase-2/01-functional-requirements.md P-06).
 *
 * **`create()`** builds a `DRAFT` note + lines only — no GL activity, no
 * approval submission yet (mirrors `InvoicingService.generateInvoice()`'s own
 * "build first, post later" split). Every requested line must reference a
 * fee category that actually appears on the target invoice's own lines
 * (`bill_invoice_line.fee_category_id`), and its amount is capped at that
 * original line's own `amount` (a full or partial reversal per line, per the
 * task brief) — this is a lighter validation than BR-BILL-06's own
 * remaining-balance tracking (this pass does not attempt to net out prior
 * credit notes against the same line at `create()` time; the aggregate
 * `total <= invoice.balance` check happens at `post()` time instead, mirroring
 * `ConcessionsService.postStandalone()`'s own "check against balance at
 * posting" convention). The target invoice must already be POSTED/PARTIALLY_PAID/PAID
 * (a credit note against a still-DRAFT or VOID invoice makes no sense).
 *
 * **Workflow**: `DRAFT -> PENDING_APPROVAL -> APPROVED -> POSTED` via
 * `submitForApproval()`/`onApprovalDecided()` (the latter the same manual-
 * trigger interim pattern `BudgetsService.onApprovalDecided()`/
 * `ConcessionsService.onApprovalDecided()` established — no event dispatcher
 * exists anywhere in this codebase yet). `BillNoteStatus` has no `REJECTED`
 * value, so a rejected note reverts to `DRAFT` (same lever `BudgetsService`
 * uses), not a terminal state — callers may edit and resubmit.
 *
 * **`post()` — P-06.** One `PostingService.post()` call: debit each original
 * line's fee-income account (`bill_fee_category.gl_income_account_id`, one
 * line per credit-note line) for `line.amount`, credit AR-Student control for
 * the note's aggregate `total` — the exact P-06 shape
 * (docs/phase-2/01-functional-requirements.md: "Credit note | Debit: Fee
 * income (original lines) | Credit: AR–Student control"). `number` is
 * allocated via `NumberingService.allocate(em, 'BILL_CREDIT_NOTE')`
 * (overwriting the `DRAFT-<uuid>` placeholder `create()` set, same convention
 * as `bill_invoice.number`). Unlike `bill_invoice`, **no DB trigger freezes
 * any `bill_credit_note` column** (migration `0070` only names
 * `trg_bill_structure_immutable`/`trg_bill_invoice_immutable`/
 * `trg_bill_installments_sum`), so `post()` may freely update every column
 * here — the "frozen-columns" workaround only applies to the TARGET invoice.
 *
 * **Invoice-side effect** — reduces the target invoice's collectible balance
 * by reusing `ConcessionsService.postStandalone()`'s EXACT convention
 * (documented on that method): `invoice.paid_amount += total`,
 * `invoice.balance -= total` (the only numeric levers
 * `trg_bill_invoice_immutable` still permits once
 * `status IN ('POSTED','PARTIALLY_PAID','PAID')`), re-deriving `status`
 * (`PAID` when `balance` reaches zero, else `PARTIALLY_PAID`), plus a
 * `std_ledger_entry` credit on the student's own sub-ledger — the same
 * "no real cash moved, just no-longer-collectible" honest overload
 * `postStandalone()` established, not a duplicate invention of a different
 * convention.
 */
@Injectable()
export class CreditNotesService {
  constructor(
    private readonly creditNoteRepository: BillCreditNoteRepository,
    private readonly creditNoteLineRepository: BillCreditNoteLineRepository,
    private readonly invoiceRepository: BillInvoiceRepository,
    private readonly invoiceLineRepository: BillInvoiceLineRepository,
    private readonly feeCategoryRepository: BillFeeCategoryRepository,
    private readonly glAccountRepository: GlAccountRepository,
    private readonly postingService: PostingService,
    private readonly numberingService: NumberingService,
    private readonly studentLedgerService: StudentLedgerService,
    private readonly approvalEngine: ApprovalEngineService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async create(input: CreateCreditNoteInput, initiatedBy: string): Promise<BillCreditNoteEntity> {
    if (input.lines.length === 0) {
      throw new ValidationException("bill_credit_note requires at least one line");
    }

    return runInTransaction(this.dataSource, async (manager) => {
      const invoice = await this.invoiceRepository.findByIdOrFail(input.invoiceId, manager);
      if (!["POSTED", "PARTIALLY_PAID", "PAID"].includes(invoice.status)) {
        throw new ValidationException(
          `bill_credit_note may only target a POSTED invoice (BR-BILL-09) — invoice ${input.invoiceId} status=${invoice.status}`,
        );
      }

      const invoiceLines = await this.invoiceLineRepository.listByInvoice(input.invoiceId, manager);
      const originalByCategory = new Map(invoiceLines.map((line) => [line.feeCategoryId, line]));

      let total = Money.ZERO;
      const lineInputs: { feeCategoryId: string; description: string; amount: Money }[] = [];
      for (const line of input.lines) {
        const original = originalByCategory.get(line.feeCategoryId);
        if (!original) {
          throw new ValidationException(
            `Invoice ${input.invoiceId} has no line for fee category ${line.feeCategoryId} — a credit note line must reference an original invoice line`,
          );
        }
        if (!line.amount.isPositive()) {
          throw new ValidationException("bill_credit_note_line.amount must be positive (ck_bill_credit_note_line_amount_nonneg)");
        }
        if (line.amount.compare(original.amount) > 0) {
          throw new ValidationException(
            `Credit note line for category ${line.feeCategoryId} amount ${line.amount.toDecimalString()} exceeds original invoice line amount ${original.amount.toDecimalString()}`,
          );
        }
        const category = await this.feeCategoryRepository.findByIdOrFail(line.feeCategoryId, manager);
        lineInputs.push({ feeCategoryId: line.feeCategoryId, description: line.description ?? category.name, amount: line.amount });
        total = total.add(line.amount);
      }

      const creditNoteId = generateUuidV7();
      const creditNote = await this.creditNoteRepository.create(
        {
          id: creditNoteId,
          // `number varchar(30)` (migration 0070) can't hold "DRAFT-" (6) + a full UUID (36) = 42
          // chars — truncate the hyphen-stripped UUID to fit.
          number: `DRAFT-${creditNoteId.replace(/-/g, "").slice(0, 24)}`,
          invoiceId: input.invoiceId,
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
      for (const line of lineInputs) {
        await this.creditNoteLineRepository.create(
          {
            creditNoteId: creditNote.id,
            lineNo: lineNo++,
            feeCategoryId: line.feeCategoryId,
            description: line.description,
            amount: line.amount,
          },
          manager,
        );
      }

      return creditNote;
    });
  }

  async findByIdOrFail(id: string): Promise<BillCreditNoteEntity> {
    return this.creditNoteRepository.findByIdOrFail(id);
  }

  async listByInvoice(invoiceId: string): Promise<BillCreditNoteEntity[]> {
    return this.creditNoteRepository.listByInvoice(invoiceId);
  }

  async listLines(creditNoteId: string) {
    return this.creditNoteLineRepository.listByCreditNote(creditNoteId);
  }

  async submitForApproval(creditNoteId: string, initiatorId: string): Promise<BillCreditNoteEntity> {
    return runInTransaction(this.dataSource, async (manager) => {
      const note = await this.creditNoteRepository.findByIdOrFail(creditNoteId, manager);
      if (note.status !== "DRAFT") {
        throw new ValidationException(`Only a DRAFT bill_credit_note can be submitted for approval (status=${note.status})`);
      }

      const instance = await this.approvalEngine.submit(manager, {
        domainCode: BILLING_CREDIT_NOTE_APPROVAL_DOMAIN_CODE,
        entityType: "bill_credit_note",
        entityId: note.id,
        amount: note.total,
        initiatorId,
      });

      note.status = "PENDING_APPROVAL";
      note.approvalRef = instance.id;
      note.updatedBy = initiatorId;
      return this.creditNoteRepository.save(note, manager);
    });
  }

  /** See class doc comment — no automatic wiring off `ApprovalEngineService.decide()` exists yet, `BillNoteStatus` has no REJECTED so a rejection reverts to DRAFT. */
  async onApprovalDecided(creditNoteId: string, approved: boolean, actorId: string | null): Promise<BillCreditNoteEntity> {
    const note = await this.creditNoteRepository.findByIdOrFail(creditNoteId);
    if (note.status !== "PENDING_APPROVAL") {
      throw new ValidationException(`bill_credit_note ${creditNoteId} is not PENDING_APPROVAL (status=${note.status})`);
    }
    note.status = approved ? "APPROVED" : "DRAFT";
    note.updatedBy = actorId;
    return this.creditNoteRepository.save(note);
  }

  /** See class doc comment "post() — P-06" and "Invoice-side effect". */
  async post(em: EntityManager, creditNoteId: string, postedBy: string): Promise<BillCreditNoteEntity> {
    const note = await this.creditNoteRepository.findByIdOrFail(creditNoteId, em);
    if (note.status !== "APPROVED") {
      throw new ValidationException(`Only an APPROVED bill_credit_note can be posted (status=${note.status})`);
    }

    const invoice = await this.invoiceRepository.findByIdOrFail(note.invoiceId, em);
    if (invoice.status === "VOID") {
      throw new ValidationException(`Invoice ${invoice.id} is VOID — cannot post a credit note against it`);
    }
    if (note.total.compare(invoice.balance) > 0) {
      throw new ValidationException(
        `Credit note ${creditNoteId} total ${note.total.toDecimalString()} exceeds invoice ${invoice.id} balance ${invoice.balance.toDecimalString()}`,
      );
    }

    const lines = await this.creditNoteLineRepository.listByCreditNote(creditNoteId, em);
    const arStudent = await resolveControlAccount(this.glAccountRepository, "AR_STUDENT", em);

    const journalLines: PostJournalLineDraft[] = [];
    for (const line of lines) {
      const category = await this.feeCategoryRepository.findByIdOrFail(line.feeCategoryId, em);
      journalLines.push({
        accountId: category.glIncomeAccountId,
        debit: line.amount,
        credit: Money.ZERO,
        memo: `P-06 credit note ${note.number} line ${line.lineNo}`,
        entityRefType: "bill_credit_note_line",
        entityRefId: line.id,
      });
    }
    journalLines.push({
      accountId: arStudent.id,
      debit: Money.ZERO,
      credit: note.total,
      memo: `P-06 credit note ${note.number}`,
      entityRefType: "bill_credit_note",
      entityRefId: note.id,
    });

    const journal = await this.postingService.post(em, {
      journalDate: new Date().toISOString().slice(0, 10),
      sourceModule: "billing",
      sourceDocType: "bill_credit_note",
      sourceDocId: note.id,
      narration: `Credit note posted against invoice ${invoice.number}`,
      journalType: "MANUAL",
      postedBy,
      lines: journalLines,
    });

    const number = await this.numberingService.allocate(em, "BILL_CREDIT_NOTE");
    note.number = number;
    note.status = "POSTED";
    note.journalId = journal.id;
    note.updatedBy = postedBy;
    const saved = await this.creditNoteRepository.save(note, em);

    invoice.paidAmount = invoice.paidAmount.add(note.total);
    invoice.balance = invoice.balance.subtract(note.total);
    if (invoice.balance.isZero()) {
      invoice.status = "PAID";
    } else if (invoice.paidAmount.isPositive()) {
      invoice.status = "PARTIALLY_PAID";
    }
    invoice.updatedBy = postedBy;
    await this.invoiceRepository.save(invoice, em);

    await this.studentLedgerService.appendEntry(em, {
      studentId: invoice.studentId,
      entryDate: new Date().toISOString().slice(0, 10),
      docType: "BILL_CREDIT_NOTE",
      docId: note.id,
      docNumber: number,
      debit: Money.ZERO,
      credit: note.total,
      memo: note.reason,
    });

    return saved;
  }
}
