/**
 * Phase 6 Slice 17 Part 4 (Integrity Sweep, Module 7) — `lib/` sibling of
 * `journal-lines.ts`/`budget-lines.ts` (Parts 2/3's own precedent for a
 * feature-local, non-hook, non-component helper file).
 *
 * `IntegrityRunResponseDto.findings` has no generated shape at all (see
 * `../api/integrity-sweep.api.ts`'s own doc comment) — this shape is defined
 * directly from reading `IntegritySweepService.runSweep()`
 * (`packages/server/src/accounting/application/integrity-sweep.service.ts`)
 * verbatim, not guessed: it builds and persists exactly
 * `{ranAt, kind, ok, findings: {mismatchCount, mismatches}}`, where each
 * mismatch is keyed by `(periodId, accountId, costCenterId)` and carries
 * BOTH the stored `gl_period_account_total` value (maintained incrementally
 * by `PostingService`) and the value re-derived directly from
 * `SUM(gl_journal_line.debit/credit)` — `stored`/`derived` are each `null`
 * when that side of the comparison has no row at all for this key (e.g. a
 * stored total with zero real postings behind it, or vice versa), not just
 * when the two disagree. Every amount is a `Money.toDecimalString()` decimal
 * STRING (4dp), never a JS number — same discipline `lib/money.ts`'s own
 * doc comment establishes for every other monetary value in this app.
 *
 * **A real, live-verification-only finding this file exists specifically to
 * guard against**: `gl_integrity_run` (`GlIntegrityRunRepository`) is a
 * SHARED table, not one private to this module — `GET .../runs` has no
 * `kind` filter at all (confirmed by reading `IntegritySweepController`/
 * `IntegritySweepService.listRecent()` directly), and a live call against
 * this dev DB returned real rows with `kind: "WALLET_RECONCILE"` (Wallet's
 * own structurally-similar sweep, `features/wallet/api/reconciliation.api.ts`
 * — same table, different producer) mixed in with (eventually) this
 * module's own `kind: "PERIOD_ACCOUNT_TOTAL_RECONCILIATION"` rows. A
 * `WALLET_RECONCILE` row's real `findings` shape is completely different
 * (`{variance, walletCount, walletTotal, glControlBalance}`, no `mismatches`
 * array at all) — asserting it straight into `IntegritySweepFindings` and
 * then calling `.mismatches.length` on it would throw a real runtime
 * `TypeError` the first time a Wallet reconciliation row appeared in this
 * list, which — given both sweeps write the same table — is not a
 * theoretical edge case, it's what a real "recent runs" call returns TODAY
 * on this exact dev DB. `parseIntegrityFindings()` below therefore returns
 * `null` for any `findings` blob that doesn't structurally match (i.e.
 * `mismatches` isn't an array), and both callers
 * (`integrity-run-list.tsx`/`integrity-run-findings.tsx`) render an honest
 * fallback for that case instead of crashing.
 */
export interface IntegrityMismatchTotal {
  debitTotal: string;
  creditTotal: string;
}

export interface IntegrityMismatch {
  periodId: string;
  accountId: string;
  costCenterId: string | null;
  stored: IntegrityMismatchTotal | null;
  derived: IntegrityMismatchTotal | null;
}

export interface IntegritySweepFindings {
  mismatchCount: number;
  mismatches: IntegrityMismatch[];
}

/**
 * `findings` arrives typed as a bare `object`/`Record<string, unknown>` (no
 * generated shape exists to check against). Returns `null` when the value
 * doesn't structurally match this module's own `{mismatchCount, mismatches}`
 * shape (see this file's own doc comment above for why that's a real case,
 * not defensive paranoia) — every other field is trusted as-is once
 * `mismatches` is confirmed to be a real array, matching this codebase's
 * established `unwrapApiResult<T>()` discipline of trusting the server's own
 * response shape rather than re-parsing every field with zod client-side.
 */
export function parseIntegrityFindings(findings: object): IntegritySweepFindings | null {
  const candidate = findings as { mismatchCount?: unknown; mismatches?: unknown };
  if (!Array.isArray(candidate.mismatches)) return null;
  return {
    mismatchCount: typeof candidate.mismatchCount === "number" ? candidate.mismatchCount : candidate.mismatches.length,
    mismatches: candidate.mismatches as IntegrityMismatch[],
  };
}
