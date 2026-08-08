/**
 * `Money.fromDecimalString`'s accepted shape — matches this codebase's
 * convention for decimal-string monetary DTO fields (see
 * `domains/billing/api/dto/decimal.util.ts`, `accounting/api/dto/budget-line-input.dto.ts`).
 * A per-module copy rather than a shared import — `domains/billing`'s own
 * copy is not exported from its public barrel, and this is a small enough
 * literal that duplicating it (as every other module already has) is
 * preferable to widening billing's public surface for one regex constant.
 */
export const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;
