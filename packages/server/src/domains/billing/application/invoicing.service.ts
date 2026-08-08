import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { Money } from "../../../shared/money/money";
import { GlAccountRepository, PostJournalLineDraft, PostingService } from "../../../accounting";
import { NumberingService } from "../../../platform/settings";
// Barrel imports (application-layer services, not entity files) — safe, see
// billing.module.ts's doc comment on import ordering.
import { StdStudentRepository, StudentLedgerService } from "../../students";
import { BillConcessionEntity } from "../domain/bill-concession.entity";
import { BillFeeCategoryEntity } from "../domain/bill-fee-category.entity";
import { BillInvoiceEntity, BillInvoiceSource } from "../domain/bill-invoice.entity";
import { BillConcessionSchemeRepository } from "../infrastructure/bill-concession-scheme.repository";
import { BillConcessionRepository } from "../infrastructure/bill-concession.repository";
import { BillFeeCategoryRepository } from "../infrastructure/bill-fee-category.repository";
import { BillFeeStructureLineRepository } from "../infrastructure/bill-fee-structure-line.repository";
import { BillInvoiceLineRepository } from "../infrastructure/bill-invoice-line.repository";
import { BillInvoiceRepository } from "../infrastructure/bill-invoice.repository";
import { BillSponsorAwardRepository } from "../infrastructure/bill-sponsor-award.repository";
import { BillStudentOptionalItemRepository } from "../infrastructure/bill-student-optional-item.repository";
import { FeeStructuresService } from "./fee-structures.service";
import { resolveControlAccount } from "./gl-control-accounts.util";

/**
 * `source` values `generateInvoice()` accepts. Pass A scoped this out to
 * `Exclude<BillInvoiceSource, "DEBIT_NOTE">` ("a Pass B concern"); Pass B
 * (`DebitNotesService.post()`) now widens it back to the full
 * `BillInvoiceSource` union — `generateInvoice()`'s own implementation never
 * needed a code change for this (the `else` branch already treats any
 * non-`STRUCTURE` source identically, requiring `adhocLines`), only the
 * exported type was narrower than necessary.
 */
export type GenerateInvoiceSource = BillInvoiceSource;

export interface GenerateInvoiceAdhocLine {
  feeCategoryId: string;
  description: string;
  amount: Money;
}

export interface GenerateInvoiceInput {
  studentId: string;
  termId: string;
  source: GenerateInvoiceSource;
  /** Required (non-empty) when `source` is `ADHOC`/`RECURRING`; ignored for `STRUCTURE`. */
  adhocLines?: GenerateInvoiceAdhocLine[];
  /** Defaults to today (UTC date). */
  issueDate?: string;
  /** Defaults to `issueDate` (immediate due) when omitted. */
  dueDate?: string;
  createdBy?: string | null;
}

const PG_UNIQUE_VIOLATION = "23505";

