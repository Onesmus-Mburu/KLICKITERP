"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createIntegrationConfig,
  getIntegrationConfig,
  listIntegrationConfigs,
  testIntegrationConfigConnection,
  updateIntegrationConfig,
  type CreateIntegrationConfigInput,
  type UpdateIntegrationConfigInput,
} from "../api/integration-configs.api";

export const INTEGRATION_CONFIGS_QUERY_KEY = ["settings", "integration-configs"] as const;

function listKey() {
  return [...INTEGRATION_CONFIGS_QUERY_KEY, "list"] as const;
}
function detailKey(id: string | undefined) {
  return [...INTEGRATION_CONFIGS_QUERY_KEY, "detail", id] as const;
}

export function useIntegrationConfigs() {
  return useQuery({ queryKey: listKey(), queryFn: listIntegrationConfigs });
}

export function useIntegrationConfig(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getIntegrationConfig(id as string), enabled: !!id });
}

export function useCreateIntegrationConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateIntegrationConfigInput) => createIntegrationConfig(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey() });
    },
  });
}

export function useUpdateIntegrationConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateIntegrationConfigInput }) => updateIntegrationConfig(id, input),
    onSuccess: (config) => {
      queryClient.invalidateQueries({ queryKey: listKey() });
      queryClient.invalidateQueries({ queryKey: detailKey(config.id) });
    },
  });
}

/**
 * `lastTestedAt`/`lastTestOk` change as a side effect of a successful call —
 * invalidate both the list (the DataTable's own badge columns) and this
 * row's detail. `MpesaAdapterResolverService` (`domains/payments`) is a
 * SEPARATE, server-side, per-request resolution (its own `list()` call
 * against the live DB, re-run fresh on every M-Pesa initiate — see that
 * service's own doc comment) — this invalidation only concerns THIS app's
 * own TanStack Query cache, it has no bearing on the resolver's behavior.
 */
export function useTestIntegrationConfigConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => testIntegrationConfigConnection(id),
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries({ queryKey: listKey() });
      queryClient.invalidateQueries({ queryKey: detailKey(id) });
    },
  });
}
