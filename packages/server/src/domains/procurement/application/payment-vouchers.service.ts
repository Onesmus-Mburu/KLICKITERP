import { Injectable, Logger } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { Money } from "../../../shared/money/money";
import { GlAccountRepository, PostingService } from "../../../accounting";
import { ApprovalEngineService } from "../../../platform/approvals";
import { NotificationsService } from "../../../platform/comms";
import { NumberingService } from "../../../platform/settings";
import { ProcPaymentVoucherEntity, ProcPaymentVoucherMethod, ProcPaymentVoucherStatus } from "../domain/proc-payment-voucher.entity";
import { PROC_SUPPLIER_INVOICE_OPEN_STATUSES } from "../domain/proc-supplier-invoice.entity";
import { ProcPaymentVoucherRepository } from "../infrastructure/proc-payment-voucher.repository";
import { ProcSupplierInvoiceRepository } from "../infrastructure/proc-supplier-invoice.repository";
import { ProcSupplierRepository } from "../infrastructure/proc-supplier.repository";
import { ProcVoucherAllocationRepository } from "../infrastructure/proc-voucher-allocation.repository";
import { resolveApSupplierControlAccount } from "./gl-ap-accounts.util";
import { resolveProcPaymentClearingAccount } from "./payment-clearing-accounts.util";

/** `appr_workflow_def.domain_code` this module submits payment vouchers under (FR-PROC-008.1's "amount-tiered SUPPLIER_PAYMENTS chain") — see class doc comment "submitForApproval()". */
export const SUPPLIER_PAYMENTS_APPROVAL_DOMAIN_CODE = "SUPPLIER_PAYMENTS";

export interface CreatePaymentVoucherAllocationInput {
  supplierInvoiceId: string;
  amount: Money;
}

export interface CreatePaymentVoucherInput {
  supplierId: string;
  method: ProcPaymentVoucherMethod;
  bankAccountId?: string | null;
  chequeLeafId?: string | null;
  allocations: CreatePaymentVoucherAllocationInput[];
}

/**
 * Extracts a plausible email address out of `proc_supplier.contacts`
 * (opaque jsonb, no documented shape anywhere in this codebase — confirmed
 * against `bill_sponsor.contacts`'s identical `Record<string, unknown>`
 * treatment, also undocumented). A single best-effort `contacts.email`
 * string-field read — if present and shaped like an email, used; if absent
 * (or any other shape), `null` — see class doc comment "execute()" for what
 * happens next.
 */
function extractSupplierEmail(contacts: Record<string, unknown>): string | null {
  const email = contacts?.["email"];
  return typeof email === "string" && email.includes("@") ? email : null;
}

