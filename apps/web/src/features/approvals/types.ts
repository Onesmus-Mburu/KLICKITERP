import type { ActionResponseDto, InstanceDetailResponseDto, InstanceResponseDto } from "@klickit/contracts";

/**
 * Phase 6 Slice 5 (Approvals engine frontend) — the SAME class of codegen gap
 * `features/payments/types.ts`'s `CashierSession` already documents:
 * `InstanceResponseDtoSchema`/`ActionResponseDtoSchema`
 * (`packages/contracts/src/platform/approvals/*.schema.ts`) declare
 * `submittedAt`/`decidedAt`/`actedAt` as `z.coerce.date()`, mirroring the
 * real server DTOs' `Date`-typed fields 1:1 — but Nest actually serializes a
 * `Date` field as a plain ISO string over JSON, and `lib/api-error.ts`'s
 * `unwrapApiResult<T>()` never calls `.parse()` on the zod schema (confirmed
 * by reading it directly). So the REAL runtime value of these three fields
 * is a STRING even though `@klickit/contracts`' inferred TS type says `Date`.
 *
 * `Instance`/`Action`/`InstanceDetail` here override just those fields to
 * `string`/`string | null` to match the REAL wire shape — every
 * function/component in `features/approvals/` (and any other feature that
 * consumes an approval instance, e.g. `features/payments/`) imports THESE
 * types, never the raw `@klickit/contracts` ones, and does `new Date(x)` at
 * the call sites that need a real `Date` object (e.g. sorting the inbox by
 * `submittedAt`, or the action trail's `actedAt.toLocaleString()`).
 */
export type Instance = Omit<InstanceResponseDto, "submittedAt" | "decidedAt"> & {
  submittedAt: string;
  decidedAt: string | null;
};

export type Action = Omit<ActionResponseDto, "actedAt"> & {
  actedAt: string;
};

export type InstanceDetail = Omit<InstanceDetailResponseDto, "submittedAt" | "decidedAt" | "actions"> & {
  submittedAt: string;
  decidedAt: string | null;
  actions: Action[];
};

/**
 * Hand-typed, deliberately PARTIAL mirror of `GET /users/{id}`'s real
 * response — the SAME class of gap `features/billing/types.ts`'s
 * `AcademicYearResponse`/`TermResponse` already documents: `UsersController.findOne()`
 * has zero `@ApiResponse({ type })` decorator (confirmed by reading
 * `users.controller.ts` directly), so `@nestjs/swagger` recorded no response
 * schema — confirmed in `packages/contracts/src/generated/openapi-types.ts`:
 * `UsersController_findOne`'s `responses: { 200: { ..., content?: never } }`.
 *
 * Unlike the AcademicYear/Term precedent, this type is deliberately NOT a
 * full mirror of `UsrUserEntity`'s every column — the real entity returned
 * by `UsersService.findByIdOrFail()` carries `passwordHash`/`twofaSecretEnc`/
 * `recoveryCodesEnc` (confirmed by reading `usr-user.entity.ts`), none of
 * which this app has any legitimate reason to reference. Only the fields
 * `<UserName>` actually needs (id/username/fullName) are declared here — a
 * `packages/server`-side fix (a real `UserResponseDto` with an
 * `@ApiResponse({type})` decorator, mirroring `receipt.dto.ts`'s own
 * `toView()` pattern) would be the real root-cause fix, but is out of scope
 * for this frontend-only slice.
 */
export interface UserSummary {
  id: string;
  username: string;
  fullName: string;
}
