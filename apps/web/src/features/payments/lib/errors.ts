import { ApiError } from "@/lib/api-error";

/**
 * `CashierSessionsService.openSession()` — a real `23505` unique-violation on
 * `uq_pay_session_open_p` (the DB-enforced "at most one OPEN session per
 * cashier" partial unique index) translated to `ConflictException` (409,
 * code `CONFLICT`), message containing the stable `BR-PAY-04` marker
 * (confirmed by reading `cashier-sessions.service.ts`'s `openSession()`
 * directly, not guessed).
 */
export function isSessionAlreadyOpenError(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 409 && /BR-PAY-04/.test(err.message);
}

/**
 * `CashierSessionsService.closeSession()` — a real `ValidationException`
 * (422, code `VALIDATION_ERROR`) thrown when the computed aggregate variance
 * exceeds the `payments.session_variance_tolerance` Settings key (defaults to
 * `"0.00"` when unconfigured) and no `approval` was supplied, message
 * containing the stable `BR-PAY-05` marker.
 *
 * No endpoint previews expected-vs-counted before closing (confirmed by
 * reading `cashier-sessions.controller.ts`/`.service.ts` — `expectedTotals`
 * is computed INSIDE `closeSession()` itself, never exposed ahead of time) —
 * `components/session-close-dialog.tsx` matches on this EXACT error to
 * reveal the supervisor-override sub-form in place and let the cashier
 * resubmit with it filled in. This is the correct, intended shape given the
 * real backend (attempt close, react to the specific failure), not a
 * workaround — and since the tolerance defaults to `"0.00"`, this is
 * expected to be the NORMAL close path in an unconfigured dev environment,
 * not a rare edge case.
 */
export function isVarianceExceededError(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 422 && /BR-PAY-05/.test(err.message);
}
