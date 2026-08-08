"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BulkGenerateAdhocInvoicesDto } from "@klickit/contracts";
import { bulkGenerateAdhocInvoices, listCategoriesForScope } from "../api/bulk-adhoc-invoices.api";
import { INVOICES_QUERY_KEY } from "./use-invoices";

export const CATEGORIES_FOR_SCOPE_QUERY_KEY = ["billing", "fee-structures", "categories-for-scope"] as const;

/** Only enabled once both `academicYearId` and `classId` are chosen — mirrors `useFeeStructures()`'s own two-required-param gating. */
export function useCategoriesForScope(academicYearId: string | undefined, classId: string | undefined) {
  return useQuery({
    queryKey: [...CATEGORIES_FOR_SCOPE_QUERY_KEY, academicYearId, classId],
    queryFn: () => listCategoriesForScope(academicYearId as string, classId as string),
    enabled: !!academicYearId && !!classId,
  });
}

/**
 * Invalidates `INVOICES_QUERY_KEY` broadly on success (every succeeded
 * student's own invoice list was just touched — there's no single
 * `studentId` to scope the invalidation to the way `useGenerateInvoice()`'s
 * single-student mutation does).
 */
export function useBulkGenerateAdhocInvoices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: BulkGenerateAdhocInvoicesDto) => bulkGenerateAdhocInvoices(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INVOICES_QUERY_KEY });
    },
  });
}
