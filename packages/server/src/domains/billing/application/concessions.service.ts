import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { ApprovalEngineService } from "../../../platform/approvals";
import { GlAccountRepository, PostingService } from "../../../accounting";
import { StudentLedgerService } from "../../students";
import { BillConcessionEntity } from "../domain/bill-concession.entity";
import { BillConcessionKind } from "../domain/bill-concession-scheme.entity";
import { BillConcessionRepository } from "../infrastructure/bill-concession.repository";
import { BillConcessionSchemeRepository } from "../infrastructure/bill-concession-scheme.repository";
import { BillInvoiceLineRepository } from "../infrastructure/bill-invoice-line.repository";
import { BillInvoiceRepository } from "../infrastructure/bill-invoice.repository";
import { resolveControlAccount } from "./gl-control-accounts.util";

/** `appr_workflow_def.domain_code` this module registers for concession/waiver approval (BR-BILL-07) — same bootstrapping-gap caveat as `GL_BUDGET_APPROVAL_DOMAIN_CODE` (accounting): Pass B/a future seed migration owns actually publishing a workflow def/version under this code. */
export const BILLING_CONCESSION_APPROVAL_DOMAIN_CODE = "BILLING_CONCESSION";

export interface RequestConcessionInput {
  kind: BillConcessionKind;
  schemeId?: string | null;
  studentId: string;
  invoiceId?: string | null;
  invoiceLineId?: string | null;
  sponsorAwardId?: string | null;
  amount: Money;
  reason: string;
}

/**
 * CRUD + the approval-and-posting lifecycle for `bill_concession`
 * (BR-BILL-06/BR-BILL-07): `PENDING_APPROVAL -> APPROVED -> POSTED` (or
 * `-> REJECTED`).
 *
 * **`requestConcession()`** creates the row `PENDING_APPROVAL` and attaches
 * an approval instance via `ApprovalEngineService.submit(em, {domainCode:
 * 'BILLING_CONCESSION', ...})`, storing the returned instance id as
 * `approval_ref` — same composition pattern as `BudgetsService.submitForApproval()`.
 * BR-BILL-06's "may not exceed the balance of the line/invoice it targets"
 * scope requires exactly one of `invoiceId`/`invoiceLineId` to be
 * meaningfully set (both entity FK columns are nullable at the DDL layer
 * precisely so a concession can target either the whole invoice or one
 * line — see `BillConcessionEntity`'s doc comment) — validated here.
 *
 * **`onApprovalDecided()`** is the same manual-trigger interim pattern
 * `BudgetsService.onApprovalDecided()` established: **no event dispatcher
 * exists anywhere in this codebase yet**, so nothing calls this
 * automatically off `ApprovalEngineService.decide()`; a future Pass B
 * controller (or a real dispatcher, whenever one lands) calls it explicitly.
 *
 * **`postStandalone()` — the frozen-invoice-columns design decision.**
 * Approved concessions are normally folded into `InvoicingService.postInvoice()`'s
 * single P-01..P-04 journal while the invoice is still `DRAFT` (see that
 * service). But a concession can also be requested/approved AFTER its target
 * invoice has already posted — the task brief's own scenario. At that point
 * `trg_bill_invoice_immutable` (migration `0070`) freezes exactly five
 * columns once `status IN ('POSTED','PARTIALLY_PAID','PAID')`: `subtotal`,
 * `concession_total`, `total`, `structure_version`, `fee_structure_id` — and
 * explicitly ALLOWS continued writes to `paid_amount`/`balance`/`status`/
 * `version`. Reading that column list literally (verified against the exact
 * trigger SQL in migration `0070`) settles the judgement call the task brief
 * flags: `postStandalone()` posts a real P-02/P-03/P-04 GL journal (debit the
 * concession's contra/expense/AR-Sponsor account, credit AR-Student) exactly
 * like the folded-at-post-time path, but — since it CANNOT touch
 * `concession_total`/`total` on an already-POSTED invoice — represents the
 * resulting reduction in what's still collectible by incrementing
 * `paid_amount` and decrementing `balance` by the concession amount (the only
 * mutable numeric levers the DDL leaves available post-freeze), plus a
 * `std_ledger_entry` credit on the student's own sub-ledger. This is a
 * deliberate, honestly-labelled overload of `paid_amount` — it does not mean
 * cash was received, only that the amount is no longer outstanding via
 * ordinary collection. The consequence (documented, not silently accepted):
 * `InvoicingService.voidInvoice()`'s "`paid_amount = 0`" gate (BR-BILL-09)
 * will treat an invoice that has had a standalone concession posted against
 * it as no-longer-voidable, directing the caller to the credit-note path
 * (Pass B) exactly as BR-BILL-09 intends for "any amount applied" — a
 * reasonable, if imperfect, fit given the DDL's fixed column set.
 */
