"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateFaDisposalDto, DecideFaDisposalDto, FaDisposalResponseDto } from "@klickit/contracts";
import {
  createDisposal,
  decideDisposal,
  getDisposal,
  listDisposals,
  postDisposal,
  submitDisposal,
  type ListFaDisposalsParams,
} from "../api/disposals.api";
import { FIXED_ASSETS_ASSETS_QUERY_KEY } from "./use-assets";

/**
 * Phase 6 Slice 23 Part 4 (Fixed Assets, Module 17) — `["fixed-assets",
 * "disposals"]` query-key root, the same "one shared feature root,
 * namespaced query keys per sub-domain" shape `use-categories.ts`/
 * `use-assets.ts`/`use-depreciation-runs.ts` already establish.
 */
export const FIXED_ASSETS_DISPOSALS_QUERY_KEY = ["fixed-assets", "disposals"] as const;

function listKey(params: ListFaDisposalsParams) {
  return [...FIXED_ASSETS_DISPOSALS_QUERY_KEY, "list", params] as const;
}

function detailKey(id: string | undefined) {
  return [...FIXED_ASSETS_DISPOSALS_QUERY_KEY, "detail", id] as const;
}

/** `fixed-assets:disposal:create`-gated (shared with create/findOne/submit — see `disposals.api.ts`'s own doc comment). */
export function useDisposals(params: ListFaDisposalsParams = {}) {
  return useQuery({ queryKey: listKey(params), queryFn: () => listDisposals(params) });
}

export function useDisposal(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getDisposal(id as string), enabled: !!id });
}

/** Every lifecycle mutation invalidates the disposal list AND this disposal's own detail — a status transition always changes `status`/`approvalRef`/`journalId`, the same discipline `use-depreciation-runs.ts`'s own `invalidateRunQueries()` already establishes. */
function invalidateDisposalQueries(queryClient: ReturnType<typeof useQueryClient>, disposal: FaDisposalResponseDto) {
  queryClient.invalidateQueries({ queryKey: FIXED_ASSETS_DISPOSALS_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: detailKey(disposal.id) });
}

export function useCreateDisposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateFaDisposalDto) => createDisposal(dto),
    onSuccess: (created) => invalidateDisposalQueries(queryClient, created),
  });
}

export function useSubmitDisposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => submitDisposal(id),
    onSuccess: (updated) => invalidateDisposalQueries(queryClient, updated),
  });
}

export function useDecideDisposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: DecideFaDisposalDto }) => decideDisposal(id, dto),
    onSuccess: (updated) => invalidateDisposalQueries(queryClient, updated),
  });
}

/**
 * `post()` genuinely mutates the disposed asset's own `status` (to
 * `DISPOSED`, unconditionally — see `disposals.api.ts`'s own doc comment) as
 * a side effect — this is the ONE mutation in this file that also
 * invalidates `FIXED_ASSETS_ASSETS_QUERY_KEY` (Part 1's own asset list/
 * detail queries), the same "a write here changes another feature's own
 * cached data" pattern `use-transfers.ts`/`use-maintenance.ts`/
 * `use-depreciation-runs.ts`'s own `usePostDepreciationRun()` already
 * established.
 */
export function usePostDisposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postDisposal(id),
    onSuccess: (updated) => {
      invalidateDisposalQueries(queryClient, updated);
      queryClient.invalidateQueries({ queryKey: FIXED_ASSETS_ASSETS_QUERY_KEY });
    },
  });
}

export type { FaDisposalResponseDto };
