/**
 * Decimal-string DTO field pattern — matches this codebase's established
 * convention (`domains/billing`/`domains/procurement`'s own
 * `api/dto/decimal.util.ts`). Used for both quantity (`NUMERIC(14,4)`) and
 * cost (`NUMERIC(18,6)`) fields — both accept the same shape, just different
 * precision, validated/parsed at the service layer (`decimal-qty.util.ts`).
 */
export const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;