/**
 * THE core billing engine — invoice generation, posting (the GL posting map,
 * docs/phase-2/01-functional-requirements.md P-01..P-04), and voiding.
 *
 * **`generateInvoice()`** builds a `DRAFT` invoice + lines only — no GL
 * activity happens here (P-01 fires at `postInvoice()` time). For
 * `source='STRUCTURE'`: resolves via `FeeStructuresService.findApplicableFor()`,
 * includes every non-optional structure line at its own amount, and includes
 * an `is_optional=true` line only when a matching `bill_student_optional_item`
 * opt-in row exists for `(student, term, category)` — using that row's
 * `amount_override` when set, else the structure line's own amount.
 * BR-BILL-04 idempotency (at most one live structure-generated invoice per
 * `(student, term, structure)`) is enforced by `uq_bill_invoice_structure_p`
 * at the DB layer — this method does NOT pre-check; it inserts and
 * translates a `23505` unique-violation into `ConflictException`, per the
 * task brief's explicit instruction. `number` is set to a placeholder
 * (`DRAFT-<own-uuid>`, globally unique since ids are UUIDv7) to satisfy the
 * NOT NULL+UNIQUE `bill_invoice.number` column — `postInvoice()` overwrites
 * it with the real `NumberingService`-allocated number; `number` is not one
 * of the five columns `trg_bill_invoice_immutable` freezes, so this later
 * overwrite is always permitted regardless of status.
 *
 * **`postInvoice()` — the GL posting-map algorithm.** Transitions
 * `DRAFT -> POSTED` directly (this pass does not route ordinary structure
 * invoices through `PENDING_APPROVAL`/`APPROVED` — the FR-BILL text read for
 * this pass names no approval gate for ordinary invoice posting, unlike
 * concessions' explicit BR-BILL-07 approval chain; a documented scope
 * decision, revisit if a future FR is found requiring it). Algorithm:
 *
 *  1. Load the invoice (must be `DRAFT`, must have lines) and its lines.
 *  2. Fold already-`APPROVED` `bill_concession` rows attached to this invoice
 *     (whole-invoice or line-scoped) — kind `WAIVER`/`DISCOUNT` -> P-02,
 *     kind `SCHOLARSHIP`/`BURSARY` WITHOUT a `sponsor_award_id` -> P-04 (both
 *     debit the concession's `scheme.gl_account_id`), and any concession
 *     WITH a `sponsor_award_id` set (a discretionary, individually-approved
 *     sponsor-linked concession, distinct from step 3's bulk auto-coverage)
 *     -> P-03 (debits AR-Sponsor, and increments that award's
 *     `applied_amount`). Each concession is capped against its target line's
 *     remaining balance (BR-BILL-06) and folded into a running
 *     `invoiceRemaining` pool capped at the invoice's own `subtotal`.
 *  3. Resolve automatic sponsor-award coverage via
 *     `SponsorAwardsService`-equivalent lookup (`BillSponsorAwardRepository.findActiveForStudent()`,
 *     read inside this same transaction) — FR-BILL-042.1 "on invoice posting,
 *     covered amounts auto-move to sponsor via P-03". BR-BILL-13: applied
 *     "only to the fee categories they cover [`category_scope`, NULL =
 *     every category], in invoice-line order [`line_no` ascending], capped
 *     at award balance" AND capped by each line's own remaining capacity
 *     (after step 2's concessions) AND the overall `invoiceRemaining` pool
 *     (so step 2 + step 3 combined can never exceed `subtotal` — the
 *     BR-BILL-06 "aggregate concessions... may not drive balance negative"
 *     invariant, re-derived here since sponsor coverage isn't itself a
 *     `bill_concession` row). This step does NOT create `bill_concession`
 *     rows — it's a distinct, non-discretionary mechanism (a pre-committed
 *     award, not an individually-approved waiver) — only increments the
 *     award's `applied_amount`.
 *  4. Call `PostingService.post()` ONCE with every line needed to realize
 *     P-01 + P-02..P-04 as a single balanced journal: one AR-Student debit
 *     for the gross `subtotal` (P-01), one Fee-income credit per distinct
 *     category (P-01), one contra/expense/AR-Sponsor debit per step-2
 *     concession (P-02/P-03/P-04), one AR-Sponsor debit for step-3's
 *     aggregate auto-coverage (P-03) if positive, and ONE aggregate
 *     AR-Student credit for the combined step-2+step-3 reduction (the
 *     credit-side detail is intentionally folded into one line — see
 *     "Design decision: total vs. balance" below).
 *  5. Allocate the invoice `number` via `NumberingService.allocate(em,
 *     'BILL_INVOICE')`.
 *  6. Append one net `std_ledger_entry` via `StudentLedgerService.appendEntry()`
 *     — see "net AR movement" below.
 *  7. Update the invoice header: `number`, `status='POSTED'`,
 *     `concession_total` = step-2+step-3 combined reduction, `total` =
 *     `subtotal - concession_total`, `balance = total` (`paid_amount` stays
 *     `0` — no real cash moved), `journal_id`. This UPDATE happens while
 *     `OLD.status` is still `DRAFT`, so `trg_bill_invoice_immutable` does not
 *     yet apply to it (it only freezes columns on updates where `OLD.status
 *     IN ('POSTED','PARTIALLY_PAID','PAID')` — this is the very transition
 *     INTO `POSTED`).
 *  8. Mark every folded (step-2) concession `POSTED` with `journal_id` set,
 *     and increment every touched `bill_sponsor_award.applied_amount`
 *     (steps 2's sponsor-linked concessions AND step 3's auto-coverage both
 *     contribute here).
 *
 * **Design decision: `total`/`balance` vs. sponsor coverage.** Because this
 * UPDATE happens while the invoice is still `DRAFT`, `concession_total`/
 * `total` are completely free to set correctly here (unlike the
 * already-POSTED case `ConcessionsService.postStandalone()` has to work
 * around) — so sponsor-covered amounts are folded into `concession_total`/
 * `total` directly, exactly like a discretionary concession, and
 * `paid_amount` is deliberately left at `0`. This keeps `paid_amount` an
 * honest signal of "real cash/M-Pesa activity" for every invoice at the
 * moment it posts, which in turn keeps `voidInvoice()`'s BR-BILL-09
 * `paid_amount = 0` gate meaningful immediately after posting (a freshly
 * posted invoice — concessions, sponsor coverage, or plain — can always be
 * voided; only a REAL payment, from the not-yet-built Payments module,
 * blocks it). This is the opposite lever from `ConcessionsService.postStandalone()`'s
 * necessary `paid_amount` reuse — that method has no choice because
 * `total`/`concession_total` are frozen by then; this method has the choice
 * and takes the cleaner one.
 *
 * **Net AR movement (student ledger)**: the AR-Student control account's net
 * debit for this journal is `subtotal - (step2 + step3 reductions)`, which is
 * exactly `total` (`= balance`, since `paid_amount = 0` here) — so the
 * appended `std_ledger_entry` is `debit = invoice.total, credit = 0`,
 * reflecting what the STUDENT personally now owes (sponsor-covered/
 * concession amounts are excluded, since those moved to a different control
 * account or contra-income, never touching the student's own sub-ledger).
 *
 * **`voidInvoice()`** — BR-BILL-09: only when `paid_amount = 0` (else
 * `ValidationException` pointing at the credit-note path, Pass B). Reverses
 * the invoice's journal via `PostingService.reverse()` and flips
 * `status='VOID'`. Note the `voidInvoice()`/`postStandalone()` interaction
 * flagged in `ConcessionsService`'s doc comment: once a standalone
 * post-POSTED concession has been applied, `paid_amount > 0` and
 * `voidInvoice()` correctly refuses (an intended consequence of that design,
 * not a bug).
 */
