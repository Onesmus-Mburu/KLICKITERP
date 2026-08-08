import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import { optionalQuery } from "./query-params";

/**
 * A minimal, read-only `GET /users` wrapper — this feature's ONLY need is
 * the Service Points "assign operator" picker (a `usr_user` combobox).
 * `UsersController.list()` (`packages/server/src/platform/users/api/
 * users.controller.ts`, `users:user:view`) carries no `@ApiResponse({type})`
 * decorator, so `@klickit/contracts` has no generated type for it — the same
 * class of gap `features/approvals/types.ts`'s `UserSummary` already
 * documents for `GET /users/{id}`. Hand-typed here to the small subset this
 * picker actually needs (id/username/fullName/status), deliberately NOT the
 * full `UsrUserEntity` (which carries `passwordHash`/`twofaSecretEnc`/
 * `recoveryCodesEnc` — no legitimate reason for this feature to reference
 * any of those, same reasoning `UserSummary`'s own doc comment gives).
 *
 * No `q` search param exists on this endpoint (confirmed by reading the
 * controller directly — only `departmentId`/`status` plus pagination) — the
 * operator picker fetches one larger page (`pageSize=100`, this dev
 * environment's real user count is far below that) and filters client-side
 * via `<Combobox>`'s own built-in substring search, the same "no dedicated
 * search endpoint, filter the fetched page" tradeoff this codebase already
 * accepts elsewhere for small reference lists.
 */
export interface UserListItem {
  id: string;
  username: string;
  fullName: string;
  status: string;
}

export interface UserListResult {
  items: UserListItem[];
  total: number;
}

/**
 * `UsersController_list`'s generated query-param type still requires
 * `departmentId`/`status` (`Type '{...}' is missing ... departmentId,
 * status`) even though both are genuinely optional server-side
 * (`@Query("departmentId") departmentId?: string`) — the same
 * required-vs-actually-optional codegen quirk `ListWalletsParams`'s own doc
 * comment documents for `page`/`pageSize`/`sortBy`/`sortDir` on the wallet
 * list endpoint. `page`/`pageSize` themselves, however, are no longer part
 * of that quirk here: Phase 6 Slice 13 Part 1 added explicit
 * `@ApiQuery({name:"page"/"pageSize", type: Number})` to
 * `UsersController.list()` specifically to close this gap (see that
 * controller's own doc comment), so the generated type now correctly
 * declares `page?: number; pageSize?: number` — no more `String(...)`
 * coercion needed for those two. `departmentId`/`status` remain uncovered
 * (no `@ApiQuery` was added for them — out of that pass's stated scope)
 * so the `as unknown as {...}` cast at the call boundary stays, the same
 * pattern `wallets.api.ts`'s `UpdateWalletLimitsRequestBody`/
 * `SpendRequestBody` already established — real data flows through
 * unchanged, `optionalQuery()` still drops undefined fields from the real
 * request.
 */
interface UsersListQueryShape {
  page?: number;
  pageSize?: number;
  departmentId: string;
  status: string;
}

export async function listUsers(params: { page?: number; pageSize?: number } = {}): Promise<UserListResult> {
  return unwrapApiResult<UserListResult>(
    await apiClient.GET("/api/v1/users", {
      params: {
        query: optionalQuery({
          page: params.page,
          pageSize: params.pageSize,
        }) as unknown as UsersListQueryShape,
      },
    }),
  );
}
