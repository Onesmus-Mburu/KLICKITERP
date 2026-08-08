/**
 * `Money.fromDecimalString`'s accepted shape — matches this codebase's
 * convention for decimal-string monetary DTO fields (see
 * `accounting/api/dto/budget-line-input.dto.ts`). Shared across every Billing
 * DTO file (a small, deliberate deviation from Accounting Core's per-file
 * copy of the same constant — Billing has far more DTO files than Accounting
 * Core did, so a single shared source avoids 20+ duplicated regex literals).
 */
export const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;