@Injectable()
export class InvoicingService {
  constructor(
    private readonly invoiceRepository: BillInvoiceRepository,
    private readonly invoiceLineRepository: BillInvoiceLineRepository,
    private readonly feeStructureLineRepository: BillFeeStructureLineRepository,
    private readonly optionalItemRepository: BillStudentOptionalItemRepository,
    private readonly feeCategoryRepository: BillFeeCategoryRepository,
    private readonly concessionRepository: BillConcessionRepository,
    private readonly schemeRepository: BillConcessionSchemeRepository,
    private readonly sponsorAwardRepository: BillSponsorAwardRepository,
    private readonly studentRepository: StdStudentRepository,
    private readonly feeStructuresService: FeeStructuresService,
    private readonly glAccountRepository: GlAccountRepository,
    private readonly postingService: PostingService,
    private readonly numberingService: NumberingService,
    private readonly studentLedgerService: StudentLedgerService,
  ) {}

  async generateInvoice(em: EntityManager, input: GenerateInvoiceInput): Promise<BillInvoiceEntity> {
    await this.studentRepository.findByIdOrFail(input.studentId, em);
    const issueDate = input.issueDate ?? new Date().toISOString().slice(0, 10);
    // `dueDate` may legitimately precede `issueDate` (Phase 6 Slice 10
    // correction, migration `0232` dropped the old `ck_bill_invoice_due_after_issue`
    // guard) — an invoice generated today for a fee category whose real due
    // date has already passed must preserve that real due date, correctly
    // showing as already-overdue, not be forced to "due today."
    const dueDate = input.dueDate ?? issueDate;

    let feeStructureId: string | null = null;
    let structureVersion: number | null = null;
    const lineInputs: { feeCategoryId: string; description: string; amount: Money }[] = [];
    const categoryCache = new Map<string, BillFeeCategoryEntity>();
    const categoryFor = async (id: string): Promise<BillFeeCategoryEntity> => {
      const cached = categoryCache.get(id);
      if (cached) return cached;
      const category = await this.feeCategoryRepository.findByIdOrFail(id, em);
      categoryCache.set(id, category);
      return category;
    };

    if (input.source === "STRUCTURE") {
      const structure = await this.feeStructuresService.findApplicableFor(input.studentId, input.termId, em);
      if (!structure) {
        throw new NotFoundException(
          "BillFeeStructure(applicable)",
          `no PUBLISHED fee structure matches student=${input.studentId} term=${input.termId} (BR-BILL-02)`,
        );
      }
      feeStructureId = structure.id;
      structureVersion = structure.version;

      // Phase 6 Slice 3b: bill_fee_structure is now year-scoped (one structure spans a whole
      // academic year, each line carries its own term_id) — listByStructureAndTerm() filters
      // down to only the lines that apply to the term actually being billed here.
      const structureLines = await this.feeStructureLineRepository.listByStructureAndTerm(
        structure.id,
        input.termId,
        em,
      );
      const optionalItems = await this.optionalItemRepository.listByStudentAndTerm(input.studentId, input.termId, em);
      const optionalByCategory = new Map(optionalItems.map((item) => [item.feeCategoryId, item]));

      for (const line of structureLines) {
        if (line.isOptional) {
          const optIn = optionalByCategory.get(line.feeCategoryId);
          if (!optIn) continue; // not opted in (FR-BILL-013) — skip entirely
          const amount = optIn.amountOverride ?? line.amount;
          const category = await categoryFor(line.feeCategoryId);
          lineInputs.push({ feeCategoryId: line.feeCategoryId, description: category.name, amount });
        } else {
          const category = await categoryFor(line.feeCategoryId);
          lineInputs.push({ feeCategoryId: line.feeCategoryId, description: category.name, amount: line.amount });
        }
      }
      if (lineInputs.length === 0) {
        throw new ValidationException(
          `Fee structure ${structure.id} produced zero invoice lines for student ${input.studentId} (no mandatory lines and no optional opt-ins)`,
        );
      }
    } else {
      // ADHOC / RECURRING — this pass treats RECURRING identically to ADHOC
      // generation-wise (no recurring-billing-schedule table/service exists
      // yet); only the `source` enum value differs for downstream reporting.
      if (!input.adhocLines || input.adhocLines.length === 0) {
        throw new ValidationException(`source=${input.source} requires at least one adhocLines entry`);
      }
      for (const line of input.adhocLines) {
        lineInputs.push({ feeCategoryId: line.feeCategoryId, description: line.description, amount: line.amount });
      }
    }

    const subtotal = lineInputs.reduce((sum, line) => sum.add(line.amount), Money.ZERO);
    const invoiceId = generateUuidV7();

    let invoice: BillInvoiceEntity;
    try {
      invoice = await this.invoiceRepository.create(
        {
          id: invoiceId,
          // `number varchar(30)` (migration 0070) can't hold "DRAFT-" (6) + a full UUID (36) = 42
          // chars — truncate the hyphen-stripped UUID to fit.
          number: `DRAFT-${invoiceId.replace(/-/g, "").slice(0, 24)}`,
          studentId: input.studentId,
          termId: input.termId,
          feeStructureId,
          structureVersion,
          issueDate,
          dueDate,
          status: "DRAFT",
          source: input.source,
          subtotal,
          concessionTotal: Money.ZERO,
          total: subtotal,
          paidAmount: Money.ZERO,
          balance: subtotal,
          journalId: null,
          voidReason: null,
          voidedBy: null,
          createdBy: input.createdBy ?? null,
          updatedBy: input.createdBy ?? null,
        },
        em,
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `BR-BILL-04: student ${input.studentId} already has a live structure-generated invoice for term ${input.termId}/structure ${feeStructureId}`,
        );
      }
      throw error;
    }

