import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { ProcSupplierRepository } from "../../procurement";
import { Money } from "../../../shared/money/money";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export interface SupplierStatementParams {
  supplierId: string;
  fromDate: string;
  toDate: string;
}

interface RawActivityRow {
  activity_date: string;
  activity_type: "INVOICE" | "PAYMENT";
  reference: string;
  charge: string;
  payment: string;
}

/**
 * FR-RPT-008-adjacent report-of-record — combined activity for one supplier
 * across `proc_supplier_invoice` (charges, dated by `invoice_date`) and
 * `proc_payment_voucher` (payments, `status = 'PAID'`, dated by
 * `created_at::date` — a payment voucher's DDL carries no separate
 * "payment date" column distinct from when it was executed/paid, so its
 * audit `created_at` is the closest real date; a voucher only reaches
 * `PAID` at execution time per `PaymentVouchersService.execute()`, so this
 * is not a meaningful gap in practice), with a running balance — the
 * conventional accounts-payable statement shape (charges increase the
 * amount owed, payments reduce it).
 *
 * Built as one raw `UNION ALL` query (rather than two separate repository
 * calls merged in JS) so the date-ordering and running-balance walk below
 * see a single, already-interleaved chronological stream — the same
 * "one indexed query over N+1 lookups" preference `GeneralLedgerReport`'s
 * own doc comment documents. Allocation-level detail
 * (`proc_voucher_allocation`, which invoice a payment was applied against)
 * is deliberately NOT surfaced here — a supplier-level running balance
 * needs only the two aggregate legs (total charged, total paid), matching
 * the task brief's own "combined activity... with a running balance" scope,
 * not a per-invoice allocation trace (that already exists via
 * `ProcVoucherAllocationRepository.findBySupplierInvoiceId()` for a reader
 * who needs it).
 */
@Injectable()
export class SupplierStatementReport implements ReportDefinition<SupplierStatementParams> {
  readonly code = "supplier-statement";
  readonly name = "Supplier Statement";
  readonly domain = "procurement";
  readonly permissionCode = "reports:supplier-statement:view";
  readonly paramsShape = { supplierId: "uuid", fromDate: "date", toDate: "date" } as const;
  readonly columns: ReportColumnDef[] = [
    { key: "activityDate", label: "Date", type: "date" },
    { key: "activityType", label: "Type", type: "string" },
    { key: "reference", label: "Reference", type: "string" },
    { key: "charge", label: "Charge", type: "money" },
    { key: "payment", label: "Payment", type: "money" },
    { key: "runningBalance", label: "Balance", type: "money" },
  ];

  constructor(
    private readonly supplierRepository: ProcSupplierRepository,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async execute(params: SupplierStatementParams): Promise<ReportResult> {
    const supplier = await this.supplierRepository.findByIdOrFail(params.supplierId);

    const rawRows: RawActivityRow[] = await this.dataSource.query(
      `(
         SELECT inv.invoice_date::text AS activity_date, 'INVOICE' AS activity_type, inv.number AS reference,
                inv.total::text AS charge, '0'::text AS payment
         FROM app.proc_supplier_invoice inv
         WHERE inv.supplier_id = $1 AND inv.invoice_date >= $2 AND inv.invoice_date <= $3
       )
       UNION ALL
       (
         SELECT pv.created_at::date::text AS activity_date, 'PAYMENT' AS activity_type, pv.number AS reference,
                '0'::text AS charge, pv.total::text AS payment
         FROM app.proc_payment_voucher pv
         WHERE pv.supplier_id = $1 AND pv.status = 'PAID' AND pv.created_at::date >= $2 AND pv.created_at::date <= $3
       )
       ORDER BY activity_date ASC, activity_type ASC`,
      [params.supplierId, params.fromDate, params.toDate],
    );

    let runningBalance = Money.ZERO;
    let totalCharges = Money.ZERO;
    let totalPayments = Money.ZERO;
    const rows = rawRows.map((row) => {
      const charge = Money.fromDecimalString(row.charge);
      const payment = Money.fromDecimalString(row.payment);
      runningBalance = runningBalance.add(charge).subtract(payment);
      totalCharges = totalCharges.add(charge);
      totalPayments = totalPayments.add(payment);
      return {
        activityDate: row.activity_date,
        activityType: row.activity_type,
        reference: row.reference,
        charge,
        payment,
        runningBalance,
      };
    });

    return {
      rows,
      totals: {
        supplierId: supplier.id,
        supplierName: supplier.name,
        totalCharges,
        totalPayments,
        closingBalance: runningBalance,
      },
      generatedAt: new Date(),
    };
  }
}
