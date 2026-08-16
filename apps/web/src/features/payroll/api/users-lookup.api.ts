import type { UserListResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * A small, self-contained `GET /users` wrapper for exactly one purpose: the
 * optional "linked login account" `<Combobox>` on `create-employee-dialog.tsx`/
 * `edit-employee-dialog.tsx` (`CreatePyrlEmployeeDto.userId`/
 * `UpdatePyrlEmployeeDto.userId` — nullable FK to `usr_user`; an employee need
 * not have a linked login account). A separate, small copy of
 * `features/departments/api/users-lookup.api.ts` (itself a copy of
 * `features/wallet/api/users.api.ts`'s own pattern) — not a cross-feature
 * import, matching this codebase's established "each feature folder stays
 * self-contained" convention (confirmed by grep before writing this: no
 * feature folder imports another feature's `api/`/`hooks/` files).
 *
 * `UsersController.list()` has no `q` search param (only `departmentId`/
 * `status` plus pagination, confirmed by reading the controller directly), so
 * this fetches one larger page (`pageSize=200`) and lets `<Combobox>`'s own
 * built-in client-side substring search handle filtering — same tradeoff
 * `features/departments/api/users-lookup.api.ts` already accepts.
 */
const LOOKUP_PAGE_SIZE = 200;

/** Same `departmentId`/`status`-required-but-actually-optional codegen quirk `features/departments/api/users-lookup.api.ts`'s own doc comment documents. */
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
