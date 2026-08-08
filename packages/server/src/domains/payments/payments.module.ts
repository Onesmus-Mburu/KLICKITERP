import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PayCashierSessionEntity } from "./domain/pay-cashier-session.entity";
import { PayReceiptEntity } from "./domain/pay-receipt.entity";
import { PayReceiptSplitEntity } from "./domain/pay-receipt-split.entity";
import { PayReceiptAllocationEntity } from "./domain/pay-receipt-allocation.entity";
import { PayChequeEntity } from "./domain/pay-cheque.entity";
import { PayMpesaTransactionEntity } from "./domain/pay-mpesa-transaction.entity";
import { PaySuspenseItemEntity } from "./domain/pay-suspense-item.entity";
import { PayBulkAllocationBatchEntity } from "./domain/pay-bulk-allocation-batch.entity";
import { PayBulkAllocationBatchLineEntity } from "./domain/pay-bulk-allocation-batch-line.entity";
// Sibling-module imports come AFTER this file's own entity imports above —
// required ordering (not stylistic), the same discipline
// `domains/billing/billing.module.ts` documents: `pay-receipt.entity.ts`/
// `pay-receipt-allocation.entity.ts` import `StdStudentEntity`/
// `BillInvoiceEntity`/`BillInstallmentEntity` DIRECTLY from their entity
// files (never via `domains/students`'/`domains/billing`'s barrels — see
// those entities' own doc comments), so those files must already be fully
// `require()`-cached before `StudentsModule`/`BillingModule`'s barrels
// (which eagerly load `students.module.ts`/`billing.module.ts` and their
// controllers/services) are pulled in below.
import { AccountingModule } from "../../accounting";
import { SettingsModule } from "../../platform/settings";
import { ApprovalsModule } from "../../platform/approvals";
import { DocumentVerificationModule } from "../../platform/document-verification";
import { StudentsModule } from "../students";
import { BillingModule } from "../billing";
import { PayCashierSessionRepository } from "./infrastructure/pay-cashier-session.repository";
import { PayReceiptRepository } from "./infrastructure/pay-receipt.repository";
import { PayReceiptSplitRepository } from "./infrastructure/pay-receipt-split.repository";
import { PayReceiptAllocationRepository } from "./infrastructure/pay-receipt-allocation.repository";
import { PayChequeRepository } from "./infrastructure/pay-cheque.repository";
import { PayMpesaTransactionRepository } from "./infrastructure/pay-mpesa-transaction.repository";
import { PaySuspenseItemRepository } from "./infrastructure/pay-suspense-item.repository";
import { PayBulkAllocationBatchRepository } from "./infrastructure/pay-bulk-allocation-batch.repository";
import { PayBulkAllocationBatchLineRepository } from "./infrastructure/pay-bulk-allocation-batch-line.repository";
import { CashierSessionsService } from "./application/cashier-sessions.service";
import { AllocationService } from "./application/allocation.service";
import { ReceiptsService } from "./application/receipts.service";
import { MpesaService } from "./application/mpesa.service";
import { SuspenseService } from "./application/suspense.service";
import { ChequesService } from "./application/cheques.service";
import { BulkAllocationService } from "./application/bulk-allocation.service";
import { MpesaLogOnlyAdapter } from "./infrastructure/adapters/mpesa-log-only.adapter";
import { MpesaAdapterResolverService } from "./infrastructure/mpesa-adapter-resolver.service";
import { CashierSessionsController } from "./api/cashier-sessions.controller";
import { ReceiptsController } from "./api/receipts.controller";
import { MpesaController } from "./api/mpesa.controller";
import { SuspenseController } from "./api/suspense.controller";
import { ChequesController } from "./api/cheques.controller";
import { BulkAllocationController } from "./api/bulk-allocation.controller";

/**
 * Module 10 (Payments) — **PASS B** (M-Pesa STK/C2B/B2C, suspense matching,
 * cheque clearing, bulk allocation, ALL 6 controllers, permission catalogue,
 * `0900` seed) on top of the foundation pass + PASS A (core receipt
 * capture/posting/reversal engine — `CashierSessionsService`/
 * `AllocationService`/`ReceiptsService`). Mirrors `domains/billing`'s own
 * PASS A+B shape: imports `AccountingModule`/`SettingsModule`/
 * `ApprovalsModule`/`StudentsModule`/`BillingModule` (not just entities) —
 * `ReceiptsService` calls `PostingService.post()`/`.reverse()`,
 * `GlAccountRepository` (`AccountingModule`), `NumberingService.allocate()`/
 * `SettingsService.getTyped()` (`SettingsModule`), `ReceiptsController`/
 * `SuspenseController` call `ApprovalEngineService.submit()`/`.getStatus()`
 * for the `PAYMENT_REVERSALS` approval chain (`ApprovalsModule` — new in this
 * pass, see `module-deps.json`'s updated `domains/payments` entry),
 * `StudentLedgerService.appendEntry()`/`StdLedgerEntryRepository`/
 * `StdStudentRepository` (`StudentsModule`), and `BillInvoiceRepository`/
 * `BillInstallmentRepository`/`resolveControlAccount`/`InvoicingService`
 * (`BillingModule`) at runtime — all via each sibling's public barrel only.
 * `MpesaController`'s 4 callback endpoints use `@Public()` from
 * `platform/auth`'s barrel (a pure decorator, no DI — `AuthModule` itself is
 * NOT imported here, only the decorator function is imported directly by
 * `api/mpesa.controller.ts`, per `module-deps.json`'s new one-directional
 * `platform/auth` exception).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PayCashierSessionEntity,
      PayReceiptEntity,
      PayReceiptSplitEntity,
      PayReceiptAllocationEntity,
      PayChequeEntity,
      PayMpesaTransactionEntity,
      PaySuspenseItemEntity,
      PayBulkAllocationBatchEntity,
      PayBulkAllocationBatchLineEntity,
    ]),
    AccountingModule,
    SettingsModule,
    ApprovalsModule,
    DocumentVerificationModule,
    StudentsModule,
    BillingModule,
  ],
  controllers: [
    CashierSessionsController,
    ReceiptsController,
    MpesaController,
    SuspenseController,
    ChequesController,
    BulkAllocationController,
  ],
  providers: [
    PayCashierSessionRepository,
    PayReceiptRepository,
    PayReceiptSplitRepository,
    PayReceiptAllocationRepository,
    PayChequeRepository,
    PayMpesaTransactionRepository,
    PaySuspenseItemRepository,
    PayBulkAllocationBatchRepository,
    PayBulkAllocationBatchLineRepository,
    CashierSessionsService,
    AllocationService,
    ReceiptsService,
    MpesaService,
    SuspenseService,
    ChequesService,
    BulkAllocationService,
    MpesaLogOnlyAdapter,
    MpesaAdapterResolverService,
  ],
  exports: [
    PayCashierSessionRepository,
    PayReceiptRepository,
    PayReceiptSplitRepository,
    PayReceiptAllocationRepository,
    PayChequeRepository,
    PayMpesaTransactionRepository,
    PaySuspenseItemRepository,
    PayBulkAllocationBatchRepository,
    PayBulkAllocationBatchLineRepository,
    CashierSessionsService,
    AllocationService,
    ReceiptsService,
    MpesaService,
    SuspenseService,
    ChequesService,
    BulkAllocationService,
  ],
})
export class PaymentsModule {}
