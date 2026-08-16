import type {
  CreateFaVerificationDto,
  DecideFaVerificationDto,
  FaVerificationLineResponseDto,
  FaVerificationResponseDto,
  PostFaVerificationResponseDto,
  RecordVerificationCountsDto,
} from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Phase 6 Slice 23 Part 5 (Fixed Assets, Module 17) — the FINAL part of this
 * slice. Thin wrapper over `VerificationController`
 * (`packages/server/src/domains/fixed-assets/api/verification.controller.ts`,
 * base `/api/v1/fixed-assets/verifications`, tag
 * `fixed-assets-verification`). `fixed-assets:verification:create` gates
 * `list`/`findOne`/`listLines`/`create`/`submit`; `:count` gates
 * `recordCounts` alone (a genuinely separate code from every other route,
 * confirmed by reading the controller directly); `:decide`/`:post` are each
 * their own separate codes too — a 4-way split, one more than Depreciation
 * Runs' own 3-way split.
 *
 * **THE HEADLINE FIX THIS PART SHIPS**: `FaVerificationScopeDto.assetIds`
 * previously carried zero class-validator decorators, so the global
 * `ValidationPipe`'s own `whitelist: true` silently stripped it from every
 * real request before `VerificationController.create()` ever saw it,
 * crashing `VerificationService.createSession()` with a raw 500 on every
 * single call ever made to this endpoint. Fixed in
 * `verification.dto.ts` (a local duplicate of `domains/inventory`'s own
 * `IsAllOrUuidArrayConstraint`, since `fixed-assets` cannot import that
 * module — see that file's own doc comment for the full history). This file
 * was only buildable/testable AFTER that fix — see this slice's own
 * `docs/phase-6/PROGRESS.md` write-up for the live before/after proof.
 *
 * **Zero codegen gap on either request or response side — checked directly
 * against BOTH the zod-inferred types
 * (`packages/contracts/src/domains/fixed-assets/verification.schema.ts`) AND
 * the raw `openapi-types.ts` shape, not assumed.** The raw generated
 * `FaVerificationResponseDto` DOES degrade `approvalRef`/`journalId` to
 * `Record<string, never> | null` (the same nullable-without-an-explicit-
 * `type:`-hint reflection gap every prior part's own `*.api.ts` doc comment
 * documents) — but the zod-inferred type used directly below as this file's
 * read-return type gets both right (`z.string().nullable()`), absorbing the
 * gap for free, the same `disposals.api.ts`/`depreciation-runs.api.ts`
 * precedent. `FaVerificationScopeDto.assetIds` (`z.union([z.array(z.string()),
 * z.literal("ALL")])`) generates correctly on the zod side even though the
 * DTO CLASS carried zero decorators — the zod-codegen script mirrors the TS
 * field type, not the class-validator decorator list, so this particular
 * codegen path was never itself broken; only real runtime requests were.
 *
 * **`list()`'s `status` query param is genuinely optional server-side
 * (`@Query("status") status?: FaVerificationStatus`) but generates as a
 * REQUIRED plain `string` on the raw operation type** — the same
 * `AssetsController_list`-class query-param gap every sibling `*.api.ts`
 * file already documents; fixed the identical conditional-query-object way
 * (omitted entirely when absent, not sent as `""`).
 *
 * **5 real lifecycle steps, not 4** — `create` -> `recordCounts` (1+ times,
 * a genuinely separate `:count` permission) -> `submit` -> `decide` ->
 * `post`. `recordCounts()` can be called repeatedly while `status` is
 * `OPEN`/`COUNTING`; the server auto-progresses `OPEN -> COUNTING` on the
 * first call, `-> REVIEW` once every line has been touched (`notes !==
 * null`) — see `verification-lines-recorder.tsx`'s own doc comment for how
 * the UI surfaces that progress.
 *
 * **`decide(APPROVE)` never changes `status`** — mirrors Depreciation Runs'
 * own finding, NOT Disposals': `fa_verification.status` is a 6-value enum
 * (`OPEN|COUNTING|REVIEW|PENDING_APPROVAL|POSTED|CANCELLED`, `CANCELLED`
 * never reachable via any code path this pass) with no dedicated `APPROVED`
 * value — confirmed by reading `onApprovalDecided()` directly
 * (`verification.service.ts:209-225`): the `if (approved) { return
 * verification; }` branch literally returns the entity untouched, same as
 * Depreciation Runs. `post()` independently re-verifies the real
 * `ApprovalEngineService.getStatus("fa_verification", id)` before allowing
 * posting — the SAME real-instance-check pattern Inventory's own Stock
 * Takes already establish (their own `status` enum has no `APPROVED` value
 * either, for the identical reason). This means the module's OWN `decide`
 * endpoint can never, by itself, make `post()` succeed — see
 * `verification-status-actions.tsx`'s own doc comment for how the UI is
 * honest about this.
 */
interface ListFaVerificationsQueryShape {
  status?: string;
}

export interface ListFaVerificationsParams {
  status?: string;
}

export async function listVerifications(params: ListFaVerificationsParams = {}): Promise<FaVerificationResponseDto[]> {
  const query: ListFaVerificationsQueryShape = {};
  if (params.status !== undefined) query.status = params.status;
  return unwrapApiResult<FaVerificationResponseDto[]>(
    await apiClient.GET("/api/v1/fixed-assets/verifications", {
      params: { query: query as unknown as Required<ListFaVerificationsQueryShape> },
    }),
  );
}

export async function getVerification(id: string): Promise<FaVerificationResponseDto> {
  return unwrapApiResult<FaVerificationResponseDto>(
    await apiClient.GET("/api/v1/fixed-assets/verifications/{id}", { params: { path: { id } } }),
  );
}

export async function listVerificationLines(id: string): Promise<FaVerificationLineResponseDto[]> {
  return unwrapApiResult<FaVerificationLineResponseDto[]>(
    await apiClient.GET("/api/v1/fixed-assets/verifications/{id}/lines", { params: { path: { id } } }),
  );
}

/** Creates the session at `OPEN`, snapshotting scope into one `found=false` line per asset. `"ALL"` resolves to every currently `ACTIVE` asset at creation time (throws if none exist); an explicit array is de-duplicated server-side (throws if empty). */
export async function createVerification(dto: CreateFaVerificationDto): Promise<FaVerificationResponseDto> {
  return unwrapApiResult<FaVerificationResponseDto>(
    await apiClient.POST("/api/v1/fixed-assets/verifications", { body: dto }),
  );
}

/** `fixed-assets:verification:count` — a permission genuinely separate from every other route on this controller. Only legal while `status` is `OPEN`/`COUNTING`. Can be called repeatedly (a partial batch, then more later) — the real, returned `status` tells the caller whether every line has now been touched. */
export async function recordVerificationCounts(id: string, dto: RecordVerificationCountsDto): Promise<FaVerificationResponseDto> {
  return unwrapApiResult<FaVerificationResponseDto>(
    await apiClient.POST("/api/v1/fixed-assets/verifications/{id}/counts", { params: { path: { id } }, body: dto }),
  );
}

/** No request body. Only legal from `REVIEW` (every line touched). Submits a real `ASSET_VERIFICATION` approval instance with `amount: null` — no natural monetary figure for a physical count. */
export async function submitVerification(id: string): Promise<FaVerificationResponseDto> {
  return unwrapApiResult<FaVerificationResponseDto>(
    await apiClient.POST("/api/v1/fixed-assets/verifications/{id}/submit", { params: { path: { id } } }),
  );
}

/** `decision: "APPROVE" | "RETURN"`. Only legal from `PENDING_APPROVAL`. APPROVE never changes `status` — see this file's own doc comment. RETURN reverts to `REVIEW`. */
export async function decideVerification(id: string, dto: DecideFaVerificationDto): Promise<FaVerificationResponseDto> {
  return unwrapApiResult<FaVerificationResponseDto>(
    await apiClient.POST("/api/v1/fixed-assets/verifications/{id}/decide", { params: { path: { id } }, body: dto }),
  );
}

/** No request body. Only legal from `PENDING_APPROVAL` with a genuinely `APPROVED` real `ASSET_VERIFICATION` `appr_instance` (independently re-verified server-side — see this file's own doc comment). Applies `condition` updates for every FOUND line with one recorded, and returns `missingAssetIds` — every `found=false` line's `assetId`, a plain write-off-proposal report, never an automatic disposal. `journalId` stays `null` forever — no GL impact from this action itself. */
export async function postVerification(id: string): Promise<PostFaVerificationResponseDto> {
  return unwrapApiResult<PostFaVerificationResponseDto>(
    await apiClient.POST("/api/v1/fixed-assets/verifications/{id}/post", { params: { path: { id } } }),
  );
}
