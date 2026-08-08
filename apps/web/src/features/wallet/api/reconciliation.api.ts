import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over `ReconciliationController`
 * (`packages/server/src/domains/wallet/api/reconciliation.controller.ts`,
 * `wallet:reconciliation:run` — the only permission this controller has, for
 * both routes). On-demand only — no scheduler exists anywhere in this
 * codebase, confirmed by reading `ReconciliationController`'s own doc
 * comment ("Automatic hourly triggering is deliberately NOT wired").
 *
 * Neither route carries an `@ApiResponse({ type })` decorator (confirmed by
 * reading the controller directly — both are bare `@ApiResponse({ status })`),
 * so `@klickit/contracts` has no generated type for this response shape —
 * the same class of gap `features/approvals/types.ts`'s `UserSummary`/
 * `features/billing/types.ts`'s `AcademicYearResponse` already document.
 * Hand-typed here to match `ReconciliationController.toView()`'s real,
 * literal return shape exactly: `null` when no sweep has ever run yet,
 * otherwise `{id, ranAt, kind, ok, findings}` — `ranAt` is a real wire STRING
 * (Nest serializes a `Date` field as ISO-8601 over JSON even though the
 * entity's own TS type says `Date` — same gap `features/approvals/types.ts`'s
 * own doc comment documents for `submittedAt`/`decidedAt`/`actedAt`).
 */
export interface WalletReconciliationResult {
  id: string;
  ranAt: string;
  kind: string;
  ok: boolean;
  findings: Record<string, unknown>;
}

export async function runWalletReconciliation(): Promise<WalletReconciliationResult | null> {
  return unwrapApiResult<WalletReconciliationResult | null>(
    await apiClient.POST("/api/v1/wallet-reconciliation/run"),
  );
}

export async function getWalletReconciliationStatus(): Promise<WalletReconciliationResult | null> {
  return unwrapApiResult<WalletReconciliationResult | null>(
    await apiClient.GET("/api/v1/wallet-reconciliation/status"),
  );
}
