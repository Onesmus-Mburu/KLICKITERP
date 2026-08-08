"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RegisterDeviceTokenDto, UnregisterDeviceTokenDto } from "@klickit/contracts";
import { listMyDeviceTokens, registerDeviceToken, unregisterDeviceToken } from "../api/device-tokens.api";

/**
 * `["comms", "device-tokens"]` — sibling to `templates.ts`'s/`optouts.ts`'s
 * own `["comms", ...]` query keys. Always the CALLER's own tokens — the
 * backend has no "list by user id" mode (self-service only, per
 * `device-tokens.api.ts`'s own doc comment), so there is only ever one real
 * cache entry under this key per signed-in session (no per-user
 * sub-keying needed, unlike `use-optouts.ts`'s own per-guardian keys).
 */
export const DEVICE_TOKENS_QUERY_KEY = ["comms", "device-tokens"] as const;

export function useMyDeviceTokens() {
  return useQuery({ queryKey: DEVICE_TOKENS_QUERY_KEY, queryFn: listMyDeviceTokens });
}

export function useRegisterDeviceToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: RegisterDeviceTokenDto) => registerDeviceToken(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DEVICE_TOKENS_QUERY_KEY }),
  });
}

/** Real unregister — keyed by the token VALUE (see `device-tokens.api.ts`'s own doc comment on why), not an id. */
export function useUnregisterDeviceToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: UnregisterDeviceTokenDto) => unregisterDeviceToken(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DEVICE_TOKENS_QUERY_KEY }),
  });
}
