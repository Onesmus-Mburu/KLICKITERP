import { Money } from "../../../shared/money/money";
import {
  computeWeightedAverageCost,
  moneyDividedByQtyToCost,
  qtyAdd,
  qtyCompare,
  qtyIsNegative,
  qtyIsPositive,
  qtyIsZero,
  qtyNegate,
  qtySubtract,
  qtyTimesCostToMoney,
} from "../application/decimal-qty.util";

describe("decimal-qty.util", () => {
  describe("qty arithmetic (scale 4)", () => {
    it("adds/subtracts/negates", () => {
      expect(qtyAdd("10", "5.5")).toBe("15.5000");
      expect(qtySubtract("10", "15")).toBe("-5.0000");
      expect(qtyNegate("5")).toBe("-5.0000");
    });

    it("compares and classifies sign", () => {
      expect(qtyCompare("5", "10")).toBe(-1);
      expect(qtyCompare("10", "5")).toBe(1);
      expect(qtyCompare("5", "5")).toBe(0);
      expect(qtyIsPositive("0.0001")).toBe(true);
      expect(qtyIsNegative("-0.0001")).toBe(true);
      expect(qtyIsZero("0")).toBe(true);
      expect(qtyIsZero("0.0000")).toBe(true);
    });
  });

  describe("qtyTimesCostToMoney", () => {
    it("multiplies a scale-4 qty by a scale-6 cost, rounding to Money's scale-4", () => {
      expect(qtyTimesCostToMoney("10", "5.500000")).toEqual(Money.fromDecimalString("55.00"));
    });

    it("preserves sign for a negative (outbound) qty", () => {
      expect(qtyTimesCostToMoney("-6", "4.500000")).toEqual(Money.fromDecimalString("-27.00"));
    });

    it("HALF_UP rounds a fractional-cent result", () => {
      // 1 * 0.333333 = 0.333333 -> rounds to 0.3333 at Money's 4-decimal scale.
      expect(qtyTimesCostToMoney("1", "0.333333")).toEqual(Money.fromDecimalString("0.3333"));
    });
  });

  describe("computeWeightedAverageCost — FR-INV-006.1", () => {
    it("first-receipt-into-empty-balance: new_avg equals the receipt's own unit cost", () => {
      const avg = computeWeightedAverageCost("0", Money.ZERO, "10", Money.fromDecimalString("55.00"));
      expect(avg).toBe("5.500000");
    });

    it("blends on-hand and receipt exactly per the formula", () => {
      // (50.00 + 70.00) / (10 + 10) = 120/20 = 6.000000
      const avg = computeWeightedAverageCost("10", Money.fromDecimalString("50.00"), "10", Money.fromDecimalString("70.00"));
      expect(avg).toBe("6.000000");
    });

    it("throws when the combined quantity is zero", () => {
      expect(() => computeWeightedAverageCost("0", Money.ZERO, "0", Money.ZERO)).toThrow(RangeError);
    });
  });

  describe("moneyDividedByQtyToCost — inverse of qtyTimesCostToMoney", () => {
    it("recovers the exact per-unit cost for a signed value/qty pair", () => {
      expect(moneyDividedByQtyToCost(Money.fromDecimalString("-20.00"), "-2.0000")).toBe("10.000000");
      expect(moneyDividedByQtyToCost(Money.fromDecimalString("30.00"), "3.0000")).toBe("10.000000");
    });
  });
});