/**
 * `proc_payment_voucher` (+`proc_voucher_allocation`): create -> submit ->
 * approve/reject -> execute (FR-PROC-008.1, BR-PROC-04). The "two-step
 * submit-then-execute" shape mirrors `domains/payments`' own reversal-like
 * actions and this module's own Pass-A precedent (`PurchaseOrdersService`
 * submit -> approve -> `issue()`; `GrnService` `receive()` -> `post()`):
 * approval alone never moves money — a separate, explicit `execute()` call
 * is what actually posts the P-21 journal and marks invoices paid.
 *
 * **`create()`** — BR-PROC-04 ("supplier payments may not exceed the
 * supplier's open approved-unpaid invoice balance less credits"): each
 * allocation is checked against that invoice's OWN open balance (`total -
 * paid_amount`), requiring `status` in `POSTED`/`PARTIALLY_PAID` (the same
 * `PROC_SUPPLIER_INVOICE_OPEN_STATUSES` `ix_proc_inv_supplier_open` indexes).
 * `total = Σ allocations` — the DB trigger `trg_proc_voucher_allocation_sum`
 * (migration `0100`, `DEFERRABLE INITIALLY DEFERRED`) is the transaction-
 * commit-time backstop for "allocations sum to voucher total"; this method's
 * own per-allocation ceiling check is the OTHER half of BR-PROC-04 that
 * trigger deliberately does not enforce (per its own doc comment — a
 * cross-row check against `paid_amount` at allocation time). `status='DRAFT'`,
 * `number` starts as a `DRAFT-<uuid>` placeholder (mirrors `GrnService.
 * receive()`/`PurchaseOrdersService.createFromRequisition()` — not
 * meaningful until actually executed/paid).
 *
 * **`submitForApproval()`** — FR-PROC-008.1 calls the `SUPPLIER_PAYMENTS`
 * chain "amount-tiered", but a real multi-tier role chain needs
 * school-specific approver roles beyond "System Admin"/"Auditor" that don't
 * exist in this codebase's seed yet — so, per the task brief's own explicit
 * instruction, this pass seeds a single-level System-Admin workflow (the
 * SAME `seedSingleLevelWorkflow()` shape every other domain code in
 * `0900-seed-permissions-and-roles.ts` gets), documenting that genuine
 * amount-tiered tiers are a future refinement once more granular
 * roles/routing rules exist. `onApprovalDecided()` is the same manual-
 * trigger interim pattern `RequisitionsService`/`PurchaseOrdersService`
 * already established (no event dispatcher off `ApprovalEngineService.
 * decide()` exists anywhere in this codebase yet).
 *
 * **`execute(em, voucherId)`** — requires `APPROVED`. Re-checks BR-PROC-04's
 * per-allocation ceiling against each invoice's CURRENT open balance (not
 * just the balance at `create()` time — another payment could have been
 * applied to the same invoice in between) before doing anything irreversible.
 * ONE `PostingService.post()` call realizes P-21: debit `AP_SUPPLIER`
 * (`gl-ap-accounts.util.ts`) for the voucher total, credit the method-
 * resolved clearing account (`payment-clearing-accounts.util.ts`). Updates
 * every allocated `proc_supplier_invoice.paid_amount`/`.status`
 * (`PARTIALLY_PAID` if `paid_amount < total`, else `PAID`).
 * `NumberingService.allocate(em, 'PROC_PAYMENT_VOUCHER')` resolves the real
 * `number` at this point. `status='PAID'`, `journal_id` set.
 *
 * **Remittance advice** (FR-PROC-008.1's "on execution ... + remittance
 * advice email") — real, wired integration with `platform/comms`'
 * `NotificationsService` (this module's `mayImport` list,
 * `packages/config/eslint/module-deps.json`, is extended to add
 * `platform/comms` for this pass — see that file's own updated entry), NOT
 * the `domains/comms` module the task brief names (no such module exists in
 * this codebase; the real one lives at `platform/comms`, confirmed by
 * searching the whole `packages/server/src` tree). Wiring it in was
 * genuinely straightforward: `NotificationsService.send()` defaults to a
 * `LogOnlyAdapter` (always a successful synthetic send) whenever no real
 * SMTP integration is configured, so this call is safe end-to-end in every
 * environment, dev or prod. The one real gap is exactly what the task brief
 * anticipated: `proc_supplier.contacts` is fully opaque, undocumented jsonb
 * (confirmed — no other jsonb "contacts" column anywhere in this codebase
 * documents its own shape either, e.g. `bill_sponsor.contacts`) — this
 * method makes one best-effort attempt to read a `contacts.email` string
 * field (`extractSupplierEmail()` above); if present, the remittance email
 * is actually sent and `remittance_sent` is set `true` only on a `SENT`
 * result; if the supplier has no such field (the realistic default for
 * every supplier captured via this pass's own `SuppliersService`, which
 * never requires a shaped `contacts` payload), `remittance_sent` stays
 * `false` with no attempted send — never a silent failure, and never
 * fabricated contact data. A failed/thrown send is swallowed (caught,
 * logged) and never fails the payment execution itself — the money has
 * already genuinely moved by the time the remittance step runs.
 */
@Injectable()
export class PaymentVouchersService {
  private readonly logger = new Logger(PaymentVouchersService.name);

