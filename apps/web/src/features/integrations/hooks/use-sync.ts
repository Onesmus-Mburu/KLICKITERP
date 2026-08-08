"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { listSyncLog, testAccountingSyncConnection, type AccountingSyncKind, type ListSyncLogParams } from "../api/sync.api";

export const SYNC_LOG_QUERY_KEY = ["integrations", "sync-log"] as const;

export function useSyncLog(params: ListSyncLogParams) {
  return useQuery({ queryKey: [...SYNC_LOG_QUERY_KEY, params], queryFn: () => listSyncLog(params) });
}

/** The REAL accounting-sync connection test (`POST /integrations/sync/test-connection`) — see `../api/sync.api.ts`'s own doc comment for why this is genuinely distinct from Module 2's own permanent stub. */
export function useTestAccountingSyncConnection() {
  return useMutation({ mutationFn: (kind: AccountingSyncKind) => testAccountingSyncConnection(kind) });
}
