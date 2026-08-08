import { ApiError } from "@/lib/api-error";

/**
 * Phase 6 Slice 3 — the two real, distinct error shapes the plan calls out
 * for friendly UI handling, both verified against the actual thrown
 * exceptions in `packages/server` (not guessed):
 *
 *  - `isAlreadyBilledInvoiceError` — `InvoicingService.generateInvoice()`
 *    catches a `23505` unique-violation on `bill_invoice`'s BR-BILL-04
 *    partial-unique index and re-throws `new ConflictException(
 *    "BR-BILL-04: student ${id} already has a live structure-generated
 *    invoice for term ${id}/structure ${id}")` — `ConflictException.httpStatus
 *    = 409`, `.code = "CONFLICT"`. Matched on the `BR-BILL-04` marker in the
 *    message (stable, code-referenced text) rather than the whole sentence,
 *    so it keeps matching even if the ids/wording around it changes.
 *  - `isGlNotConfiguredError` — `resolveControlAccount()`
 *    (`packages/server/src/domains/billing/application/gl-control-accounts.util.ts`)
 *    throws `new NotFoundException("GlAccount(control_domain)",
 *    "${domain} — no active, postable gl_account is tagged with this
 *    control_domain; seed/configure the Chart of Accounts")` when zero
 *    eligible accounts exist for a required control domain (e.g.
 *    `AR_STUDENT`) — `NotFoundException.httpStatus = 404`, `.code =
 *    "NOT_FOUND"`. `postInvoice()` calls this for `AR_STUDENT` (and
 *    `AR_SPONSOR` when concessions/sponsor awards are involved — out of this
 *    slice's scope, but the same error shape would apply). Matched on the
 *    `control_domain` marker, present in every one of that function's
 *    `NotFoundException` messages.
 *
 * Every OTHER error from these endpoints (validation, plain not-found, a
 * genuinely-misconfigured GL with >1 eligible account, etc.) falls through
 * to a generic `err.message` render — these two helpers are additive, not a
 * replacement for that fallback.
 */
export function isAlreadyBilledInvoiceError(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 409 && /BR-BILL-04/.test(err.message);
}

export function isGlNotConfiguredError(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 404 && /control_domain/.test(err.message);
}

/**
 * `paidAmount`/every other money field on `InvoiceResponseDto` is a decimal
 * string (`Money.toDecimalString()`, e.g. `"0.0000"`/`"1000.0000"`) — this
 * checks for "genuinely greater than zero" without `parseFloat` (this app's
 * standing money discipline, `lib/money.ts`'s own doc comment): a
 * non-negative decimal string is positive if and only if it contains at
 * least one non-zero digit.
 */
export function isPositiveMoney(decimalString: string): boolean {
  return /[1-9]/.test(decimalString);
}
