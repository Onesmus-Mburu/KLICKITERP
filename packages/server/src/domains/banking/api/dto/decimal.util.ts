/**
 * `Money.fromDecimalString`'s accepted shape — matches this codebase's
 * convention for decimal-string monetary DTO fields (see
 * `domains/expenses/api/dto/decimal.util.ts`/`domains/procurement/api/dto/decimal.util.ts`).
 * One shared source per module, not N duplicated regex literals.
 */
export const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;
