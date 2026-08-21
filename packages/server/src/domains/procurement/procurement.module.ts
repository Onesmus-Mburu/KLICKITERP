import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AccountingModule } from "../../accounting";
import { ApprovalsModule } from "../../platform/approvals";
import { CommsModule } from "../../platform/comms";
import { SettingsModule } from "../../platform/settings";
import { InventoryModule } from "../inventory";
import { ProcSupplierEntity } from "./domain/proc-supplier.entity";
import { ProcRequisitionEntity } from "./domain/proc-requisition.entity";
import { ProcRequisitionLineEntity } from "./domain/proc-requisition-line.entity";
import { ProcQuotationEntity } from "./domain/proc-quotation.entity";
import { ProcQuotationLineEntity } from "./domain/proc-quotation-line.entity";
import { ProcPurchaseOrderEntity } from "./domain/proc-purchase-order.entity";
import { ProcPoLineEntity } from "./domain/proc-po-line.entity";
import { ProcGrnEntity } from "./domain/proc-grn.entity";
import { ProcGrnLineEntity } from "./domain/proc-grn-line.entity";
import { ProcSupplierInvoiceEntity } from "./domain/proc-supplier-invoice.entity";
import { ProcPaymentVoucherEntity } from "./domain/proc-payment-voucher.entity";
import { ProcVoucherAllocationEntity } from "./domain/proc-voucher-allocation.entity";
import { ProcContractEntity } from "./domain/proc-contract.entity";
import { ProcSupplierRepository } from "./infrastructure/proc-supplier.repository";
import { ProcRequisitionRepository } from "./infrastructure/proc-requisition.repository";
import { ProcRequisitionLineRepository } from "./infrastructure/proc-requisition-line.repository";
import { ProcQuotationRepository } from "./infrastructure/proc-quotation.repository";
import { ProcQuotationLineRepository } from "./infrastructure/proc-quotation-line.repository";
import { ProcPurchaseOrderRepository } from "./infrastructure/proc-purchase-order.repository";
import { ProcPoLineRepository } from "./infrastructure/proc-po-line.repository";
import { ProcGrnRepository } from "./infrastructure/proc-grn.repository";
import { ProcGrnLineRepository } from "./infrastructure/proc-grn-line.repository";
import { ProcSupplierInvoiceRepository } from "./infrastructure/proc-supplier-invoice.repository";
import { ProcPaymentVoucherRepository } from "./infrastructure/proc-payment-voucher.repository";
import { ProcVoucherAllocationRepository } from "./infrastructure/proc-voucher-allocation.repository";
import { ProcContractRepository } from "./infrastructure/proc-contract.repository";
import { SuppliersService } from "./application/suppliers.service";
import { RequisitionsService } from "./application/requisitions.service";
import { QuotationsService } from "./application/quotations.service";
import { PurchaseOrdersService } from "./application/purchase-orders.service";
import { GrnService } from "./application/grn.service";
import { SupplierInvoicesService } from "./application/supplier-invoices.service";
import { PaymentVouchersService } from "./application/payment-vouchers.service";
import { ContractsService } from "./application/contracts.service";
import { SupplierRatingsService } from "./application/supplier-ratings.service";
import { SuppliersController } from "./api/suppliers.controller";
import { RequisitionsController } from "./api/requisitions.controller";
import { QuotationsController } from "./api/quotations.controller";
import { PurchaseOrdersController } from "./api/purchase-orders.controller";
import { GrnController } from "./api/grn.controller";
import { SupplierInvoicesController } from "./api/supplier-invoices.controller";
import { PaymentVouchersController } from "./api/payment-vouchers.controller";
import { ContractsController } from "./api/contracts.controller";

/**
 * Module 12 (Procurement) — **PASS B, the FINAL pass** (docs/phase-5/PROGRESS.md),
 * completing the application layer on top of the foundation pass and PASS A
 * (procure-to-receive: `SuppliersService`/`RequisitionsService`/
 * `QuotationsService`/`PurchaseOrdersService`/`GrnService`). Adds the
 * remaining application services — `SupplierInvoicesService` (FR-PROC-007.1
 * 3-way match, P-20), `PaymentVouchersService` (FR-PROC-008.1, P-21),
 * `ContractsService`, `SupplierRatingsService` — and the full `api/`
 * surface: one controller per service (8 total; supplier ratings folds into
 * `SuppliersController`, see that controller's own doc comment), every
 * mutating endpoint `@RequirePermission`-guarded against codes appended to
 * `platform/users/domain/permission-catalogue.ts`.
 *
 * Imports `AccountingModule`/`SettingsModule`/`ApprovalsModule` (unchanged
 * from PASS A) plus, **new in this pass**, `CommsModule` (`platform/comms`)
 * — `PaymentVouchersService.execute()` calls `NotificationsService.send()`
 * for FR-PROC-008.1's remittance advice email (see that service's own doc
 * comment for why `platform/comms`, not the task brief's named
 * `domains/comms`, which does not exist in this codebase). All four sibling
 * imports go through each module's public barrel only, per
 * `module-deps.json`'s `domains/procurement` entry (updated by this pass to
 * add `platform/comms`).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProcSupplierEntity,
      ProcRequisitionEntity,
      ProcRequisitionLineEntity,
      ProcQuotationEntity,
      ProcQuotationLineEntity,
      ProcPurchaseOrderEntity,
      ProcPoLineEntity,
      ProcGrnEntity,
      ProcGrnLineEntity,
      ProcSupplierInvoiceEntity,
      ProcPaymentVoucherEntity,
      ProcVoucherAllocationEntity,
      ProcContractEntity,
    ]),
    AccountingModule,
    SettingsModule,
    ApprovalsModule,
    CommsModule,
    InventoryModule,
  ],
  controllers: [
    SuppliersController,
    RequisitionsController,
    QuotationsController,
    PurchaseOrdersController,
    GrnController,
    SupplierInvoicesController,
    PaymentVouchersController,
    ContractsController,
  ],
  providers: [
    ProcSupplierRepository,
    ProcRequisitionRepository,
    ProcRequisitionLineRepository,
    ProcQuotationRepository,
    ProcQuotationLineRepository,
    ProcPurchaseOrderRepository,
    ProcPoLineRepository,
    ProcGrnRepository,
    ProcGrnLineRepository,
    ProcSupplierInvoiceRepository,
    ProcPaymentVoucherRepository,
    ProcVoucherAllocationRepository,
    ProcContractRepository,
    SuppliersService,
    RequisitionsService,
    QuotationsService,
    PurchaseOrdersService,
    GrnService,
    SupplierInvoicesService,
    PaymentVouchersService,
    ContractsService,
    SupplierRatingsService,
  ],
  exports: [
    ProcSupplierRepository,
    ProcRequisitionRepository,
    ProcRequisitionLineRepository,
    ProcQuotationRepository,
    ProcQuotationLineRepository,
    ProcPurchaseOrderRepository,
    ProcPoLineRepository,
    ProcGrnRepository,
    ProcGrnLineRepository,
    ProcSupplierInvoiceRepository,
    ProcPaymentVoucherRepository,
    ProcVoucherAllocationRepository,
    ProcContractRepository,
    SuppliersService,
    RequisitionsService,
    QuotationsService,
    PurchaseOrdersService,
    GrnService,
    SupplierInvoicesService,
    PaymentVouchersService,
    ContractsService,
    SupplierRatingsService,
  ],
})
export class ProcurementModule {}
