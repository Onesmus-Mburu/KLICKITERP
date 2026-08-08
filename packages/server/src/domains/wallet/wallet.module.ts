import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WallServicePointEntity } from "./domain/wall-service-point.entity";
import { WallServicePointOperatorEntity } from "./domain/wall-service-point-operator.entity";
import { WallWalletEntity } from "./domain/wall-wallet.entity";
import { WallTransactionEntity } from "./domain/wall-transaction.entity";
// Sibling-module imports come AFTER this file's own entity imports above —
// same required ordering `payments.module.ts`/`billing.module.ts` document:
// `wall-wallet.entity.ts`/`wall-transaction.entity.ts` import `StdStudentEntity`/
// `PayReceiptEntity` DIRECTLY from their entity files (never via
// `domains/students`'/`domains/payments`' barrels), so those files must
// already be fully `require()`-cached before `StudentsModule`/`PaymentsModule`/
// `BillingModule`'s barrels (which eagerly load their own module.ts files
// and controllers/services) are pulled in below.
import { AccountingModule } from "../../accounting";
import { SettingsModule } from "../../platform/settings";
import { ApprovalsModule } from "../../platform/approvals";
import { StudentsModule } from "../students";
import { BillingModule } from "../billing";
import { PaymentsModule } from "../payments";
import { WallWalletRepository } from "./infrastructure/wall-wallet.repository";
import { WallTransactionRepository } from "./infrastructure/wall-transaction.repository";
import { WallServicePointRepository } from "./infrastructure/wall-service-point.repository";
import { WallServicePointOperatorRepository } from "./infrastructure/wall-service-point-operator.repository";
import { WalletsService } from "./application/wallets.service";
import { ServicePointsService } from "./application/service-points.service";
import { WalletTransactionsService } from "./application/wallet-transactions.service";
import { WalletsController } from "./api/wallets.controller";
import { WalletTransactionsController } from "./api/wallet-transactions.controller";
import { ServicePointsController } from "./api/service-points.controller";
import { ReconciliationController } from "./api/reconciliation.controller";
import { OutboxWriterService } from "../../shared/events/outbox-writer.service";

/**
 * Module 11 (Wallet) — full module anatomy on top of `accounting`,
 * `platform/settings`, `platform/approvals`, `domains/students`,
 * `domains/billing` (extension beyond the task brief's literal `mayImport`
 * list — see `wallet-control-accounts.util.ts`'s import comment), and
 * `domains/payments` (real FKs to `pay_receipt`/`pay_mpesa_transaction`, plus
 * `resolveClearingAccount()` reuse). `WalletTransactionsService`/
 * `WalletsService`/`ServicePointsService` all call into these siblings'
 * real services at runtime (`PostingService`, `SettingsService`,
 * `ApprovalEngineService` via the controller layer, `StdGuardianRepository`,
 * `BillInvoiceRepository`/`BillInstallmentRepository`/`resolveControlAccount`,
 * `resolveClearingAccount`) — all via each sibling's public barrel only.
 *
 * **Controllers array verified explicitly** — per this task's own warning
 * about Module 9's earlier near-miss (a `controllers` array once forgotten
 * despite `tsc` passing, shipping unreachable routes): all 4 controllers
 * below (`WalletsController`, `WalletTransactionsController`,
 * `ServicePointsController`, `ReconciliationController`) ARE present.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([WallServicePointEntity, WallServicePointOperatorEntity, WallWalletEntity, WallTransactionEntity]),
    AccountingModule,
    SettingsModule,
    ApprovalsModule,
    StudentsModule,
    BillingModule,
    PaymentsModule,
  ],
  controllers: [WalletsController, WalletTransactionsController, ServicePointsController, ReconciliationController],
  providers: [
    WallWalletRepository,
    WallTransactionRepository,
    WallServicePointRepository,
    WallServicePointOperatorRepository,
    OutboxWriterService,
    WalletsService,
    ServicePointsService,
    WalletTransactionsService,
  ],
  exports: [
    WallWalletRepository,
    WallTransactionRepository,
    WallServicePointRepository,
    WallServicePointOperatorRepository,
    WalletsService,
    ServicePointsService,
    WalletTransactionsService,
  ],
})
export class WalletModule {}
