import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AccountingModule } from "../../accounting";
import { ApprovalsModule } from "../../platform/approvals";
import { SettingsModule } from "../../platform/settings";
import { DocumentVerificationModule } from "../../platform/document-verification";
import { BillFeeCategoryEntity } from "./domain/bill-fee-category.entity";
import { BillTransportRouteEntity } from "./domain/bill-transport-route.entity";
import { BillFeeStructureEntity } from "./domain/bill-fee-structure.entity";
import { BillFeeStructureLineEntity } from "./domain/bill-fee-structure-line.entity";
import { BillStudentOptionalItemEntity } from "./domain/bill-student-optional-item.entity";
import { BillInvoiceEntity } from "./domain/bill-invoice.entity";
import { BillInvoiceLineEntity } from "./domain/bill-invoice-line.entity";
import { BillInstallmentEntity } from "./domain/bill-installment.entity";
import { BillConcessionSchemeEntity } from "./domain/bill-concession-scheme.entity";
import { BillConcessionEntity } from "./domain/bill-concession.entity";
import { BillSponsorEntity } from "./domain/bill-sponsor.entity";
import { BillSponsorAwardEntity } from "./domain/bill-sponsor-award.entity";
import { BillCreditNoteEntity } from "./domain/bill-credit-note.entity";
import { BillCreditNoteLineEntity } from "./domain/bill-credit-note-line.entity";
import { BillDebitNoteEntity } from "./domain/bill-debit-note.entity";
import { BillDebitNoteLineEntity } from "./domain/bill-debit-note-line.entity";
import { BillRefundVoucherEntity } from "./domain/bill-refund-voucher.entity";
import { BillLateFeePolicyEntity } from "./domain/bill-late-fee-policy.entity";
import { BillLateFeeBatchEntity } from "./domain/bill-late-fee-batch.entity";
import { BillStudentCreditEntity } from "./domain/bill-student-credit.entity";
import { BillStudentCreditEntryEntity } from "./domain/bill-student-credit-entry.entity";
// `StudentsModule` is imported here, AFTER every one of this file's own
// domain-entity imports above (in particular `BillSponsorEntity`/
// `BillTransportRouteEntity`, indirectly via `bill-sponsor.entity.ts`/
// `bill-transport-route.entity.ts` not being imported by this specific
// module.ts, but by the entity re-exports above) — required ordering, not
// stylistic. `../students`' barrel eagerly loads `StudentsModule`, which
// transitively requires `std-student.entity.ts`, which imports
// `BillSponsorEntity`/`BillTransportRouteEntity` DIRECTLY from their entity
// files (see that entity's own doc comment on the bidirectional FK
// exception). Node's `require()` cache means those two files must already be
// fully loaded (any earlier require completes before this line runs) so the
// class values `std-student.entity.ts` needs are already resolved — the same
// "entities load before sibling-module imports" discipline
// `domains/students`' own foundation-pass fix established for the reverse
// direction. Application-service files (`fee-structures.service.ts`,
// `invoicing.service.ts`, `bulk-billing.service.ts`) import `../../students`'
// barrel directly for `StdStudentRepository`/`StudentLedgerService` — that is
// safe regardless of ordering since those are plain injectable classes, not
// entity-decorator targets (see each file's own import comment).
import { StudentsModule } from "../students";
import { BillFeeCategoryRepository } from "./infrastructure/bill-fee-category.repository";
import { BillTransportRouteRepository } from "./infrastructure/bill-transport-route.repository";
import { BillFeeStructureRepository } from "./infrastructure/bill-fee-structure.repository";
import { BillFeeStructureLineRepository } from "./infrastructure/bill-fee-structure-line.repository";
import { BillStudentOptionalItemRepository } from "./infrastructure/bill-student-optional-item.repository";
import { BillInvoiceRepository } from "./infrastructure/bill-invoice.repository";
import { BillInvoiceLineRepository } from "./infrastructure/bill-invoice-line.repository";
import { BillInstallmentRepository } from "./infrastructure/bill-installment.repository";
import { BillConcessionSchemeRepository } from "./infrastructure/bill-concession-scheme.repository";
import { BillConcessionRepository } from "./infrastructure/bill-concession.repository";
import { BillSponsorRepository } from "./infrastructure/bill-sponsor.repository";
import { BillSponsorAwardRepository } from "./infrastructure/bill-sponsor-award.repository";
import { BillCreditNoteRepository } from "./infrastructure/bill-credit-note.repository";
import { BillCreditNoteLineRepository } from "./infrastructure/bill-credit-note-line.repository";
import { BillDebitNoteRepository } from "./infrastructure/bill-debit-note.repository";
import { BillDebitNoteLineRepository } from "./infrastructure/bill-debit-note-line.repository";
import { BillRefundVoucherRepository } from "./infrastructure/bill-refund-voucher.repository";
import { BillLateFeePolicyRepository } from "./infrastructure/bill-late-fee-policy.repository";
import { BillLateFeeBatchRepository } from "./infrastructure/bill-late-fee-batch.repository";
import { BillStudentCreditRepository } from "./infrastructure/bill-student-credit.repository";
import { BillStudentCreditEntryRepository } from "./infrastructure/bill-student-credit-entry.repository";
import { FeeCategoriesService } from "./application/fee-categories.service";
import { TransportRoutesService } from "./application/transport-routes.service";
import { FeeStructuresService } from "./application/fee-structures.service";
import { StudentOptionalItemsService } from "./application/student-optional-items.service";
import { ConcessionSchemesService } from "./application/concession-schemes.service";
import { SponsorsService } from "./application/sponsors.service";
import { SponsorAwardsService } from "./application/sponsor-awards.service";
import { ConcessionsService } from "./application/concessions.service";
import { InvoicingService } from "./application/invoicing.service";
import { BulkBillingService } from "./application/bulk-billing.service";
import { BulkAdhocInvoicesService } from "./application/bulk-adhoc-invoices.service";
import { CreditNotesService } from "./application/credit-notes.service";
import { DebitNotesService } from "./application/debit-notes.service";
import { RefundVouchersService } from "./application/refund-vouchers.service";
import { LateFeePoliciesService } from "./application/late-fee-policies.service";
import { LateFeeBatchesService } from "./application/late-fee-batches.service";
import { StudentCreditService } from "./application/student-credit.service";
import { FeeCategoriesController } from "./api/fee-categories.controller";
import { TransportRoutesController } from "./api/transport-routes.controller";
import { FeeStructuresController } from "./api/fee-structures.controller";
import { StudentOptionalItemsController } from "./api/student-optional-items.controller";
import { ConcessionSchemesController } from "./api/concession-schemes.controller";
import { ConcessionsController } from "./api/concessions.controller";
import { SponsorsController } from "./api/sponsors.controller";
import { SponsorAwardsController } from "./api/sponsor-awards.controller";
import { InvoicesController } from "./api/invoices.controller";
import { BulkBillingController } from "./api/bulk-billing.controller";
import { BulkAdhocInvoicesController } from "./api/bulk-adhoc-invoices.controller";
import { CreditNotesController } from "./api/credit-notes.controller";
import { DebitNotesController } from "./api/debit-notes.controller";
import { RefundVouchersController } from "./api/refund-vouchers.controller";
import { LateFeePoliciesController } from "./api/late-fee-policies.controller";
import { LateFeeBatchesController } from "./api/late-fee-batches.controller";
import { StudentCreditController } from "./api/student-credit.controller";

