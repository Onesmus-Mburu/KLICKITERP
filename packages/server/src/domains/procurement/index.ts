/**
 * Public barrel — the only surface any future sibling module should import
 * from (`crossSiblingImportPolicy` in module-deps.json). Module 12
 * (Procurement) is now **fully complete** (foundation + PASS A + PASS B,
 * docs/phase-5/PROGRESS.md): every domain entity/repository, all 9
 * application services, and the GL-account-resolution utils are exported
 * here. `api/`/controllers are NOT re-exported (this codebase's convention —
 * controllers are wired directly in `procurement.module.ts`, never imported
 * by a sibling module, mirroring `domains/payments`' own barrel).
 */
export { ProcurementModule } from "./procurement.module";

export { ProcSupplierEntity, PROC_SUPPLIER_STATUSES } from "./domain/proc-supplier.entity";
export type { ProcSupplierStatus } from "./domain/proc-supplier.entity";
export { ProcRequisitionEntity, PROC_REQUISITION_STATUSES } from "./domain/proc-requisition.entity";
export type { ProcRequisitionStatus } from "./domain/proc-requisition.entity";
export { ProcRequisitionLineEntity } from "./domain/proc-requisition-line.entity";
export { ProcQuotationEntity } from "./domain/proc-quotation.entity";
export { ProcQuotationLineEntity } from "./domain/proc-quotation-line.entity";
export {
  ProcPurchaseOrderEntity,
  PROC_PURCHASE_ORDER_STATUSES,
  PROC_PURCHASE_ORDER_MUTABLE_STATUSES,
} from "./domain/proc-purchase-order.entity";
export type { ProcPurchaseOrderStatus } from "./domain/proc-purchase-order.entity";
export { ProcPoLineEntity } from "./domain/proc-po-line.entity";
export { ProcGrnEntity, PROC_GRN_STATUSES } from "./domain/proc-grn.entity";
export type { ProcGrnStatus } from "./domain/proc-grn.entity";
export { ProcGrnLineEntity } from "./domain/proc-grn-line.entity";
export {
  ProcSupplierInvoiceEntity,
  PROC_SUPPLIER_INVOICE_STATUSES,
  PROC_SUPPLIER_INVOICE_OPEN_STATUSES,
} from "./domain/proc-supplier-invoice.entity";
export type { ProcSupplierInvoiceStatus } from "./domain/proc-supplier-invoice.entity";
export {
  ProcPaymentVoucherEntity,
  PROC_PAYMENT_VOUCHER_METHODS,
  PROC_PAYMENT_VOUCHER_STATUSES,
} from "./domain/proc-payment-voucher.entity";
export type { ProcPaymentVoucherMethod, ProcPaymentVoucherStatus } from "./domain/proc-payment-voucher.entity";
export { ProcVoucherAllocationEntity } from "./domain/proc-voucher-allocation.entity";
export { ProcContractEntity, PROC_CONTRACT_STATUSES } from "./domain/proc-contract.entity";
export type { ProcContractStatus } from "./domain/proc-contract.entity";

export { ProcSupplierRepository } from "./infrastructure/proc-supplier.repository";
export type { ListProcSuppliersFilter } from "./infrastructure/proc-supplier.repository";
export { ProcRequisitionRepository } from "./infrastructure/proc-requisition.repository";
export type { ListProcRequisitionsFilter } from "./infrastructure/proc-requisition.repository";
export { ProcRequisitionLineRepository } from "./infrastructure/proc-requisition-line.repository";
export { ProcQuotationRepository } from "./infrastructure/proc-quotation.repository";
export { ProcQuotationLineRepository } from "./infrastructure/proc-quotation-line.repository";
export { ProcPurchaseOrderRepository } from "./infrastructure/proc-purchase-order.repository";
export type { ListProcPurchaseOrdersFilter } from "./infrastructure/proc-purchase-order.repository";
export { ProcPoLineRepository } from "./infrastructure/proc-po-line.repository";
export { ProcGrnRepository } from "./infrastructure/proc-grn.repository";
export { ProcGrnLineRepository } from "./infrastructure/proc-grn-line.repository";
export { ProcSupplierInvoiceRepository } from "./infrastructure/proc-supplier-invoice.repository";
export type { ListProcSupplierInvoicesFilter } from "./infrastructure/proc-supplier-invoice.repository";
export { ProcPaymentVoucherRepository } from "./infrastructure/proc-payment-voucher.repository";
export type { ListProcPaymentVouchersFilter } from "./infrastructure/proc-payment-voucher.repository";
export { ProcVoucherAllocationRepository } from "./infrastructure/proc-voucher-allocation.repository";
export { ProcContractRepository } from "./infrastructure/proc-contract.repository";
export type { ListProcContractsFilter } from "./infrastructure/proc-contract.repository";

export { SuppliersService } from "./application/suppliers.service";
export type { CreateSupplierInput, UpdateSupplierInput } from "./application/suppliers.service";
export {
  RequisitionsService,
  PROCUREMENT_REQUISITION_APPROVAL_DOMAIN_CODE,
} from "./application/requisitions.service";
export type {
  CreateRequisitionInput,
  CreateRequisitionLineInput,
  UpdateRequisitionLineInput,
  BudgetSnapshot,
} from "./application/requisitions.service";
export { QuotationsService } from "./application/quotations.service";
export type { CreateQuotationInput, CreateQuotationLineInput } from "./application/quotations.service";
export {
  PurchaseOrdersService,
  PROCUREMENT_PO_APPROVAL_DOMAIN_CODE,
} from "./application/purchase-orders.service";
export type {
  CreatePurchaseOrderFromRequisitionInput,
  CreatePurchaseOrderLineInput,
  RevisePurchaseOrderInput,
} from "./application/purchase-orders.service";
export { GrnService, GRN_QTY_TOLERANCE_SETTING_KEY } from "./application/grn.service";
export type { ReceiveGrnInput, ReceiveGrnLineInput } from "./application/grn.service";
export {
  GRN_ACCRUAL_ACCOUNT_CODE,
  PROCUREMENT_EXPENSE_WIP_ACCOUNT_CODE,
  resolveGrnAccrualAccount,
  resolveInventoryControlAccount,
  resolveProcurementExpenseAccount,
} from "./application/gl-grn-accounts.util";
export {
  PURCHASE_PRICE_VARIANCE_ACCOUNT_CODE,
  resolveApSupplierControlAccount,
  resolvePriceVarianceAccount,
} from "./application/gl-ap-accounts.util";
export { resolveProcPaymentClearingAccount } from "./application/payment-clearing-accounts.util";
export {
  SupplierInvoicesService,
  INVOICE_MATCH_QTY_TOLERANCE_SETTING_KEY,
  INVOICE_MATCH_PRICE_TOLERANCE_SETTING_KEY,
  INVOICE_MATCH_ABSOLUTE_TOLERANCE_SETTING_KEY,
} from "./application/supplier-invoices.service";
export type {
  CaptureSupplierInvoiceInput,
  CaptureSupplierInvoiceLineInput,
  SupplierInvoiceMatchResolution,
} from "./application/supplier-invoices.service";
export { PaymentVouchersService, SUPPLIER_PAYMENTS_APPROVAL_DOMAIN_CODE } from "./application/payment-vouchers.service";
export type { CreatePaymentVoucherInput, CreatePaymentVoucherAllocationInput } from "./application/payment-vouchers.service";
export { ContractsService } from "./application/contracts.service";
export type { CreateContractInput, UpdateContractInput } from "./application/contracts.service";
export { SupplierRatingsService } from "./application/supplier-ratings.service";
