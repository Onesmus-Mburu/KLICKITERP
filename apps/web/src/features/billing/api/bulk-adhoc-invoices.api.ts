import type {
  BulkGenerateAdhocInvoicesDto,
  BulkGenerateAdhocInvoicesResultDto,
  FeeCategoryForScopeResponseDto,
} from "@klickit/contracts";
import { apiClient } from "@/lib/api-client";
import { unwrapApiResult } from "@/lib/api-error";

/**
 * Thin wrapper over the Phase 6 Slice 8 bulk "Generate Invoice" endpoints —
 * `BulkAdhocInvoicesController` (`POST billing/invoices/bulk-generate`,
 * `billing:bulk-billing:execute`) and `FeeStructuresController`'s new
 * `GET billing/fee-structures/categories-for-scope` (`billing:fee-structure:view`).
 */
export async function bulkGenerateAdhocInvoices(
  dto: BulkGenerateAdhocInvoicesDto,
): Promise<BulkGenerateAdhocInvoicesResultDto> {
  return unwrapApiResult<BulkGenerateAdhocInvoicesResultDto>(
    await apiClient.POST("/api/v1/billing/invoices/bulk-generate", { body: dto }),
  );
}

export async function listCategoriesForScope(
  academicYearId: string,
  classId: string,
): Promise<FeeCategoryForScopeResponseDto[]> {
  return unwrapApiResult<FeeCategoryForScopeResponseDto[]>(
    await apiClient.GET("/api/v1/billing/fee-structures/categories-for-scope", {
      params: { query: { academicYearId, classId } },
    }),
  );
}