/**
 * Module 9 (Billing) — PASS A (core billing engine) + PASS B (credit/debit
 * notes, refund vouchers, late fees, all 15 controllers) of the
 * application-layer pass, on top of the foundation pass
 * (entities/repositories/migration/triggers; docs/phase-5/PROGRESS.md).
 * Imports `AccountingModule`/`SettingsModule`/`ApprovalsModule`/
 * `StudentsModule` (not just their entities) — `InvoicingService`/
 * `ConcessionsService`/`CreditNotesService`/`RefundVouchersService`/
 * `LateFeeBatchesService` call `PostingService.post()`/`.reverse()`,
 * `GlAccountRepository` (`AccountingModule`), `NumberingService.allocate()`
 * (`SettingsModule`), `ApprovalEngineService.submit()` (`ApprovalsModule`),
 * and `StudentLedgerService.appendEntry()`/`StdStudentRepository`
 * (`StudentsModule`) at runtime — all via each sibling's public barrel only,
 * per `module-deps.json`'s updated `domains/billing` entry. `controllers`
 * registers all 15 Pass A + Pass B REST controllers (full DTOs/Swagger,
 * `@RequirePermission`-guarded — see `api/*.controller.ts` and
 * `api/dto/*.ts`).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      BillFeeCategoryEntity,
      BillTransportRouteEntity,
      BillFeeStructureEntity,
      BillFeeStructureLineEntity,
      BillStudentOptionalItemEntity,
      BillInvoiceEntity,
      BillInvoiceLineEntity,
      BillInstallmentEntity,
      BillConcessionSchemeEntity,
      BillConcessionEntity,
      BillSponsorEntity,
      BillSponsorAwardEntity,
      BillCreditNoteEntity,
      BillCreditNoteLineEntity,
      BillDebitNoteEntity,
      BillDebitNoteLineEntity,
      BillRefundVoucherEntity,
      BillLateFeePolicyEntity,
      BillLateFeeBatchEntity,
      BillStudentCreditEntity,
      BillStudentCreditEntryEntity,
    ]),
    AccountingModule,
    SettingsModule,
    ApprovalsModule,
    DocumentVerificationModule,
    StudentsModule,
  ],
  controllers: [
    FeeCategoriesController,
    TransportRoutesController,
    FeeStructuresController,
    StudentOptionalItemsController,
    ConcessionSchemesController,
    ConcessionsController,
    SponsorsController,
    SponsorAwardsController,
    InvoicesController,
    BulkBillingController,
    BulkAdhocInvoicesController,
    CreditNotesController,
    DebitNotesController,
    RefundVouchersController,
    LateFeePoliciesController,
    LateFeeBatchesController,
    StudentCreditController,
  ],
  providers: [
    BillFeeCategoryRepository,
    BillTransportRouteRepository,
    BillFeeStructureRepository,
    BillFeeStructureLineRepository,
    BillStudentOptionalItemRepository,
    BillInvoiceRepository,
    BillInvoiceLineRepository,
    BillInstallmentRepository,
    BillConcessionSchemeRepository,
    BillConcessionRepository,
    BillSponsorRepository,
    BillSponsorAwardRepository,
    BillCreditNoteRepository,
    BillCreditNoteLineRepository,
    BillDebitNoteRepository,
    BillDebitNoteLineRepository,
    BillRefundVoucherRepository,
    BillLateFeePolicyRepository,
    BillLateFeeBatchRepository,
    BillStudentCreditRepository,
    BillStudentCreditEntryRepository,
    FeeCategoriesService,
    TransportRoutesService,
    FeeStructuresService,
    StudentOptionalItemsService,
    ConcessionSchemesService,
    SponsorsService,
    SponsorAwardsService,
    ConcessionsService,
    InvoicingService,
    BulkBillingService,
    BulkAdhocInvoicesService,
    CreditNotesService,
    DebitNotesService,
    RefundVouchersService,
    LateFeePoliciesService,
    LateFeeBatchesService,
    StudentCreditService,
  ],
  exports: [
    BillFeeCategoryRepository,
    BillTransportRouteRepository,
    BillFeeStructureRepository,
    BillFeeStructureLineRepository,
    BillStudentOptionalItemRepository,
    BillInvoiceRepository,
    BillInvoiceLineRepository,
    BillInstallmentRepository,
    BillConcessionSchemeRepository,
    BillConcessionRepository,
    BillSponsorRepository,
    BillSponsorAwardRepository,
    BillCreditNoteRepository,
    BillCreditNoteLineRepository,
    BillDebitNoteRepository,
    BillDebitNoteLineRepository,
    BillRefundVoucherRepository,
    BillLateFeePolicyRepository,
    BillLateFeeBatchRepository,
    BillStudentCreditRepository,
    BillStudentCreditEntryRepository,
    FeeCategoriesService,
    TransportRoutesService,
    FeeStructuresService,
    StudentOptionalItemsService,
    ConcessionSchemesService,
    SponsorsService,
    SponsorAwardsService,
    ConcessionsService,
    InvoicingService,
    BulkBillingService,
    BulkAdhocInvoicesService,
    CreditNotesService,
    DebitNotesService,
    RefundVouchersService,
    LateFeePoliciesService,
    LateFeeBatchesService,
    StudentCreditService,
  ],
})
export class BillingModule {}
