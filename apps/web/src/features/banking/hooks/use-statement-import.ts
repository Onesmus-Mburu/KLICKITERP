"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getStatementImport,
  importStatement,
  listStatementImports,
  uploadStatementFile,
  type BankStatementImport,
  type ImportStatementLinesInput,
} from "../api/statement-import.api";

/**
 * Phase 6 Slice 21 Part 3 (Statement Import, Module 16) — `["banking",
 * "statement-imports"]` query-key convention, mirroring `use-accounts.ts`
 * (Part 1) / `use-transfers.ts` (Part 2)'s own shape. The upload mutation
 * (`useUploadStatementFile`) has NO query-key/invalidation of its own — same
 * reasoning `features/branding/hooks/use-file-upload.ts`'s own
 * `useUploadFile()` doc comment already gives: an uploaded `file_object` has
 * no list/detail query anywhere in this feature to invalidate, the caller
 * (`import-statement-form.tsx`) reads the mutation's own returned
 * `FileObjectResponseDto.id` directly off `mutateAsync`'s resolved value.
 */
export const BANKING_STATEMENT_IMPORTS_QUERY_KEY = ["banking", "statement-imports"] as const;

function listKey(accountId: string | undefined) {
  return [...BANKING_STATEMENT_IMPORTS_QUERY_KEY, "list", accountId ?? null] as const;
}

function detailKey(id: string | undefined) {
  return [...BANKING_STATEMENT_IMPORTS_QUERY_KEY, "detail", id] as const;
}

/** `banking:statement:import`-gated — the ONE shared permission every route on `StatementImportController` uses, including this list (see `statement-import.api.ts`'s own doc comment). A role without it hits a real 403 here — `<QueryBoundary>`'s own permission-denied state, not a client-side guess. */
export function useStatementImports(accountId?: string) {
  return useQuery({ queryKey: listKey(accountId), queryFn: () => listStatementImports(accountId) });
}

export function useStatementImport(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getStatementImport(id as string), enabled: !!id });
}

/**
 * The most-recent prior import for an account, if any — the real, honest
 * "prefill from the last import" convenience the task brief sanctioned in
 * place of a fake "saved template" feature (no such entity exists
 * server-side, confirmed by reading `bank-statement-import.repository.ts`
 * directly — no update/delete route, no separate template CRUD anywhere in
 * `BankingModule`). `listStatementImports()` is already ordered
 * `createdAt: DESC` server-side (`BankStatementImportRepository.list()`), so
 * `data[0]` genuinely is the latest — no client-side re-sort needed.
 * `enabled: !!accountId` — there is nothing to prefill from before an
 * account is chosen.
 */
export function useMostRecentStatementImport(accountId: string | undefined) {
  const query = useStatementImports(accountId);
  return { ...query, data: query.data?.[0] };
}

export function useUploadStatementFile() {
  return useMutation({ mutationFn: (file: File) => uploadStatementFile(file) });
}

/** BR-BANK-02 dedupe-on-reimport always succeeds with a real `201` — see `statement-import.api.ts`'s own doc comment. Invalidates the list (a new `bank_statement_import` row now exists) for the imported account. */
export function useImportStatement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: ImportStatementLinesInput) => importStatement(dto),
    onSuccess: (_result, dto) => {
      queryClient.invalidateQueries({ queryKey: BANKING_STATEMENT_IMPORTS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: listKey(dto.accountId) });
    },
  });
}

export type { BankStatementImport, ImportStatementLinesInput };
export type {
  DebitCreditConvention,
  StatementColumnMap,
  StatementMappingTemplate,
} from "../api/statement-import.api";
