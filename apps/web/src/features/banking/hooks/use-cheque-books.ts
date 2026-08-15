"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BankChequeBookResponseDto, CreateChequeBookDto } from "@klickit/contracts";
import { createChequeBook, getChequeBook, listChequeBooks, type ListChequeBooksFilters } from "../api/cheque-books.api";
import { BANKING_CHEQUE_LEAVES_QUERY_KEY } from "./use-cheque-leaves";

/**
 * Phase 6 Slice 21 Part 5 (Banking, Module 16 — the LAST part of this slice)
 * — `["banking", "cheque-books"]` query-key convention, mirroring every
 * other sub-domain in this feature folder (`use-accounts.ts`/`use-transfers.ts`/
 * etc.). Creating a book also auto-generates its full leaf range server-side
 * (see `cheque-books.api.ts`'s own doc comment) — `useCreateChequeBook()`
 * therefore also invalidates the cheque-LEAVES query root, not just this
 * file's own, so a caller that navigates straight to the new book's detail
 * page sees its freshly-generated leaves without a stale cache.
 */
export const BANKING_CHEQUE_BOOKS_QUERY_KEY = ["banking", "cheque-books"] as const;

function listKey(filters: ListChequeBooksFilters) {
  return [...BANKING_CHEQUE_BOOKS_QUERY_KEY, "list", filters] as const;
}

function detailKey(id: string | undefined) {
  return [...BANKING_CHEQUE_BOOKS_QUERY_KEY, "detail", id] as const;
}

/** `banking:cheque-book:manage`-gated — the SAME permission also gates this list (see `cheque-books.api.ts`'s own doc comment). A role without it hits a real 403 here — `<QueryBoundary>`'s own permission-denied state, not a client-side guess. */
export function useChequeBooks(filters: ListChequeBooksFilters = {}) {
  return useQuery({ queryKey: listKey(filters), queryFn: () => listChequeBooks(filters) });
}

export function useChequeBook(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getChequeBook(id as string), enabled: !!id });
}

export function useCreateChequeBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateChequeBookDto) => createChequeBook(dto),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: BANKING_CHEQUE_BOOKS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: detailKey(created.id) });
      // The auto-generated leaf range — see this file's own doc comment.
      queryClient.invalidateQueries({ queryKey: BANKING_CHEQUE_LEAVES_QUERY_KEY });
    },
  });
}

export type { BankChequeBookResponseDto, ListChequeBooksFilters };