@Injectable()
export class ConcessionsService {
  constructor(
    private readonly concessionRepository: BillConcessionRepository,
    private readonly schemeRepository: BillConcessionSchemeRepository,
    private readonly invoiceRepository: BillInvoiceRepository,
    private readonly invoiceLineRepository: BillInvoiceLineRepository,
    private readonly glAccountRepository: GlAccountRepository,
    private readonly postingService: PostingService,
    private readonly studentLedgerService: StudentLedgerService,
    private readonly approvalEngine: ApprovalEngineService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async requestConcession(input: RequestConcessionInput, initiatorId: string): Promise<BillConcessionEntity> {
    const hasInvoice = Boolean(input.invoiceId);
    const hasLine = Boolean(input.invoiceLineId);
    if (hasInvoice === hasLine) {
      throw new ValidationException(
        "bill_concession must target exactly one of invoice_id or invoice_line_id (BR-BILL-06 scope)",
      );
    }
    if (!input.amount.isPositive()) {
      throw new ValidationException("bill_concession.amount must be positive (ck_bill_concession_amount_positive)");
    }
    if (!input.schemeId && !input.sponsorAwardId) {
      throw new ValidationException(
        "bill_concession requires either scheme_id (P-02/P-04 contra account) or sponsor_award_id (P-03 AR-Sponsor) " +
          "to resolve a GL account at posting time — an ad-hoc concession with neither cannot be posted",
      );
    }

    return runInTransaction(this.dataSource, async (manager) => {
      const concession = await this.concessionRepository.create(
        {
          kind: input.kind,
          schemeId: input.schemeId ?? null,
          studentId: input.studentId,
          invoiceId: input.invoiceId ?? null,
          invoiceLineId: input.invoiceLineId ?? null,
          sponsorAwardId: input.sponsorAwardId ?? null,
          amount: input.amount,
          reason: input.reason,
          status: "PENDING_APPROVAL",
          approvalRef: null,
          journalId: null,
          createdBy: initiatorId,
          updatedBy: initiatorId,
        },
        manager,
      );

      const instance = await this.approvalEngine.submit(manager, {
        domainCode: BILLING_CONCESSION_APPROVAL_DOMAIN_CODE,
        entityType: "bill_concession",
        entityId: concession.id,
        amount: input.amount,
        initiatorId,
      });

      concession.approvalRef = instance.id;
      return this.concessionRepository.save(concession, manager);
    });
  }

  async findByIdOrFail(id: string): Promise<BillConcessionEntity> {
    return this.concessionRepository.findByIdOrFail(id);
  }

  async listByInvoice(invoiceId: string): Promise<BillConcessionEntity[]> {
    return this.concessionRepository.listByInvoice(invoiceId);
  }

  async listByStudent(studentId: string): Promise<BillConcessionEntity[]> {
    return this.concessionRepository.listByStudent(studentId);
  }

  /** APPROVED concessions attached to an invoice (whole-invoice or line-scoped) not yet POSTED — `InvoicingService.postInvoice()`'s fold-in input. */
  async listApprovedForInvoice(invoiceId: string): Promise<BillConcessionEntity[]> {
    const rows = await this.concessionRepository.listByInvoice(invoiceId);
    return rows.filter((row) => row.status === "APPROVED");
  }

  /** See class doc comment "onApprovalDecided" — no automatic wiring exists yet. */
  async onApprovalDecided(concessionId: string, approved: boolean, actorId: string | null): Promise<BillConcessionEntity> {
    const concession = await this.concessionRepository.findByIdOrFail(concessionId);
    if (concession.status !== "PENDING_APPROVAL") {
      throw new ValidationException(`bill_concession ${concessionId} is not PENDING_APPROVAL (status=${concession.status})`);
    }
    concession.status = approved ? "APPROVED" : "REJECTED";
    concession.updatedBy = actorId;
    return this.concessionRepository.save(concession);
  }

  /** See class doc comment "postStandalone — the frozen-invoice-columns design decision". */
  async postStandalone(concessionId: string, actorId: string): Promise<BillConcessionEntity> {
    return runInTransaction(this.dataSource, async (manager) => {
      const concession = await this.concessionRepository.findByIdOrFail(concessionId, manager);
      if (concession.status !== "APPROVED") {
        throw new ValidationException(`bill_concession ${concessionId} is not APPROVED (status=${concession.status})`);
      }

      let invoiceId = concession.invoiceId;
      if (!invoiceId && concession.invoiceLineId) {
        const line = await this.invoiceLineRepository.findByIdOrFail(concession.invoiceLineId, manager);
        invoiceId = line.invoiceId;
      }
      if (!invoiceId) {
        throw new ValidationException(`bill_concession ${concessionId} has no resolvable invoice to post against`);
      }

      const invoice = await this.invoiceRepository.findByIdOrFail(invoiceId, manager);
      if (invoice.status === "DRAFT") {
        throw new ValidationException(
          `Invoice ${invoiceId} is still DRAFT — this concession will be folded automatically when the invoice posts, not posted standalone`,
        );
      }
      if (invoice.status === "VOID") {
        throw new ValidationException(`Invoice ${invoiceId} is VOID — cannot post a concession against it`);
      }
      if (concession.amount.compare(invoice.balance) > 0) {
        throw new ValidationException(
          `BR-BILL-06: concession ${concessionId} amount ${concession.amount.toDecimalString()} exceeds invoice ${invoiceId} balance ${invoice.balance.toDecimalString()}`,
        );
      }

      const arStudent = await resolveControlAccount(this.glAccountRepository, "AR_STUDENT", manager);
      let contraAccountId: string;
      let postingCode: string;
      if (concession.sponsorAwardId) {
        const arSponsor = await resolveControlAccount(this.glAccountRepository, "AR_SPONSOR", manager);
        contraAccountId = arSponsor.id;
        postingCode = "P-03";
      } else if (concession.schemeId) {
        const scheme = await this.schemeRepository.findByIdOrFail(concession.schemeId, manager);
        contraAccountId = scheme.glAccountId;
        postingCode = concession.kind === "WAIVER" || concession.kind === "DISCOUNT" ? "P-02" : "P-04";
      } else {
        throw new ValidationException(`bill_concession ${concessionId} has neither scheme_id nor sponsor_award_id`);
      }

      const journal = await this.postingService.post(manager, {
        journalDate: new Date().toISOString().slice(0, 10),
        sourceModule: "billing",
        sourceDocType: "bill_concession",
        sourceDocId: concession.id,
        narration: `${postingCode} concession ${concession.id} posted standalone against invoice ${invoice.number}`,
        journalType: "MANUAL",
        postedBy: actorId,
        lines: [
          { accountId: contraAccountId, debit: concession.amount, credit: Money.ZERO, entityRefType: "bill_concession", entityRefId: concession.id },
          { accountId: arStudent.id, debit: Money.ZERO, credit: concession.amount, entityRefType: "bill_invoice", entityRefId: invoice.id },
        ],
      });

      invoice.paidAmount = invoice.paidAmount.add(concession.amount);
      invoice.balance = invoice.balance.subtract(concession.amount);
      if (invoice.balance.isZero()) {
        invoice.status = "PAID";
      } else if (invoice.paidAmount.isPositive()) {
        invoice.status = "PARTIALLY_PAID";
      }
      invoice.updatedBy = actorId;
      await this.invoiceRepository.save(invoice, manager);

      await this.studentLedgerService.appendEntry(manager, {
        studentId: concession.studentId,
        entryDate: new Date().toISOString().slice(0, 10),
        docType: "BILL_CONCESSION",
        docId: concession.id,
        // std_ledger_entry.doc_number is varchar(30); "CONC-" (5 chars) + the full 36-char UUID
        // concession.id is 41 chars and always overflows it (a genuine, always-reproducing bug —
        // every other appendEntry() caller in this codebase, e.g. receipts.service.ts/
        // invoicing.service.ts/credit-notes.service.ts, uses a real NumberingService-allocated
        // document number instead of a raw id; bill_concession has no such series of its own in
        // this schema, so truncate the formatted string to fit — this is not a
        // uniqueness-enforced column, just an audit-trail display field).
        docNumber: `CONC-${concession.id}`.slice(0, 30),
        debit: Money.ZERO,
        credit: concession.amount,
        memo: concession.reason,
      });

      concession.status = "POSTED";
      concession.journalId = journal.id;
      concession.updatedBy = actorId;
      return this.concessionRepository.save(concession, manager);
    });
  }
}
