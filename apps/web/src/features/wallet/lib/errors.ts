import { ApiError } from "@/lib/api-error";

/**
 * Phase 6 Slice 8 — the two real, distinct error shapes the bulk "Generate
 * Invoice" screen's "collect from wallet" loop needs to tell apart, both
 * verified directly against `WalletTransactionsService.transferToFees()`'s
 * real thrown exceptions (not guessed) — mirrors
 * `features/billing/lib/errors.ts`'s own established pattern for this
 * codebase.
 *
 *  - `isTransferNeedsApprovalError` — `assertBelowThresholdOrApproved()`
 *    throws `new ValidationException("FR-WALL-013.1: ... amount ...
 *    exceeds the KES ${threshold} approval threshold ...")`
 *    (`ValidationException.httpStatus = 422`, `.code = "VALIDATION_ERROR"`)
 *    once `amount` exceeds the transfer-approval threshold (KES 5,000 by
 *    default) and no `approvalRef` was supplied. Matched on the
 *    `FR-WALL-013.1` marker, present in every message this guard produces.
 *  - `isInsufficientBalanceError` — `assertFloor()` throws `new
 *    ValidationException("BR-WALL-01: wallet ... balance floor violated —
 *    resulting balance ... would be below -overdraft_limit ...")` when the
 *    transfer would push the wallet below `-overdraftLimit`. Matched on the
 *    `BR-WALL-01` marker.
 *
 * Every OTHER error (wallet status blocks debits, GL not configured, etc.)
 * falls through to a generic `err.message` render — these two helpers are
 * additive, not a replacement for that fallback.
 */
export function isTransferNeedsApprovalError(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 422 && /FR-WALL-013\.1/.test(err.message);
}

export function isInsufficientBalanceError(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 422 && /BR-WALL-01/.test(err.message);
}

/**
 * Phase 6 Slice 11 (Part 2) additions — two more real, distinct error shapes
 * the new Update Limits and Close Wallet dialogs need to tell apart, both
 * verified directly against `WalletsService.updateLimits()`/
 * `WalletTransactionsService.closeWallet()`'s real thrown exceptions (not
 * guessed — confirmed by reading `packages/server/src/domains/wallet/
 * application/{wallets,wallet-transactions}.service.ts` directly).
 *
 *  - `isLimitsCeilingExceededError` — `updateLimits()` throws `new
 *    ValidationException("BR-WALL-04: dailyLimit ... exceeds the
 *    school-policy maximum ...")` / the equivalent `txnLimit` message once a
 *    caller-set limit exceeds the `wallet.max_daily_limit`/
 *    `wallet.max_txn_limit` Settings ceiling (when one is configured — this
 *    dev environment has none configured, confirmed directly via `psql`
 *    against `set_setting`, so this path was NOT exercised live this pass;
 *    the helper is still built for real, since Settings-key values are a
 *    per-environment configuration concern, not a code-path this dispatch
 *    controls). Matched on the `BR-WALL-04` marker, present in both the
 *    dailyLimit and txnLimit variants of this message.
 *  - `isNegativeBalanceCloseError` — `closeWallet()` throws `new
 *    ValidationException("WalletTransactionsService.closeWallet: wallet ...
 *    carries a negative balance (..., an overdraft) — no disposition can
 *    inject funds; settle it via adjust() first")` when the wallet's balance
 *    is negative at close time (an overdraft never comes up in the normal
 *    zero-or-positive-balance close flow this dispatch's own dialog drives,
 *    but the backend rejects it outright rather than silently applying a
 *    disposition that couldn't cover it) — surfaced as-is, not pre-blocked
 *    client-side, per the plan's explicit instruction. Matched on the
 *    `closeWallet: wallet` + `negative balance` markers.
 *
 * Every OTHER error (missing disposition sub-fields, unknown status, etc.)
 * falls through to a generic `err.message` render — these helpers are
 * additive, not a replacement for that fallback.
 */
export function isLimitsCeilingExceededError(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 422 && /BR-WALL-04/.test(err.message);
}

export function isNegativeBalanceCloseError(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 422 && /closeWallet:.*negative balance/.test(err.message);
}
