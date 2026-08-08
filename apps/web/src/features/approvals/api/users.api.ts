import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import type { UserSummary } from "../types";

/**
 * `GET /users/{id}` (`users:user:view`-gated) — no bulk lookup endpoint
 * exists anywhere in this codebase (confirmed by reading `users.controller.ts`
 * directly), so initiator/actor name resolution is genuinely one call per
 * distinct user id; `useUser()`'s TanStack Query cache dedupes repeated
 * lookups of the same id across an inbox table/action trail for free. See
 * `../types.ts`'s own doc comment for why the response type is hand-typed
 * (no `@ApiResponse({type})` on this handler) and deliberately partial (not
 * the raw entity, which carries `passwordHash`/2FA secret columns).
 */
export async function getUser(id: string): Promise<UserSummary> {
  return unwrapApiResult<UserSummary>(await apiClient.GET("/api/v1/users/{id}", { params: { path: { id } } }));
}