  constructor(
    private readonly voucherRepository: ProcPaymentVoucherRepository,
    private readonly allocationRepository: ProcVoucherAllocationRepository,
    private readonly supplierInvoiceRepository: ProcSupplierInvoiceRepository,
    private readonly supplierRepository: ProcSupplierRepository,
    private readonly glAccountRepository: GlAccountRepository,
    private readonly postingService: PostingService,
    private readonly numberingService: NumberingService,
    private readonly approvalEngine: ApprovalEngineService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(em: EntityManager, input: CreatePaymentVoucherInput, actorId: string | null): Promise<ProcPaymentVoucherEntity> {
    if (input.allocations.length === 0) {
      throw new ValidationException("A payment voucher needs at least one allocation");
    }
    const supplier = await this.supplierRepository.findByIdOrFail(input.supplierId, em);

    let total = Money.ZERO;
    for (const allocation of input.allocations) {
      if (!allocation.amount.isPositive()) {
        throw new ValidationException("ck_proc_voucher_allocation_amount_positive: allocation amount must be > 0");
      }
      const invoice = await this.supplierInvoiceRepository.findByIdOrFail(allocation.supplierInvoiceId, em);
      if (invoice.supplierId !== supplier.id) {
        throw new ValidationException(`Supplier invoice ${invoice.id} does not belong to supplier ${supplier.id}`);
      }
      if (!PROC_SUPPLIER_INVOICE_OPEN_STATUSES.includes(invoice.status)) {
        throw new ValidationException(
          `BR-PROC-04: supplier invoice ${invoice.id} is not open (status=${invoice.status}, expected POSTED/PARTIALLY_PAID)`,
        );
      }
      const openBalance = invoice.total.subtract(invoice.paidAmount);
      if (allocation.amount.compare(openBalance) > 0) {
        throw new ValidationException(
          `BR-PROC-04: allocation ${allocation.amount.toDecimalString()} exceeds supplier invoice ${invoice.id}'s open balance ${openBalance.toDecimalString()}`,
        );
      }
      total = total.add(allocation.amount);
    }

    const voucherId = generateUuidV7();
    const voucher = await this.voucherRepository.create(
      {
        id: voucherId,
        // `number varchar(30)` (migration 0100) can't hold "DRAFT-" (6) + a full UUID (36) = 42
        // chars — truncate the hyphen-stripped UUID to fit.
        number: `DRAFT-${voucherId.replace(/-/g, "").slice(0, 24)}`,
        supplierId: supplier.id,
        method: input.method,
        bankAccountId: input.bankAccountId ?? null,
        chequeLeafId: input.chequeLeafId ?? null,
        total,
        status: "DRAFT",
        approvalRef: null,
        journalId: null,
        remittanceSent: false,
        createdBy: actorId,
        updatedBy: actorId,
      },
      em,
    );

    for (const allocation of input.allocations) {
      await this.allocationRepository.create(
        {
          voucherId: voucher.id,
          supplierInvoiceId: allocation.supplierInvoiceId,
          amount: allocation.amount,
          createdBy: actorId,
          updatedBy: actorId,
        },
        em,
      );
    }

    return voucher;
  }

  async findByIdOrFail(id: string): Promise<ProcPaymentVoucherEntity> {
    return this.voucherRepository.findByIdOrFail(id);
  }

  async list(filter: { status?: ProcPaymentVoucherStatus; supplierId?: string } = {}): Promise<ProcPaymentVoucherEntity[]> {
    return this.voucherRepository.list(filter);
  }

  async listAllocations(voucherId: string) {
    return this.allocationRepository.findByVoucherId(voucherId);
  }

  /** See class doc comment "submitForApproval()". */
  async submitForApproval(em: EntityManager, voucherId: string, initiatorId: string): Promise<ProcPaymentVoucherEntity> {
    const voucher = await this.voucherRepository.findByIdOrFail(voucherId, em);
    if (voucher.status !== "DRAFT") {
      throw new ValidationException(`Only a DRAFT payment voucher can be submitted for approval (voucher ${voucherId} status=${voucher.status})`);
    }
    const allocations = await this.allocationRepository.findByVoucherId(voucherId, em);
    if (allocations.length === 0) {
      throw new ValidationException(`Payment voucher ${voucherId} has no allocations — nothing to submit`);
    }

    const instance = await this.approvalEngine.submit(em, {
      domainCode: SUPPLIER_PAYMENTS_APPROVAL_DOMAIN_CODE,
      entityType: "proc_payment_voucher",
      entityId: voucher.id,
      amount: voucher.total,
      initiatorId,
    });
    voucher.status = "PENDING_APPROVAL";
    voucher.approvalRef = instance.id;
    voucher.updatedBy = initiatorId;
    return this.voucherRepository.save(voucher, em);
  }

  /** Manual-trigger interim pattern — see class doc comment. Rejection returns the voucher to DRAFT for correction/resubmission. */
  async onApprovalDecided(voucherId: string, approved: boolean, actorId: string | null = null): Promise<ProcPaymentVoucherEntity> {
    const voucher = await this.voucherRepository.findByIdOrFail(voucherId);
    if (voucher.status !== "PENDING_APPROVAL") {
      throw new ValidationException(`proc_payment_voucher ${voucherId} is not PENDING_APPROVAL (status=${voucher.status})`);
    }
    voucher.status = approved ? "APPROVED" : "DRAFT";
    voucher.updatedBy = actorId;
    return this.voucherRepository.save(voucher);
  }

  /** See class doc comment "execute()". */
  async execute(em: EntityManager, voucherId: string, executedBy: string): Promise<ProcPaymentVoucherEntity> {
    const voucher = await this.voucherRepository.findByIdOrFail(voucherId, em);
    if (voucher.status !== "APPROVED") {
      throw new ValidationException(`Only an APPROVED payment voucher can be executed (voucher ${voucherId} status=${voucher.status})`);
    }
    const allocations = await this.allocationRepository.findByVoucherId(voucherId, em);
    if (allocations.length === 0) {
      throw new ValidationException(`Payment voucher ${voucherId} has no allocations — nothing to execute`);
    }

    // BR-PROC-04 re-checked against CURRENT open balances — see class doc comment.
    for (const allocation of allocations) {
      const invoice = await this.supplierInvoiceRepository.findByIdOrFail(allocation.supplierInvoiceId, em);
      const openBalance = invoice.total.subtract(invoice.paidAmount);
      if (allocation.amount.compare(openBalance) > 0) {
        throw new ValidationException(
          `BR-PROC-04: at execution time, allocation ${allocation.amount.toDecimalString()} exceeds supplier invoice ${invoice.id}'s CURRENT open balance ${openBalance.toDecimalString()} — another payment must have settled part of it since this voucher was created`,
        );
      }
    }

    const apAccount = await resolveApSupplierControlAccount(this.glAccountRepository, em);
    const clearingAccount = await resolveProcPaymentClearingAccount(this.glAccountRepository, voucher.method, em);

    const journal = await this.postingService.post(em, {
      journalDate: new Date().toISOString().slice(0, 10),
      sourceModule: "procurement",
      sourceDocType: "proc_payment_voucher",
      sourceDocId: voucher.id,
      narration: `Supplier payment voucher for supplier ${voucher.supplierId} (${voucher.method})`,
      journalType: "MANUAL",
      postedBy: executedBy,
      lines: [
        {
          accountId: apAccount.id,
          debit: voucher.total,
          credit: Money.ZERO,
          memo: "P-21 AP - Suppliers settled",
          entityRefType: "proc_payment_voucher",
          entityRefId: voucher.id,
        },
        {
          accountId: clearingAccount.id,
          debit: Money.ZERO,
          credit: voucher.total,
          memo: `P-21 ${voucher.method} clearing`,
          entityRefType: "proc_payment_voucher",
          entityRefId: voucher.id,
        },
      ],
    });

    for (const allocation of allocations) {
      const invoice = await this.supplierInvoiceRepository.findByIdOrFail(allocation.supplierInvoiceId, em);
      invoice.paidAmount = invoice.paidAmount.add(allocation.amount);
      invoice.status = invoice.paidAmount.compare(invoice.total) >= 0 ? "PAID" : "PARTIALLY_PAID";
      invoice.updatedBy = executedBy;
      await this.supplierInvoiceRepository.save(invoice, em);
    }

    const number = await this.numberingService.allocate(em, "PROC_PAYMENT_VOUCHER");
    voucher.number = number;
    voucher.status = "PAID";
    voucher.journalId = journal.id;
    voucher.updatedBy = executedBy;
    let saved = await this.voucherRepository.save(voucher, em);

    saved = await this.attemptRemittanceAdvice(em, saved);

    return saved;
  }

  /** Best-effort — see class doc comment "Remittance advice". Never throws; a failed/skipped send never fails `execute()`. */
  private async attemptRemittanceAdvice(em: EntityManager, voucher: ProcPaymentVoucherEntity): Promise<ProcPaymentVoucherEntity> {
    try {
      const supplier = await this.supplierRepository.findByIdOrFail(voucher.supplierId, em);
      const recipient = extractSupplierEmail(supplier.contacts);
      if (!recipient) {
        this.logger.log(
          `Payment voucher ${voucher.number}: no contacts.email on supplier ${supplier.id} — remittance_sent stays false (see PaymentVouchersService doc comment)`,
        );
        return voucher;
      }
      const message = await this.notificationsService.send({
        channel: "EMAIL",
        recipient,
        subject: `Remittance advice — payment voucher ${voucher.number}`,
        body: `Dear ${supplier.name}, a payment of KES ${voucher.total.toDecimalString()} has been made via ${voucher.method} against voucher ${voucher.number}.`,
        entityType: "proc_payment_voucher",
        entityId: voucher.id,
      });
      if (message.status === "SENT") {
        voucher.remittanceSent = true;
        return this.voucherRepository.save(voucher, em);
      }
      return voucher;
    } catch (error) {
      this.logger.warn(`Payment voucher ${voucher.number}: remittance advice send failed: ${(error as Error).message}`);
      return voucher;
    }
  }
}
