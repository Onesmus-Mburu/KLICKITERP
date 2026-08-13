import type { IntegrityRunResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 17 Part 4 (Integrity Sweep, Module 7 — the final part of this
 * slice) — thin wrapper over `IntegritySweepController`
 * (`packages/server/src/accounting/api/integrity-sweep.controller.ts`, base
 * `/api/v1/accounting/integrity-sweep`) — `accounting:integrity-sweep:run` is
 * the ONLY permission this controller has, gating BOTH routes (confirmed by
 * reading the controller directly, 34 lines — `run` and `listRuns` each
 * carry the identical `@RequirePermission`, unlike every other multi-route
 * controller in this feature folder which splits `:view`/`:manage` across
 * read vs. write).
 *
 * **`findings` has no generated shape at all** — `IntegrityRunResponseDto`
 * types it `@ApiProperty({ type: "object", additionalProperties: true })`
 * server-side, which both the real DTO class and the generated OpenAPI type
 * render as a bare `Record<string, unknown>`/`{[key: string]: unknown}` —
 * there is nothing here for `openapi-typescript` to narrow, unlike the
 * "nullable-without-a-primitive-hint" class of gap documented elsewhere in
 * this feature folder. The real, concrete shape
 * (`{mismatchCount, mismatches: Mismatch[]}`) is defined and cast
 * client-side in `../lib/integrity-findings.ts`, confirmed by reading
 * `IntegritySweepService.runSweep()` directly rather than guessed.
 *
 * **One real query-param gap, the same class as every other list endpoint in
 * this slice**: `IntegritySweepController_listRuns`'s generated query type
 * requires `limit` as a plain (non-optional) `string`, even though the real
 * controller (`@Query("limit") limit?: string`) treats it as genuinely
 * optional — fixed the same conditional-query-object way as
 * `journals.api.ts`/`budgets.api.ts` (the key is omitted entirely when no
 * limit is supplied, never padded with an empty string, since
 * `Number.parseInt("", 10)` is `NaN` and `IntegritySweepController.listRuns()`
 * would then call `listRecent(undefined)` anyway — harmless here specifically,
 * but omitting the key is still the correct, consistent fix rather than
 * relying on that coincidence).
 *
 * **`run()` genuinely takes no body** — mirrors
 * `features/wallet/api/reconciliation.api.ts`'s own `runWalletReconciliation()`
 * (a structurally identical sibling sweep — same `{id, ranAt, kind, ok,
 * findings}` shape — for the Wallet module), confirmed live precedent that a
 * bare `apiClient.POST("/api/v1/...")` call with no second argument is the
 * correct shape for a truly bodyless, path-param-free POST in this codebase.
 *
 * No scheduler exists anywhere in this codebase for this sweep
 * (`IntegritySweepController`'s own doc comment: "real hourly scheduling is
 * a future worker concern, not built here") — every run is a deliberate,
 * on-demand, always-safe-to-retry action (read-only against
 * `gl_journal_line`/`gl_period_account_total`, writes exactly one new
 * `gl_integrity_run` row).
 */
interface IntegritySweepListRunsQueryShape {
  limit?: string;
}

export async function runIntegritySweep(): Promise<IntegrityRunResponseDto> {
  return unwrapApiResult<IntegrityRunResponseDto>(await apiClient.POST("/api/v1/accounting/integrity-sweep/run"));
}

/** Newest-first — confirmed by reading `GlIntegrityRunRepository.listRecent()` directly (`order: { ranAt: "DESC" }`), not assumed from the controller's own `@ApiOperation` summary alone. Server defaults to 50 when `limit` is omitted (`IntegritySweepService.listRecent(limit = 50)`). */
export async function listIntegrityRuns(limit?: number): Promise<IntegrityRunResponseDto[]> {
  const query: IntegritySweepListRunsQueryShape = {};
  if (limit !== undefined) query.limit = String(limit);
  return unwrapApiResult<IntegrityRunResponseDto[]>(
    await apiClient.GET("/api/v1/accounting/integrity-sweep/runs", {
      params: { query: query as unknown as Required<IntegritySweepListRunsQueryShape> },
    }),
  );
}
