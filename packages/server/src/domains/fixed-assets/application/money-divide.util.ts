import { Money, RoundingMode } from "../../../shared/money/money";

/**
 * Divides a `Money` amount by a positive integer, rounding to `Money`'s 4dp
 * scale. `Money` has no public "divide by int" API (only `multiply()` by a
 * decimal factor) — this replicates `money.ts`'s own (private)
 * `divideWithRounding` at the bigint level, the same pattern
 * `domains/payroll/application/loans.service.ts`'s own local
 * `divideMoneyByInt()` helper already established for an identical need
 * (splitting a flat-rate loan's annual interest into 12 monthly charges) —
 * `DepreciationRunsService` needs the exact same operation for SL's
 * `(cost-residual)/life_months` and RB's `annualCharge/12`. Zero-float,
 * exact.
 */
export function divideMoneyByInt(amount: Money, divisor: number, mode: RoundingMode = RoundingMode.HALF_UP): Money {
  const scaled = amount.toScaled();
  const div = BigInt(divisor);
  const negative = (scaled < 0n) !== (div < 0n);
  const absScaled = scaled < 0n ? -scaled : scaled;
  const absDiv = div < 0n ? -div : div;

  const quotient = absScaled / absDiv;
  const remainder = absScaled % absDiv;
  const twiceRemainder = remainder * 2n;

  let roundedAbs = quotient;
  if (twiceRemainder > absDiv) {
    roundedAbs += 1n;
  } else if (twiceRemainder === absDiv) {
    if (mode === RoundingMode.HALF_UP) {
      roundedAbs += 1n;
    } else if (mode === RoundingMode.HALF_EVEN && quotient % 2n === 1n) {
      roundedAbs += 1n;
    }
  }

  const result = negative && roundedAbs !== 0n ? -roundedAbs : roundedAbs;
  return Money.fromScaled(result);
}
