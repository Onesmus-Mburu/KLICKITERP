import { ValueTransformer } from "typeorm";
import { Money } from "./money";

/**
 * TypeORM ValueTransformer between a NUMERIC(18,4) DB column (returned by
 * `pg` as a decimal string) and the Money value object. Never routes through
 * a JS number, per NFR-INT-004 (no float in the money path).
 */
export const MoneyTransformer: ValueTransformer = {
  to(value: Money | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    return value.toDecimalString();
  },
  from(value: string | null): Money | null {
    if (value === null || value === undefined) {
      return null;
    }
    return Money.fromDecimalString(value);
  },
};

/** Variant for NUMERIC(18,4) NOT NULL columns — avoids null-checks at call sites. */
export const RequiredMoneyTransformer: ValueTransformer = {
  to(value: Money): string {
    return value.toDecimalString();
  },
  from(value: string): Money {
    return Money.fromDecimalString(value);
  },
};
