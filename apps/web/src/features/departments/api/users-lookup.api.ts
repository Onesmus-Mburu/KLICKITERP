import type { UserListResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * A small, self-contained `GET /users` wrapper for exactly one purpose: the
 * head-of-department picker (`<Combobox>`) in `create-department-dialog.tsx`/
 * `edit-department-dialog.tsx`. Deliberately NOT importing from
 * `features/users/` (that folder doesn't exist yet — Phase 6 Slice 13 Part 4
 * builds it, and Departments ships before Users per the plan) and
 * deliberately NOT importing from `features/wallet/api/users.api.ts` or
 * `features/approvals/api/users.api.ts` either (those are other features' own
 * narrow, purpose-built wrappers, not a shared dependency this feature should
 * reach into) — matches this codebase's established "each feature folder
 * stays self-contained" convention, confirmed directly by reading
 * `features/wallet/api/users.api.ts`'s own doc comment before writing this
 * one.
 *
 * Unlike `features/wallet/api/users.api.ts` (written before Phase 6 Slice 13
 * Part 1 closed the Users/Roles/Departments contracts gap, and so had to
 * hand-type `UserListItem`/`UserListResult`), this wrapper imports the real,
 * generated `UserListResponseDto` (and by extension `UserResponseDto`)
 * directly from `@klickit/contracts` — no hand-typed shape needed. Only
 * `id`/`fullName`/`username` are actually used by the picker
 * (`use-users-lookup.ts` maps the full `UserResponseDto` down to Combobox
 * items), but there's no reason to narrow the wrapper's own return type when
 * the real type is already available and correct.
 *
 * `UsersController.list()` (`packages/server/src/platform/users/api/
 * users.controller.ts`, `users:user:view`) has no `q` search param (confirmed
 * by reading the controller directly — only `departmentId`/`status` plus
 * pagination), so this fetches one larger page (`pageSize=200`) and lets
 * `<Combobox>`'s own built-in client-side substring search handle filtering
 * — the same "no dedicated search endpoint, filter the fetched page"
 * tradeoff `features/wallet/api/users.api.ts`'s own operator picker already
 * accepts for the same reason.
 */
const LOOKUP_PAGE_SIZE = 200;

/**
 * `UsersController_list`'s generated query-param type still requires
 * `departmentId`/`status` (`Type '{...}' is missing ... departmentId,
 * status`) even though both are genuinely optional server-side
 * (`@Query("departmentId") departmentId?: string`) — the same
 * required-vs-actually-optional codegen quirk `features/wallet/api/users.api.ts`'s
 * own `UsersListQueryShape` doc comment documents. `page`/`pageSize`
 * themselves are real, correctly-typed optional numbers (Phase 6 Slice 13
 * Part 1 added `@ApiQuery` for both), so only `departmentId`/`status` need
 * this cast.
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
