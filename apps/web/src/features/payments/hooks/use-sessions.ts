"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OpenSessionDto } from "@klickit/contracts";
import { closeSession, getMySession, openSession, type CloseSessionInput } from "../api/sessions.api";

export const MY_SESSION_QUERY_KEY = ["payments", "sessions", "mine"] as const;

/**
 * `getMySession()` resolves `CashierSession | null` — `null` is a real,
 * valid "no OPEN session" result (see `../api/sessions.api.ts`'s own doc
 * comment: a genuine `200`, not a 404), so every caller renders that branch
 * itself rather than treating it as `<QueryBoundary>`'s empty/error state.
 */
export function useMySession() {
  return useQuery({ queryKey: MY_SESSION_QUERY_KEY, queryFn: getMySession });
}

export function useOpenSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: OpenSessionDto) => openSession(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MY_SESSION_QUERY_KEY });
    },
  });
}

export function useCloseSession(id: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CloseSessionInput) => closeSession(id as string, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MY_SESSION_QUERY_KEY });
      if (id) queryClient.invalidateQueries({ queryKey: ["payments", "receipts", "session", id] });
    },
  });
}
