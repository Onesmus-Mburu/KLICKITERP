import type { AccountResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import { optionalQuery } from "./query-params";

/**
 * Phase 6 Slice 3 — GL account picker research outcome: `GET
 * /accounting/accounts` (`packages/server/src/accounting/api/accounts.controller.ts`,
 * permission `accounting:account:view`) is a REAL, existing list endpoint —
 * confirmed by reading the controller before assuming a fallback was
 * needed. It supports `class`/`isActive`/`parentId` query filters, all
 * declared required-`string` in the generated OpenAPI type (the same
 * codegen quirk `optionalQuery` exists for). `class=INCOME&isActive=true`
 * is exactly what `<GlAccountSelect>` needs for the fee-category
 * `glIncomeAccountId` picker — a real DTO, `AccountResponseDto`, is already
 * exported from `@klickit/contracts` (`packages/contracts/src/accounting/account-response.schema.ts`),
 * so no hand-typing was needed here (unlike `../types.ts`'s academic-year/term
 * gap).
 *
 * A real bug was found and fixed while live-verifying this slice: the
 * endpoint has NO `isPostable` query filter (only `class`/`isActive`/
 * `parentId`, confirmed by reading `accounts.controller.ts`), so the raw
 * list includes non-postable "header"/rollup accounts (e.g. the real dev-DB
 * seed's `4000 Income`, a parent of `4010 School Fees Income` etc.).
 * Picking a header account as a fee category's `glIncomeAccountId` looks
 * fine at fee-category-create time but makes `POST /billing/invoices/:id/post`
 * fail later with `"PostingService.post: account 4000 is not postable
 * (header account) — cannot be posted to"` — a real, confusing failure far
 * downstream of the actual mistake. Filtered out client-side here
 * (`account.isPostable === true`) since the backend offers no server-side
 * filter for it — `<GlAccountSelect>` now only ever offers real, postable
 * leaf accounts.
 */
export async function listIncomeAccounts(): Promise<AccountResponseDto[]> {
  const accounts = await unwrapApiResult<AccountResponseDto[]>(
    await apiClient.GET("/api/v1/accounting/accounts", {
      params: { query: optionalQuery({ class: "INCOME", isActive: "true", parentId: undefined }) },
    }),
  );
  return accounts.filter((account) => account.isPostable);
}
