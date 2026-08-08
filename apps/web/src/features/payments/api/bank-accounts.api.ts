import type { BankAccountResponseDto } from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";
import { optionalQuery } from "./query-params";

export interface ListBankAccountsParams {
  kind?: string;
  isActive?: boolean;
}

/**
 * `GET /banking/accounts`
 * (`packages/server/src/domains/banking/api/accounts.controller.ts`),
 * `banking:account:manage`-gated — the SAME required-string query-param
 * codegen quirk `optionalQuery()` exists for elsewhere: `kind`/`isActive`
 * are declared required `string` in the generated OpenAPI type
 * (`AccountsController_list__banking`) even though the real handler treats
 * both as optional (`@Query("kind") kind?: BankAccountKind`).
 */
export async function listBankAccounts(params: ListBankAccountsParams = {}): Promise<BankAccountResponseDto[]> {
  return unwrapApiResult<BankAccountResponseDto[]>(
    await apiClient.GET("/api/v1/banking/accounts", {
      params: {
        query: optionalQuery({
          kind: params.kind,
          isActive: params.isActive !== undefined ? String(params.isActive) : undefined,
        }),
      },
    }),
  );
}
