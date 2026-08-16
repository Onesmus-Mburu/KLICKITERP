"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getBackupRun,
  listBackupRuns,
  pruneBackups,
  runBackup,
  verifyRestore,
  type BackupRunKind,
  type ListBackupRunsParams,
  type VerifyRestoreTarget,
} from "../api/backups.api";

export const BACKUPS_QUERY_KEY = ["backups-ops", "backups"] as const;

function listKey(params: ListBackupRunsParams) {
  return [...BACKUPS_QUERY_KEY, "list", params] as const;
}

function detailKey(id: string) {
  return [...BACKUPS_QUERY_KEY, "detail", id] as const;
}

/** `GET /backups` — `backups:run:view`. The caller (the list page) owns filter/page state. */
export function useBackupRuns(params: ListBackupRunsParams) {
  return useQuery({ queryKey: listKey(params), queryFn: () => listBackupRuns(params) });
}

/** `GET /backups/:id` — `backups:run:view`. */
export function useBackupRun(id: string) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getBackupRun(id), enabled: !!id });
}

/**
 * `POST /backups/run` — `backups:run:create`. A REAL, heavy, slow operation
 * (genuine `pg_dump` + files-bucket mirror + AES-256-GCM encrypt +
 * multi-destination fan-out) — expect seconds-to-tens-of-seconds, not
 * instant. Always resolves to a terminal `status: 'OK'|'FAILED'` response
 * (never stuck `RUNNING`), so this mutation's own `isPending` window IS the
 * real backup duration. Invalidates the list so the fresh run appears
 * immediately.
 */
export function useRunBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (kind: BackupRunKind) => runBackup(kind),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BACKUPS_QUERY_KEY }),
  });
}

/** `POST /backups/:id/verify-restore` — `backups:restore:verify`. Invalidates this run's own detail query (the run itself is unchanged, but re-fetching keeps this feature's single source of truth the query cache, matching every other mutation in this codebase). */
export function useVerifyRestore(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (target: VerifyRestoreTarget) => verifyRestore(id, target),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: detailKey(id) }),
  });
}

/** `POST /backups/prune` — `backups:retention:prune`. No body. Real GFS retention pruning — deletes both the pruned runs' destination files/objects AND their rows, permanently. Invalidates the list so pruned runs disappear immediately. */
export function usePruneBackups() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => pruneBackups(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BACKUPS_QUERY_KEY }),
  });
}
