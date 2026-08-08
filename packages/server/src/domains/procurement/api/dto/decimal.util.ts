/**
 * `Money.fromDecimalString`'s accepted shape — matches this codebase's
 * convention for decimal-string monetary DTO fields (see
 * `domains/billing/api/dto/decimal.util.ts`). Shared across every
 * Procurement DTO file, same "one shared source, not 8 duplicated regex
 * literals" call Billing already made.
 */
export const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;
