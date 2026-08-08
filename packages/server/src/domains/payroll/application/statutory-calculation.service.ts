import { Injectable } from "@nestjs/common";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money, RoundingMode } from "../../../shared/money/money";
import { StatutoryTablesService } from "./statutory-tables.service";

/**
 * PAYE `pyrl_statutory_table.params` contract (FR-PYRL-003 — Pass B's real
 * PAYE rate seed MUST match this shape word-for-word):
 * ```
 * { bands: { min: number; max: number | null; rate: number }[]; personalReliefMonthly: number }
 * ```
 * - `bands` — progressive tax bands. `min`/`max` are KES amounts (numbers,
 *   `Money.fromDecimalString`-compatible via `String(n)`); `max: null` marks
 *   the top (unbounded) band. `rate` is a decimal FRACTION (e.g. `0.3` for
 *   30%), not a whole-number percentage. Bands need not be pre-sorted —
 *   `computePaye()` sorts by `min` ascending before applying them.
 * - `personalReliefMonthly` — a flat KES amount subtracted from the summed
 *   band tax, floored at zero.
 */
export interface PayeBand {
  min: number;
  max: number | null;
  rate: number;
}
export interface PayeParams {
  bands: PayeBand[];
  personalReliefMonthly: number;
}

/**
 * NSSF `pyrl_statutory_table.params` contract — Kenya's NSSF Act 2013 tiered
 * structure (Tier I: 0 up to `tier1.upperLimit`; Tier II: `tier2.lowerLimit`
 * up to `tier2.upperLimit`):
 * ```
 * { tier1: { upperLimit: number; rate: number }; tier2: { lowerLimit: number; upperLimit: number; rate: number } }
 * ```
 * `rate` on each tier is a decimal fraction, read INDEPENDENTLY for the
 * employee and employer legs (both happen to read the SAME `tier.rate`
 * field in the current Kenyan scheme where employee/employer contribute
 * equally per tier — `computeNssf()` still computes each leg as its own
 * expression rather than copying one result into the other, so a future
 * params shape that splits employee/employer rates would only need the
 * TYPE extended, not the calculation restructured).
 */
export interface NssfTier1Params {
  upperLimit: number;
  rate: number;
}
export interface NssfTier2Params {
  lowerLimit: number;
  upperLimit: number;
  rate: number;
}
export interface NssfParams {
  tier1: NssfTier1Params;
  tier2: NssfTier2Params;
}

/**
 * SHIF `pyrl_statutory_table.params` contract — a flat percentage of gross
 * pay with an optional floor:
 * ```
 * { rate: number; minimumAmount?: number }
 * ```
 * `rate` is a decimal fraction. `minimumAmount`, when present, is a KES
 * floor — the computed contribution is raised to it if the flat-rate result
 * would otherwise fall below it.
 */
export interface ShifParams {
  rate: number;
  minimumAmount?: number;
}

/**
 * AHL `pyrl_statutory_table.params` contract — flat percentages of gross pay
 * for each leg:
 * ```
 * { employeeRate: number; employerRate: number }
 * ```
 */
export interface AhlParams {
  employeeRate: number;
  employerRate: number;
}

/**
 * THE statutory tax computation engine (Module 15 PASS A) — entirely
 * `pyrl_statutory_table.params`-jsonb-driven, ZERO hardcoded rates/bands
 * anywhere in this class (FR-PYRL-003). Every method:
 *  1. Resolves the effective rate table via
 *     `StatutoryTablesService.findEffectiveFor()` — throws BR-PYRL-01's
 *     named `NotFoundException` if none is effective for the period, before
 *     any arithmetic runs.
 *  2. Reads `params` per this file's own documented per-kind shape (see the
 *     interfaces above — Pass B's real rate seed MUST match them exactly).
 *  3. Computes purely in `Money` (bigint-scaled, NFR-INT-004 — no float ever
 *     touches a monetary value), using `RoundingMode.HALF_EVEN` throughout —
 *     `money.ts`'s own rounding matrix names HALF_EVEN specifically for
 *     "tax-like proportional splits (e.g. PAYE band apportionment)" to avoid
 *     HALF_UP's systematic upward bias across many repeated splits, which is
 *     exactly what banding/tiering does here.
 *
 * **BR-PYRL-04 note**: `taxableIncome`/`pensionablePay`/`grossPay` are all
 * accepted as ALREADY-PRORATED figures — mid-period-exit day-count proration
 * is Pass B's run-computation concern (see `pyrl-employee.entity.ts`'s own
 * `exit_date` handling), not this engine's. These methods never assume a
 * full-month amount.
 */
