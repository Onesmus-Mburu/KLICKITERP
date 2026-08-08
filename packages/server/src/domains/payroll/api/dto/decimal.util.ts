/**
 * `Money.fromDecimalString`'s accepted shape — matches this codebase's
 * convention for decimal-string monetary DTO fields (see
 * `domains/billing/api/dto/decimal.util.ts`). Shared across every Payroll
 * DTO file, same "one shared source, not N duplicated regex literals" call
 * every other domain module's own `dto/decimal.util.ts` already makes.
 */
export const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;
