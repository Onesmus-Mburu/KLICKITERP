/**
 * Public barrel — the only surface any future sibling module should import
 * from (`crossSiblingImportPolicy` in module-deps.json). PASS A of the
 * application-layer pass (docs/phase-5/PROGRESS.md Module 9) — `application`
 * services now exported; `api`/`events` still do not exist (Pass B: ALL
 * controllers for both passes' services, permission catalogue, seed).
 *
 * `BillSponsorEntity`/`BillTransportRouteEntity` are the two entities
 * `domains/students`' `std-student.entity.ts` imports from here for its real
 * `sponsor_id`/`transport_route_id` FKs (closing the Module 8 forward-reference
 * gap) — see `module-deps.json`'s `domains/students` entry for the documented
 * bidirectional-exception rationale.
 */
export { BillingModule } from "./billing.module";

export { FeeCategoriesService } from "./application/fee-categories.service";
export type { CreateFeeCategoryInput, UpdateFeeCategoryInput } from "./application/fee-categories.service";
export { TransportRoutesService } from "./application/transport-routes.service";
export type { CreateTransportRouteInput, UpdateTransportRouteInput } from "./application/transport-routes.service";
export { FeeStructuresService, FEE_STRUCTURE_DOCUMENT_TYPE } from "./application/fee-structures.service";
export type { CreateFeeStructureInput, CreateFeeStructureLineInput } from "./application/fee-structures.service";
export { StudentOptionalItemsService } from "./application/student-optional-items.service";
export type {
  CreateStudentOptionalItemInput,
  UpdateStudentOptionalItemInput,
} from "./application/student-optional-items.service";
export { ConcessionSchemesService } from "./application/concession-schemes.service";
export type {
  CreateConcessionSchemeInput,
  UpdateConcessionSchemeInput,
} from "./application/concession-schemes.service";
export { SponsorsService } from "./application/sponsors.service";
export type { CreateSponsorInput, UpdateSponsorInput } from "./application/sponsors.service";
export { SponsorAwardsService } from "./application/sponsor-awards.service";
export type {
  CreateSponsorAwardInput,
  UpdateSponsorAwardInput,
  SponsorAwardCoverage,
} from "./application/sponsor-awards.service";
export { ConcessionsService, BILLING_CONCESSION_APPROVAL_DOMAIN_CODE } from "./application/concessions.service";
export type { RequestConcessionInput } from "./application/concessions.service";
export { InvoicingService } from "./application/invoicing.service";
export type {
  GenerateInvoiceInput,
  GenerateInvoiceAdhocLine,
  GenerateInvoiceSource,
} from "./application/invoicing.service";
export { BulkBillingService } from "./application/bulk-billing.service";
export type { BulkGenerateFilter, BulkGenerateFailure, BulkGenerateResult } from "./application/bulk-billing.service";
export { resolveControlAccount } from "./application/gl-control-accounts.util";
export { CreditNotesService, BILLING_CREDIT_NOTE_APPROVAL_DOMAIN_CODE } from "./application/credit-notes.service";
export type { CreateCreditNoteInput, CreateCreditNoteLineInput } from "./application/credit-notes.service";
export { DebitNotesService } from "./application/debit-notes.service";
export type { CreateDebitNoteInput, CreateDebitNoteLineInput } from "./application/debit-notes.service";
export { RefundVouchersService, REFUNDS_APPROVAL_DOMAIN_CODE } from "./application/refund-vouchers.service";
export type { CreateRefundVoucherInput } from "./application/refund-vouchers.service";
export { LateFeePoliciesService } from "./application/late-fee-policies.service";
export type { CreateLateFeePolicyInput, UpdateLateFeePolicyInput } from "./application/late-fee-policies.service";
export {
  LateFeeBatchesService,
  BILLING_LATE_FEE_APPROVAL_DOMAIN_CODE,
  LATE_FEE_INCOME_CATEGORY_NAME,
} from "./application/late-fee-batches.service";
export type { LateFeeBatchSummary } from "./application/late-fee-batches.service";
export { StudentCreditService } from "./application/student-credit.service";
export type {
  IssueStudentCreditInput,
  ConsumeStudentCreditInput,
  NetOutIssuedCreditInput,
} from "./application/student-credit.service";