    let lineNo = 1;
    for (const line of lineInputs) {
      await this.invoiceLineRepository.create(
        {
          invoiceId: invoice.id,
          lineNo: lineNo++,
          feeCategoryId: line.feeCategoryId,
          description: line.description,
          amount: line.amount,
          concessionAmount: Money.ZERO,
        },
        em,
      );
    }

    return invoice;
  }

  async postInvoice(em: EntityManager, invoiceId: string, postedBy: string): Promise<BillInvoiceEntity> {
    const invoice = await this.invoiceRepository.findByIdOrFail(invoiceId, em);
    if (invoice.status !== "DRAFT") {
      throw new ValidationException(`Only a DRAFT invoice may be posted (invoice ${invoiceId} status=${invoice.status})`);
    }
    const lines = await this.invoiceLineRepository.listByInvoice(invoiceId, em);
    if (lines.length === 0) {
      throw new ValidationException(`Invoice ${invoiceId} has no lines — nothing to post`);
    }
    const sortedLines = [...lines].sort((a, b) => a.lineNo - b.lineNo);

    const lineRemaining = new Map(sortedLines.map((line) => [line.id, line.amount]));
    let invoiceRemaining = invoice.subtotal;
    const lineConcessionApplied = new Map<string, Money>();
    const sponsorAwardIncrements = new Map<string, Money>();
    const journalLines: PostJournalLineDraft[] = [];
    const postedConcessions: BillConcessionEntity[] = [];
    let foldedTotal = Money.ZERO;

    // --- Step 2: fold already-APPROVED bill_concession rows (P-02/P-03/P-04) ---
    const approvedConcessions = (await this.concessionRepository.listByInvoice(invoiceId, em)).filter(
      (row) => row.status === "APPROVED",
    );
    for (const concession of approvedConcessions) {
      if (concession.invoiceLineId) {
        const remaining = lineRemaining.get(concession.invoiceLineId);
        if (remaining === undefined) {
          throw new ValidationException(`Concession ${concession.id} targets a line not on invoice ${invoiceId}`);
        }
        if (concession.amount.compare(remaining) > 0) {
          throw new ValidationException(
            `BR-BILL-06: concession ${concession.id} amount ${concession.amount.toDecimalString()} exceeds remaining balance ${remaining.toDecimalString()} of line ${concession.invoiceLineId}`,
          );
        }
        lineRemaining.set(concession.invoiceLineId, remaining.subtract(concession.amount));
        lineConcessionApplied.set(
          concession.invoiceLineId,
          (lineConcessionApplied.get(concession.invoiceLineId) ?? Money.ZERO).add(concession.amount),
        );
      }
      if (concession.amount.compare(invoiceRemaining) > 0) {
        throw new ValidationException(
          `BR-BILL-06: aggregate concessions on invoice ${invoiceId} would exceed subtotal ${invoice.subtotal.toDecimalString()}`,
        );
      }
      invoiceRemaining = invoiceRemaining.subtract(concession.amount);

      if (concession.sponsorAwardId) {
        const award = await this.sponsorAwardRepository.findByIdOrFail(concession.sponsorAwardId, em);
        const awardRemaining = award.amount.subtract(award.appliedAmount);
        if (concession.amount.compare(awardRemaining) > 0) {
          throw new ValidationException(
            `Concession ${concession.id} amount ${concession.amount.toDecimalString()} exceeds sponsor award ${award.id} remaining balance ${awardRemaining.toDecimalString()}`,
          );
        }
        const arSponsor = await resolveControlAccount(this.glAccountRepository, "AR_SPONSOR", em);
        journalLines.push({
          accountId: arSponsor.id,
          debit: concession.amount,
          credit: Money.ZERO,
          memo: `P-03 concession ${concession.id}`,
          entityRefType: "bill_concession",
          entityRefId: concession.id,
        });
        sponsorAwardIncrements.set(award.id, (sponsorAwardIncrements.get(award.id) ?? Money.ZERO).add(concession.amount));
      } else {
        if (!concession.schemeId) {
          throw new ValidationException(
            `Concession ${concession.id} has neither scheme_id nor sponsor_award_id — cannot resolve a GL account to post against`,
          );
        }
        const scheme = await this.schemeRepository.findByIdOrFail(concession.schemeId, em);
        const postingCode = concession.kind === "WAIVER" || concession.kind === "DISCOUNT" ? "P-02" : "P-04";
        journalLines.push({
          accountId: scheme.glAccountId,
          debit: concession.amount,
          credit: Money.ZERO,
          memo: `${postingCode} concession ${concession.id}`,
          entityRefType: "bill_concession",
          entityRefId: concession.id,
        });
      }
      foldedTotal = foldedTotal.add(concession.amount);
      postedConcessions.push(concession);
    }

    // --- Step 3: automatic sponsor-award coverage (P-03, FR-BILL-042.1/BR-BILL-13) ---
    const activeAwards = await this.sponsorAwardRepository.findActiveForStudent(invoice.studentId, invoice.termId, em);
    let autoSponsorTotal = Money.ZERO;
    for (const award of activeAwards) {
      let awardRemaining = award.amount.subtract(award.appliedAmount);
      if (!awardRemaining.isPositive()) continue;
      for (const line of sortedLines) {
        if (!awardRemaining.isPositive() || !invoiceRemaining.isPositive()) break;
        if (award.categoryScope && !award.categoryScope.includes(line.feeCategoryId)) continue;
        const capacity = lineRemaining.get(line.id) ?? Money.ZERO;
        if (!capacity.isPositive()) continue;
        const take = minMoney(minMoney(capacity, awardRemaining), invoiceRemaining);
        if (!take.isPositive()) continue;

        lineRemaining.set(line.id, capacity.subtract(take));
        awardRemaining = awardRemaining.subtract(take);
        invoiceRemaining = invoiceRemaining.subtract(take);
        autoSponsorTotal = autoSponsorTotal.add(take);
        sponsorAwardIncrements.set(award.id, (sponsorAwardIncrements.get(award.id) ?? Money.ZERO).add(take));
      }
    }
    if (autoSponsorTotal.isPositive()) {
      const arSponsor = await resolveControlAccount(this.glAccountRepository, "AR_SPONSOR", em);
      journalLines.push({
        accountId: arSponsor.id,
        debit: autoSponsorTotal,
        credit: Money.ZERO,
        memo: "P-03 sponsor award auto-coverage",
        entityRefType: "bill_sponsor_award",
        entityRefId: invoice.id,
      });
    }
    foldedTotal = foldedTotal.add(autoSponsorTotal);

    // Defensive re-assertion of BR-BILL-06 (should already hold by construction above).
    if (foldedTotal.compare(invoice.subtotal) > 0) {
      throw new ValidationException(
        `BR-BILL-06: combined concessions+sponsor-coverage ${foldedTotal.toDecimalString()} exceed invoice ${invoiceId} subtotal ${invoice.subtotal.toDecimalString()}`,
      );
    }

    // --- Step 1 (P-01): gross AR-Student debit + per-category fee-income credits ---
    const arStudent = await resolveControlAccount(this.glAccountRepository, "AR_STUDENT", em);
    const categoryTotals = new Map<string, Money>();
    for (const line of sortedLines) {
      categoryTotals.set(line.feeCategoryId, (categoryTotals.get(line.feeCategoryId) ?? Money.ZERO).add(line.amount));
    }
    const p01Lines: PostJournalLineDraft[] = [
      {
        accountId: arStudent.id,
        debit: invoice.subtotal,
        credit: Money.ZERO,
        memo: "P-01 invoice issued",
        entityRefType: "bill_invoice",
        entityRefId: invoice.id,
      },
    ];
    for (const [categoryId, amount] of categoryTotals) {
      const category = await this.feeCategoryRepository.findByIdOrFail(categoryId, em);
      p01Lines.push({
        accountId: category.glIncomeAccountId,
        debit: Money.ZERO,
        credit: amount,
        memo: `P-01 fee income ${category.name}`,
        entityRefType: "bill_fee_category",
        entityRefId: categoryId,
      });
    }

    if (foldedTotal.isPositive()) {
      journalLines.push({
        accountId: arStudent.id,
        debit: Money.ZERO,
        credit: foldedTotal,
        memo: "P-02/P-03/P-04 AR-Student reduction",
        entityRefType: "bill_invoice",
        entityRefId: invoice.id,
      });
    }

    const journal = await this.postingService.post(em, {
      journalDate: invoice.issueDate,
      sourceModule: "billing",
      sourceDocType: "bill_invoice",
      sourceDocId: invoice.id,
      narration: `Invoice posted (student ${invoice.studentId}, term ${invoice.termId})`,
      journalType: "MANUAL",
      postedBy,
      lines: [...p01Lines, ...journalLines],
    });

    const number = await this.numberingService.allocate(em, "BILL_INVOICE");
    const total = invoice.subtotal.subtract(foldedTotal);

    invoice.number = number;
    invoice.status = "POSTED";
    invoice.concessionTotal = foldedTotal;
    invoice.total = total;
    invoice.balance = total.subtract(invoice.paidAmount);
    invoice.journalId = journal.id;
    invoice.updatedBy = postedBy;
    const saved = await this.invoiceRepository.save(invoice, em);

    // Reflect line-scoped step-2 concessions on the line rows themselves
    // (bill_invoice_line.concession_amount — see that entity's doc comment;
    // sponsor auto-coverage deliberately does NOT touch this column, see
    // class doc comment step 3).
    for (const [lineId, applied] of lineConcessionApplied) {
      const line = sortedLines.find((row) => row.id === lineId)!;
      line.concessionAmount = applied;
      await this.invoiceLineRepository.save(line, em);
    }

    for (const concession of postedConcessions) {
      concession.status = "POSTED";
      concession.journalId = journal.id;
      concession.updatedBy = postedBy;
      await this.concessionRepository.save(concession, em);
    }

    for (const [awardId, increment] of sponsorAwardIncrements) {
      const award = await this.sponsorAwardRepository.findByIdOrFail(awardId, em);
      award.appliedAmount = award.appliedAmount.add(increment);
      award.updatedBy = postedBy;
      await this.sponsorAwardRepository.save(award, em);
    }

    await this.studentLedgerService.appendEntry(em, {
      studentId: invoice.studentId,
      entryDate: invoice.issueDate,
      docType: "BILL_INVOICE",
      docId: invoice.id,
      docNumber: number,
      debit: total,
      credit: Money.ZERO,
      memo: "Invoice posted",
    });

    return saved;
  }

  /** BR-BILL-09 — see class doc comment "voidInvoice()". */
  async voidInvoice(em: EntityManager, invoiceId: string, reason: string, voidedBy: string): Promise<BillInvoiceEntity> {
    const invoice = await this.invoiceRepository.findByIdOrFail(invoiceId, em);
    if (!["POSTED", "PARTIALLY_PAID", "PAID"].includes(invoice.status)) {
      throw new ValidationException(`Only a POSTED invoice may be voided (invoice ${invoiceId} status=${invoice.status})`);
    }
    if (invoice.paidAmount.isPositive()) {
      throw new ValidationException(
        `BR-BILL-09: invoice ${invoiceId} has payment/settlement applied (paid_amount=${invoice.paidAmount.toDecimalString()}) — void the balance via a credit note instead (Pass B), not voidInvoice()`,
      );
    }
    if (!invoice.journalId) {
      throw new Error(`Invoice ${invoiceId} has status=${invoice.status} but no journal_id — data integrity issue`);
    }

    await this.postingService.reverse(em, invoice.journalId, reason, voidedBy);

    invoice.status = "VOID";
    invoice.voidReason = reason;
    invoice.voidedBy = voidedBy;
    invoice.updatedBy = voidedBy;
    return this.invoiceRepository.save(invoice, em);
  }
}

function minMoney(a: Money, b: Money): Money {
  return a.compare(b) <= 0 ? a : b;
}

function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { code?: string; driverError?: { code?: string } })?.code ??
    (error as { driverError?: { code?: string } })?.driverError?.code;
  return code === PG_UNIQUE_VIOLATION;
}