@Injectable()
export class StatutoryCalculationService {
  constructor(private readonly statutoryTablesService: StatutoryTablesService) {}

  async computePaye(taxableIncome: Money, periodEndDate: Date): Promise<Money> {
    const table = await this.statutoryTablesService.findEffectiveFor("PAYE", toDateString(periodEndDate));
    const params = table.params as unknown as PayeParams;
    if (!Array.isArray(params.bands) || params.bands.length === 0) {
      throw new ValidationException(`pyrl_statutory_table ${table.id} (PAYE) has no bands configured in params`);
    }

    const sortedBands = [...params.bands].sort((a, b) => a.min - b.min);
    let grossTax = Money.ZERO;
    for (const band of sortedBands) {
      const bandMin = Money.fromDecimalString(String(band.min));
      const bandMax = band.max === null ? null : Money.fromDecimalString(String(band.max));
      if (taxableIncome.compare(bandMin) <= 0) continue;
      const bandCeiling = bandMax === null ? taxableIncome : moneyMin(taxableIncome, bandMax);
      const portion = bandCeiling.subtract(bandMin);
      if (portion.isPositive()) {
        grossTax = grossTax.add(portion.multiply(band.rate, RoundingMode.HALF_EVEN));
      }
    }

    const relief = Money.fromDecimalString(String(params.personalReliefMonthly ?? 0));
    const net = grossTax.subtract(relief);
    return net.isNegative() ? Money.ZERO : net;
  }

  async computeNssf(pensionablePay: Money, periodEndDate: Date): Promise<{ employee: Money; employer: Money }> {
    const table = await this.statutoryTablesService.findEffectiveFor("NSSF", toDateString(periodEndDate));
    const params = table.params as unknown as NssfParams;

    const tier1Upper = Money.fromDecimalString(String(params.tier1.upperLimit));
    const tier1Pensionable = moneyMin(pensionablePay, tier1Upper);
    const tier1Employee = tier1Pensionable.multiply(params.tier1.rate, RoundingMode.HALF_EVEN);
    const tier1Employer = tier1Pensionable.multiply(params.tier1.rate, RoundingMode.HALF_EVEN);

    const tier2Lower = Money.fromDecimalString(String(params.tier2.lowerLimit));
    const tier2Upper = Money.fromDecimalString(String(params.tier2.upperLimit));
    const tier2Ceiling = moneyMin(pensionablePay, tier2Upper);
    const tier2Pensionable = tier2Ceiling.compare(tier2Lower) > 0 ? tier2Ceiling.subtract(tier2Lower) : Money.ZERO;
    const tier2Employee = tier2Pensionable.multiply(params.tier2.rate, RoundingMode.HALF_EVEN);
    const tier2Employer = tier2Pensionable.multiply(params.tier2.rate, RoundingMode.HALF_EVEN);

    return {
      employee: tier1Employee.add(tier2Employee),
      employer: tier1Employer.add(tier2Employer),
    };
  }

  async computeShif(grossPay: Money, periodEndDate: Date): Promise<Money> {
    const table = await this.statutoryTablesService.findEffectiveFor("SHIF", toDateString(periodEndDate));
    const params = table.params as unknown as ShifParams;
    const raw = grossPay.multiply(params.rate, RoundingMode.HALF_EVEN);
    if (params.minimumAmount === undefined || params.minimumAmount === null) {
      return raw;
    }
    const floor = Money.fromDecimalString(String(params.minimumAmount));
    return raw.compare(floor) < 0 ? floor : raw;
  }

  async computeAhl(grossPay: Money, periodEndDate: Date): Promise<{ employee: Money; employer: Money }> {
    const table = await this.statutoryTablesService.findEffectiveFor("AHL", toDateString(periodEndDate));
    const params = table.params as unknown as AhlParams;
    return {
      employee: grossPay.multiply(params.employeeRate, RoundingMode.HALF_EVEN),
      employer: grossPay.multiply(params.employerRate, RoundingMode.HALF_EVEN),
    };
  }
}

function moneyMin(a: Money, b: Money): Money {
  return a.compare(b) <= 0 ? a : b;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
