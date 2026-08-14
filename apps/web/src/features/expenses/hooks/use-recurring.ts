"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateRecurringDto, RecurringResponseDto, RunDueDto, RunDueResultDto, UpdateRecurringDto } from "@klickit/contracts";
import {
  createRecurringTemplate,
  getRecurringTemplate,
  listRecurringTemplates,
  parseRecurringTemplate,
  runDueTemplates,
  updateRecurringTemplate,
  VOUCHER_METHODS,
  VOUCHER_PAYEE_TYPES,
  type ParsedRecurringTemplate,
  type VoucherMethod,
  type VoucherPayeeType,
} from "../api/recurring.api";
import { EXPENSE_VOUCHERS_QUERY_KEY } from "./use-vouchers";

/** `["expenses", "recurring"]` — namespaced under the shared `"expenses"` feature root alongside `EXPENSE_CATEGORIES_QUERY_KEY`/`EXPENSE_VOUCHERS_QUERY_KEY`/`PETTY_CASH_QUERY_KEY`, the same per-sub-domain-namespaced-under-one-root pattern this whole feature folder already established across Parts 1-3. */
export const EXPENSE_RECURRING_QUERY_KEY = ["expenses", "recurring"] as const;

function listKey() {
  return [...EXPENSE_RECURRING_QUERY_KEY, "list"] as const;
}

function detailKey(id: string | undefined) {
  return [...EXPENSE_RECURRING_QUERY_KEY, "detail", id] as const;
}

/** `expenses:recurring:manage`-gated (reused for every GET too, no separate view permission — see `recurring.api.ts`'s own doc comment). */
export function useRecurringTemplates() {
  return useQuery({ queryKey: listKey(), queryFn: () => listRecurringTemplates() });
}

export function useRecurringTemplate(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getRecurringTemplate(id as string), enabled: !!id });
}

function invalidateRecurringQueries(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: EXPENSE_RECURRING_QUERY_KEY });
  if (id) queryClient.invalidateQueries({ queryKey: detailKey(id) });
}

/** `expenses:recurring:manage`-gated. */
export function useCreateRecurringTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateRecurringDto) => createRecurringTemplate(dto),
    onSuccess: () => invalidateRecurringQueries(queryClient),
  });
}

/** `expenses:recurring:manage`-gated. Covers every field, incl. `isActive` toggling — see `recurring.api.ts`'s own doc comment on the full-template-overwrite semantics `<EditRecurringDialog>` must respect. */
export function useUpdateRecurringTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateRecurringDto }) => updateRecurringTemplate(id, dto),
    onSuccess: (updated) => invalidateRecurringQueries(queryClient, updated.id),
  });
}

/**
 * `expenses:recurring:run`-gated — a SEPARATE permission from `:manage`, see
 * `recurring.api.ts`'s own doc comment. **This is THE only path in this
 * whole frontend that ever materializes a due template into a real voucher**
 * (no scheduler/worker exists anywhere in this codebase). Invalidates BOTH
 * the recurring templates list (every fired template's own `nextRunOn`/
 * `lastVoucherId` just changed) AND Part 1's own vouchers list (new DRAFT
 * vouchers were just created) — per this part's own task brief, importing
 * Part 1's `EXPENSE_VOUCHERS_QUERY_KEY` directly (an in-module,
 * same-feature-folder reuse, not a cross-module reach).
 */
export function useRunDueTemplates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: RunDueDto = {}) => runDueTemplates(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EXPENSE_RECURRING_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: EXPENSE_VOUCHERS_QUERY_KEY });
    },
  });
}

export {
  parseRecurringTemplate,
  VOUCHER_METHODS,
  VOUCHER_PAYEE_TYPES,
  type ParsedRecurringTemplate,
  type RecurringResponseDto,
  type RunDueResultDto,
  type VoucherMethod,
  type VoucherPayeeType,
};
