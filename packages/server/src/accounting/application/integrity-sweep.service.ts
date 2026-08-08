import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { Money } from "../../shared/money/money";
import { GlIntegrityRunEntity } from "../domain/gl-integrity-run.entity";
import { GlIntegrityRunRepository } from "../infrastructure/gl-integrity-run.repository";
import { GlPeriodAccountTotalRepository } from "../infrastructure/gl-period-account-total.repository";

const SWEEP_KIND = "PERIOD_ACCOUNT_TOTAL_RECONCILIATION";

interface RawDerivedRow {
  period_id: string;
  account_id: string;
  cost_center_id: string | null;
  debit_total: string;
  credit_total: string;
}

interface Mismatch {
  periodId: string;
  accountId: string;
  costCenterId: string | null;
  stored: { debitTotal: string; creditTotal: string } | null;
  derived: { debitTotal: string; creditTotal: string } | null;
}

/**
 * NFR-INT-002 — the hourly (scheduling is a future worker concern, not
 * built here; same "config/logic exists, scheduler doesn't" pattern as
 * every other module's un-dispatched background job) integrity sweep.
 * Re-derives `debit_total`/`credit_total` per `(period_id, account_id,
 * cost_center_id)` directly from `SUM(gl_journal_line.debit/credit)`
 * (joined through `gl_journal` for `period_id`, since `gl_journal_line`
 * itself carries no `period_id` column) and compares that against the
 * stored `gl_period_account_total` rows `PostingService` maintains
 * incrementally. Any key present on one side but not the other, or present
 * on both with differing totals, is a mismatch — the sweep is read-only
 * against `gl_journal_line`/`gl_period_account_total` (neither is written
 * here) and writes exactly one `gl_integrity_run` row, which is NOT
 * writer-guarded (only `gl_journal`/`gl_journal_line`/`gl_period_account_total`
 * are), so no `application_name` workaround is needed for this write.
 */
@Injectable()
export class IntegritySweepService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly periodAccountTotalRepository: GlPeriodAccountTotalRepository,
    private readonly integrityRunRepository: GlIntegrityRunRepository,
  ) {}

  async runSweep(): Promise<GlIntegrityRunEntity> {
    const derivedRows: RawDerivedRow[] = await this.dataSource.query(`
      SELECT j.period_id AS period_id, jl.account_id AS account_id, jl.cost_center_id AS cost_center_id,
             COALESCE(SUM(jl.debit), 0)::text AS debit_total,
             COALESCE(SUM(jl.credit), 0)::text AS credit_total
      FROM app.gl_journal_line jl
      JOIN app.gl_journal j ON j.id = jl.journal_id
      GROUP BY j.period_id, jl.account_id, jl.cost_center_id
    `);
    const storedRows = await this.periodAccountTotalRepository.listAll();

    const keyOf = (periodId: string, accountId: string, costCenterId: string | null): string =>
      `${periodId}::${accountId}::${costCenterId ?? ""}`;

    const derivedMap = new Map(
      derivedRows.map((row) => [
        keyOf(row.period_id, row.account_id, row.cost_center_id),
        { debitTotal: Money.fromDecimalString(row.debit_total), creditTotal: Money.fromDecimalString(row.credit_total) },
      ]),
    );
    const storedMap = new Map(
      storedRows.map((row) => [
        keyOf(row.periodId, row.accountId, row.costCenterId),
        { debitTotal: row.debitTotal, creditTotal: row.creditTotal },
      ]),
    );

    const mismatches: Mismatch[] = [];
    const allKeys = new Set([...derivedMap.keys(), ...storedMap.keys()]);
    for (const key of allKeys) {
      const derived = derivedMap.get(key) ?? null;
      const stored = storedMap.get(key) ?? null;
      const derivedDebit = derived?.debitTotal ?? Money.ZERO;
      const derivedCredit = derived?.creditTotal ?? Money.ZERO;
      const storedDebit = stored?.debitTotal ?? Money.ZERO;
      const storedCredit = stored?.creditTotal ?? Money.ZERO;

      if (!derivedDebit.equals(storedDebit) || !derivedCredit.equals(storedCredit)) {
        const [periodId, accountId, costCenterIdRaw] = key.split("::");
        mismatches.push({
          periodId,
          accountId,
          costCenterId: costCenterIdRaw === "" ? null : costCenterIdRaw,
          stored: stored ? { debitTotal: stored.debitTotal.toDecimalString(), creditTotal: stored.creditTotal.toDecimalString() } : null,
          derived: derived ? { debitTotal: derived.debitTotal.toDecimalString(), creditTotal: derived.creditTotal.toDecimalString() } : null,
        });
      }
    }

    return this.integrityRunRepository.create({
      ranAt: new Date(),
      kind: SWEEP_KIND,
      ok: mismatches.length === 0,
      findings: { mismatchCount: mismatches.length, mismatches },
    });
  }

  async listRecent(limit = 50): Promise<GlIntegrityRunEntity[]> {
    return this.integrityRunRepository.listRecent(limit);
  }
}