export { BillFeeCategoryEntity } from "./domain/bill-fee-category.entity";
export { BillTransportRouteEntity } from "./domain/bill-transport-route.entity";
export {
  BillFeeStructureEntity,
  BILL_FEE_STRUCTURE_STATUSES,
  BILL_FEE_STRUCTURE_BOARDING_KINDS,
} from "./domain/bill-fee-structure.entity";
export type { BillFeeStructureStatus, BillFeeStructureBoarding } from "./domain/bill-fee-structure.entity";
export { BillFeeStructureLineEntity } from "./domain/bill-fee-structure-line.entity";
export { BillStudentOptionalItemEntity } from "./domain/bill-student-optional-item.entity";
export {
  BillInvoiceEntity,
  BILL_INVOICE_STATUSES,
  BILL_INVOICE_IMMUTABLE_STATUSES,
  BILL_INVOICE_SOURCES,
} from "./domain/bill-invoice.entity";
export type { BillInvoiceStatus, BillInvoiceSource } from "./domain/bill-invoice.entity";
export { BillInvoiceLineEntity } from "./domain/bill-invoice-line.entity";
export { BillInstallmentEntity } from "./domain/bill-installment.entity";
export {
  BillConcessionSchemeEntity,
  BILL_CONCESSION_KINDS,
  BILL_CONCESSION_CALCS,
} from "./domain/bill-concession-scheme.entity";
export type { BillConcessionKind, BillConcessionCalc } from "./domain/bill-concession-scheme.entity";
export { BillConcessionEntity, BILL_CONCESSION_STATUSES } from "./domain/bill-concession.entity";
export type { BillConcessionStatus } from "./domain/bill-concession.entity";
export { BillSponsorEntity } from "./domain/bill-sponsor.entity";
export { BillSponsorAwardEntity } from "./domain/bill-sponsor-award.entity";
export { BillCreditNoteEntity, BILL_NOTE_STATUSES } from "./domain/bill-credit-note.entity";
export type { BillNoteStatus } from "./domain/bill-credit-note.entity";
export { BillCreditNoteLineEntity } from "./domain/bill-credit-note-line.entity";
export { BillDebitNoteEntity } from "./domain/bill-debit-note.entity";
export { BillDebitNoteLineEntity } from "./domain/bill-debit-note-line.entity";
export {
  BillRefundVoucherEntity,
  BILL_REFUND_METHODS,
  BILL_REFUND_VOUCHER_STATUSES,
} from "./domain/bill-refund-voucher.entity";
export type { BillRefundMethod, BillRefundVoucherStatus } from "./domain/bill-refund-voucher.entity";
export { BillLateFeePolicyEntity, BILL_LATE_FEE_MODES } from "./domain/bill-late-fee-policy.entity";
export type { BillLateFeeMode } from "./domain/bill-late-fee-policy.entity";
export { BillLateFeeBatchEntity, BILL_LATE_FEE_BATCH_STATUSES } from "./domain/bill-late-fee-batch.entity";
export type { BillLateFeeBatchStatus } from "./domain/bill-late-fee-batch.entity";
export { BillStudentCreditEntity } from "./domain/bill-student-credit.entity";
export { BillStudentCreditEntryEntity, BILL_STUDENT_CREDIT_ENTRY_TYPES } from "./domain/bill-student-credit-entry.entity";
export type { BillStudentCreditEntryType } from "./domain/bill-student-credit-entry.entity";

export { BillFeeCategoryRepository } from "./infrastructure/bill-fee-category.repository";
export { BillTransportRouteRepository } from "./infrastructure/bill-transport-route.repository";
export { BillFeeStructureRepository } from "./infrastructure/bill-fee-structure.repository";
export { BillFeeStructureLineRepository } from "./infrastructure/bill-fee-structure-line.repository";
export { BillStudentOptionalItemRepository } from "./infrastructure/bill-student-optional-item.repository";
export { BillInvoiceRepository } from "./infrastructure/bill-invoice.repository";
export { BillInvoiceLineRepository } from "./infrastructure/bill-invoice-line.repository";
export { BillInstallmentRepository } from "./infrastructure/bill-installment.repository";
export { BillConcessionSchemeRepository } from "./infrastructure/bill-concession-scheme.repository";
export { BillConcessionRepository } from "./infrastructure/bill-concession.repository";
export { BillSponsorRepository } from "./infrastructure/bill-sponsor.repository";
export { BillSponsorAwardRepository } from "./infrastructure/bill-sponsor-award.repository";
export { BillCreditNoteRepository } from "./infrastructure/bill-credit-note.repository";
export { BillCreditNoteLineRepository } from "./infrastructure/bill-credit-note-line.repository";
export { BillDebitNoteRepository } from "./infrastructure/bill-debit-note.repository";
export { BillDebitNoteLineRepository } from "./infrastructure/bill-debit-note-line.repository";
export { BillRefundVoucherRepository } from "./infrastructure/bill-refund-voucher.repository";
export { BillLateFeePolicyRepository } from "./infrastructure/bill-late-fee-policy.repository";
export { BillLateFeeBatchRepository } from "./infrastructure/bill-late-fee-batch.repository";
export { BillStudentCreditRepository } from "./infrastructure/bill-student-credit.repository";
export { BillStudentCreditEntryRepository } from "./infrastructure/bill-student-credit-entry.repository";
