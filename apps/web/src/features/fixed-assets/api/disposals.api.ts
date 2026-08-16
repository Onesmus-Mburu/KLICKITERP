import type { CreateFaDisposalDto, DecideFaDisposalDto, FaDisposalResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 23 Part 4 (Fixed Assets, Module 17) — thin wrapper over
 * `DisposalController`
 * (`packages/server/src/domains/fixed-assets/api/disposal.controller.ts`,
 * base `/api/v1/fixed-assets/disposals`, tag `fixed-assets-disposal`).
 * **One shared permission across 4 routes** — `fixed-assets:disposal:create`
 * gates `list`/`findOne`/`create`/`submit` — confirmed by reading the
 * controller directly; genuinely different from Depreciation Runs' 3-way
 * split (`:run`/`:decide`/`:post` each separate) — here only `decide`
 * (`fixed-assets:disposal:decide`) and `post` (`fixed-assets:disposal:post`)
 * get their own narrower codes.
 *
 * **Zero codegen gap on either request or response side — checked directly
 * against BOTH the zod-inferred types
 * (`packages/contracts/src/domains/fixed-assets/disposal.schema.ts`) AND the
 * raw `openapi-types.ts` shape, not assumed.** The raw generated
 * `FaDisposalResponseDto` DOES degrade `approvalRef`/`journalId` to
 * `Record<string, never> | null` (the same nullable-without-an-explicit-
 * `type:`-hint reflection gap every prior Part's own `*.api.ts` doc comment
 * documents) — but the zod-inferred type used directly below as this file's
 * read-return type gets both right (`z.string().nullable()`), absorbing the
 * gap for free, the same `depreciation-runs.api.ts` precedent. Every
 * request-body field (`CreateFaDisposalDto.assetId`/`.method`/`.proceeds`,
 * `DecideFaDisposalDto.decision`) is a plain uuid/enum/decimal-string with an
 * explicit type hint — no cast needed anywhere in this file.
 *
 * **`list()`'s `status` query param is genuinely optional server-side
 * (`@Query("status") status?: FaDisposalStatus`) but generates as a REQUIRED
 * plain `string` on the raw operation type** — the same
 * `AssetsController_list`-class query-param gap `assets.api.ts`/
 * `depreciation-runs.api.ts` already document; fixed the identical
 * conditional-query-object way (omitted entirely when absent).
 *
 * **`proceeds` is genuinely optional on `create()`** — omitted entirely
 * (never sent as `undefined`/`""`) when the caller leaves it blank, so the
 * server's own real default-to-`"0"` behavior applies rather than this file
 * guessing a client-side default.
 *
 * **The real 409 on a second disposal for the same asset**
 * (`uq_fa_disposal_asset_id`, BR-FA-02 — an asset can be disposed at most
 * once, ever) is never pre-validated client-side — surfaced verbatim via
 * `ApiError.message` by every caller of `createDisposal()`, the same
 * discipline `depreciation-runs.api.ts`'s own `uq_fa_depreciation_run_period_id`
 * 409 already establishes for the structurally identical
 * once-ever-per-entity constraint shape. Already a clean `ConflictException`
 * server-side (confirmed by reading `disposal.service.ts` directly) — no
 * backend fix needed here, unlike Part 1's own pre-fix Categories/Assets 409s.
 *
 * **`fa_disposal.status` is a genuine 4-value enum
 * (`DRAFT|PENDING_APPROVAL|APPROVED|POSTED`) — a real, CONFIRMED difference
 * from Depreciation Runs' own 3-value enum.** `decide(APPROVE)` here
 * genuinely persists `status: "APPROVED"` (confirmed by reading
 * `onApprovalDecided()` directly, `disposal.service.ts:151`) — this module's
 * own UI (`disposal-status-actions.tsx`) gates the Post button on
 * `status === "APPROVED"` specifically, unlike `depreciation-run-status-
 * actions.tsx`'s own documented "Post shown throughout PENDING_APPROVAL"
 * workaround, which only exists there because no real Approved state exists
 * to gate on. **The same "manual decide never touches the real
 * `appr_instance`" interim pattern still applies here** (confirmed: `decide()`
 * never calls `this.approvalEngine.decide()`, only writes the local
 * `fa_disposal.status` column directly) — `post()` still independently
 * re-verifies `disposal.status === "APPROVED"` server-side before proceeding,
 * so a locally-flipped-but-not-really-approved disposal is still safe; this
 * is a LOCAL status flip, not proof the real Approvals-module instance was
 * ever decided.
 */
interface ListFaDisposalsQueryShape {
  status?: string;
}

export interface ListFaDisposalsParams {
  status?: string;
}

export async function listDisposals(params: ListFaDisposalsParams = {}): Promise<FaDisposalResponseDto[]> {
  const query: ListFaDisposalsQueryShape = {};
  if (params.status !== undefined) query.status = params.status;
  return unwrapApiResult<FaDisposalResponseDto[]>(
    await apiClient.GET("/api/v1/fixed-assets/disposals", { params: { query: query as unknown as Required<ListFaDisposalsQueryShape> } }),
  );
}

export async function getDisposal(id: string): Promise<FaDisposalResponseDto> {
  return unwrapApiResult<FaDisposalResponseDto>(
    await apiClient.GET("/api/v1/fixed-assets/disposals/{id}", { params: { path: { id } } }),
  );
}

/** `gainLoss = proceeds - NBV` is computed and FROZEN server-side at creation — never sent or guessed by this file. Real 409 verbatim if this asset already has a disposal (BR-FA-02). */
export async function createDisposal(dto: CreateFaDisposalDto): Promise<FaDisposalResponseDto> {
  return unwrapApiResult<FaDisposalResponseDto>(await apiClient.POST("/api/v1/fixed-assets/disposals", { body: dto }));
}

/** No request body. Only legal from `DRAFT` — a real `ValidationException` (422) otherwise, surfaced verbatim. */
export async function submitDisposal(id: string): Promise<FaDisposalResponseDto> {
  return unwrapApiResult<FaDisposalResponseDto>(
    await apiClient.POST("/api/v1/fixed-assets/disposals/{id}/submit", { params: { path: { id } } }),
  );
}

/** `decision: "APPROVE" | "RETURN"`. Only legal from `PENDING_APPROVAL`. APPROVE genuinely persists `status: "APPROVED"` here — see this file's own doc comment. RETURN reverts to `DRAFT` and clears `approvalRef`. */
export async function decideDisposal(id: string, dto: DecideFaDisposalDto): Promise<FaDisposalResponseDto> {
  return unwrapApiResult<FaDisposalResponseDto>(
    await apiClient.POST("/api/v1/fixed-assets/disposals/{id}/decide", { params: { path: { id } }, body: dto }),
  );
}

/** No request body. Only legal from `APPROVED`. Realizes P-31 (up to 4 journal lines, any zero-amount line skipped), sets `status: "POSTED"`, and sets `fa_asset.status = 'DISPOSED'` UNCONDITIONALLY — even for `method: "WRITE_OFF"`, see `disposal-status-actions.tsx`'s own doc comment. */
export async function postDisposal(id: string): Promise<FaDisposalResponseDto> {
  return unwrapApiResult<FaDisposalResponseDto>(
    await apiClient.POST("/api/v1/fixed-assets/disposals/{id}/post", { params: { path: { id } } }),
  );
}
