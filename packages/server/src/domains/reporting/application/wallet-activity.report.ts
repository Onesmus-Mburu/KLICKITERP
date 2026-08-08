import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { Money } from "../../../shared/money/money";
import { MaterializedViewsRepository } from "../infrastructure/materialized-views.repository";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export interface WalletActivityParams {
  fromDate: string;
  toDate: string;
  walletId?: string;
}

interface RawTypeRow {
  type: string;
  direction: "D" | "C";
  txn_count: string;
  total_amount: string;
}

/**
 * FR-RPT-008-adjacent report-of-record — `wall_transaction` (the append-only
 * ledger, never a materialized view) summarized by `(type, direction)` for
 * the given `at` range, optionally scoped to one wallet.
 *
 * **The one legitimate MV read in this pass**: `totals.walletLiabilitySnapshot`
 * is populated from `MaterializedViewsRepository.findWalletLiability()` —
 * per the task brief, this is an explicit RECON CROSS-CHECK
 * (`mv_wallet_liability`'s own documented purpose), not a substitute for
 * this report's report-of-record activity rows above. It is ALWAYS the
 * CURRENT snapshot (`mv_wallet_liability` carries no history — see that
 * view's own doc comment), not scoped to `[fromDate, toDate]` — the mismatch
 * between "activity in a historical window" and "liability right now" is
 * inherent to the MV's own documented snapshot-not-timeseries limitation,
 * not something this report can paper over; `totals.walletLiabilitySnapshot.snapshotDate`
 * makes the as-of date explicit to the caller.
 */
@Injectable()
export class WalletActivityReport implements ReportDefinition<WalletActivityParams> {
  readonly code = "wallet-activity";
  readonly name = "Wallet Activity";
  readonly domain = "wallet";
  readonly permissionCode = "reports:wallet-activity:view";
  readonly paramsShape = { fromDate: "date", toDate: "date", walletId: "uuid" } as const;
  readonly columns: ReportColumnDef[] = [
    { key: "type", label: "Type", type: "string" },
    { key: "direction", label: "Direction", type: "string" },
    { key: "txnCount", label: "Count", type: "number" },
    { key: "totalAmount", label: "Total", type: "money" },
  ];

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly mvRepository: MaterializedViewsRepository,
  ) {}

  async execute(params: WalletActivityParams): Promise<ReportResult> {
    const conditions = ["at >= $1", "at <= $2"];
    const values: unknown[] = [`${params.fromDate}T00:00:00.000Z`, `${params.toDate}T23:59:59.999Z`];
    if (params.walletId) {
      values.push(params.walletId);
      conditions.push(`wallet_id = $${values.length}`);
    }

    const rawRows: RawTypeRow[] = await this.dataSource.query(
      `SELECT type, direction, COUNT(*)::text AS txn_count, COALESCE(SUM(amount), 0)::text AS total_amount
       FROM app.wall_transaction
       WHERE ${conditions.join(" AND ")}
       GROUP BY type, direction
       ORDER BY type ASC, direction ASC`,
      values,
    );

    let credit = Money.ZERO;
    let debit = Money.ZERO;
    const rows = rawRows.map((row) => {
      const totalAmount = Money.fromDecimalString(row.total_amount);
      if (row.direction === "C") credit = credit.add(totalAmount);
      else debit = debit.add(totalAmount);
      return { type: row.type, direction: row.direction, txnCount: Number(row.txn_count), totalAmount };
    });

    const walletLiability = await this.mvRepository.findWalletLiability();

    return {
      rows,
      totals: {
        totalCredit: credit,
        totalDebit: debit,
        netMovement: credit.subtract(debit),
        walletLiabilitySnapshot: walletLiability
          ? { snapshotDate: walletLiability.snapshotDate, totalBalance: walletLiability.totalBalance }
          : null,
      },
      generatedAt: new Date(),
    };
  }
}
