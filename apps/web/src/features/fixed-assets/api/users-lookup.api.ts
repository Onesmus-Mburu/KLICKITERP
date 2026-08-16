import type { UserListResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * A small, self-contained `GET /users` wrapper for exactly one purpose: the
 * optional `custodianUserId` `<Combobox>` on `create-asset-dialog.tsx`/
 * `edit-asset-dialog.tsx`. A separate, small copy of
 * `features/payroll/api/users-lookup.api.ts` (itself a copy of
 * `features/departments/api/users-lookup.api.ts`'s own pattern) — not a
 * cross-feature import, matching this codebase's established "each feature
 * folder stays self-contained" convention (confirmed by grep before writing
 * this: no feature folder imports another feature's `api/`/`hooks/` files).
 *
 * `UsersController.list()` has no `q` search param (only `departmentId`/
 * `status` plus pagination), so this fetches one larger page
 * (`pageSize=200`) and lets `<Combobox>`'s own built-in client-side
 * substring search handle filtering — same tradeoff every prior copy of
 * this file already accepts.
 */
const LOOKUP_PAGE_SIZE = 200;

/** Same `departmentId`/`status`-required-but-actually-optional codegen quirk every prior copy of this file documents. */
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
