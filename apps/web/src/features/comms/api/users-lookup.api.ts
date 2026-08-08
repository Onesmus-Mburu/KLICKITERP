import type { UserListResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * A small, self-contained `GET /users` wrapper for exactly one purpose: the
 * `EXPLICIT_USER_IDS` audience picker (`<AudiencePicker>`'s `MultiSelect`) in
 * `create-broadcast-dialog.tsx`. Deliberately NOT importing
 * `features/departments/api/users-lookup.api.ts` (or any other feature's own
 * copy) — matches this codebase's established "each feature folder stays
 * self-contained" convention, confirmed directly by reading that file's own
 * doc comment before writing this one (it documents the exact same
 * reasoning for why IT doesn't import `features/wallet/api/users.api.ts` /
 * `features/approvals/api/users.api.ts`).
 *
 * Imports the real, generated `UserListResponseDto` directly from
 * `@klickit/contracts` — no hand-typed shape needed (Users/Roles/Departments'
 * contracts gap was already closed before this module).
 *
 * `UsersController.list()` (`packages/server/src/platform/users/api/
 * users.controller.ts`, `users:user:view`) has no `q` search param (confirmed
 * by reading the controller directly — only `departmentId`/`status` plus
 * pagination), so this fetches one larger page (`pageSize=200`) and lets
 * `<MultiSelect>`'s caller-side option list stand as-is — the same
 * "no dedicated search endpoint, filter the fetched page" tradeoff
 * `departments/api/users-lookup.api.ts` already accepts for the same reason.
 */
const LOOKUP_PAGE_SIZE = 200;

/**
 * `UsersController_list`'s generated query-param type still requires
 * `departmentId`/`status` even though both are genuinely optional
 * server-side (`@Query("departmentId") departmentId?: string`) — the same
 * required-vs-actually-optional codegen quirk `departments/api/
 * users-lookup.api.ts`'s own `UsersLookupQueryShape` doc comment documents.
 * `page`/`pageSize` themselves are real, correctly-typed optional numbers, so
 * only `departmentId`/`status` need this cast.
 */
interface UsersLookupQueryShape {
  page?: number;
  pageSize?: number;
  departmentId: string;
  status: string;
}

export async function listUsersForLookup(): Promise<UserListResponseDto> {
  return unwrapApiResult<UserListResponseDto>(
    await apiClient.GET("/api/v1/users", {
      params: { query: { pageSize: LOOKUP_PAGE_SIZE } as unknown as UsersLookupQueryShape },
    }),
  );
}
