"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateFaVerificationDto,
  DecideFaVerificationDto,
  FaVerificationResponseDto,
  RecordVerificationCountsDto,
} from "@klickit/contracts";
import {
  createVerification,
  decideVerification,
  getVerification,
  listVerificationLines,
  listVerifications,
  postVerification,
  recordVerificationCounts,
  submitVerification,
  type ListFaVerificationsParams,
} from "../api/verifications.api";
import { FIXED_ASSETS_ASSETS_QUERY_KEY } from "./use-assets";

/**
 * Phase 6 Slice 23 Part 5 (Fixed Assets, Module 17) — `["fixed-assets",
 * "verifications"]` query-key root, the same "one shared feature root,
 * namespaced query keys per sub-domain" shape `use-disposals.ts`/
 * `use-depreciation-runs.ts` already establish.
 */
export const FIXED_ASSETS_VERIFICATIONS_QUERY_KEY = ["fixed-assets", "verifications"] as const;

function listKey(params: ListFaVerificationsParams) {
  return [...FIXED_ASSETS_VERIFICATIONS_QUERY_KEY, "list", params] as const;
}

function detailKey(id: string | undefined) {
  return [...FIXED_ASSETS_VERIFICATIONS_QUERY_KEY, "detail", id] as const;
}

function linesKey(id: string | undefined) {
  return [...FIXED_ASSETS_VERIFICATIONS_QUERY_KEY, "lines", id] as const;
}

/** `fixed-assets:verification:create`-gated (shared with create/findOne/listLines/submit — see `verifications.api.ts`'s own doc comment). */
export function useVerifications(params: ListFaVerificationsParams = {}) {
  return useQuery({ queryKey: listKey(params), queryFn: () => listVerifications(params) });
}

export function useVerification(id: string | undefined) {
  return useQuery({ queryKey: detailKey(id), queryFn: () => getVerification(id as string), enabled: !!id });
}

export function useVerificationLines(id: string | undefined) {
  return useQuery({ queryKey: linesKey(id), queryFn: () => listVerificationLines(id as string), enabled: !!id });
}

/** Every lifecycle mutation invalidates the session list AND this session's own detail — a status transition always changes `status`/`approvalRef`/`journalId`, the same discipline `use-disposals.ts`'s own `invalidateDisposalQueries()` already establishes. */
function invalidateVerificationQueries(queryClient: ReturnType<typeof useQueryClient>, verification: FaVerificationResponseDto) {
  queryClient.invalidateQueries({ queryKey: FIXED_ASSETS_VERIFICATIONS_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: detailKey(verification.id) });
}

export function useCreateVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateFaVerificationDto) => createVerification(dto),
    onSuccess: (created) => invalidateVerificationQueries(queryClient, created),
  });
}

/** Also invalidates this session's own `lines` query — every call fills in `found`/`condition`/`notes` for one or more lines. */
export function useRecordVerificationCounts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: RecordVerificationCountsDto }) => recordVerificationCounts(id, dto),
    onSuccess: (updated) => {
      invalidateVerificationQueries(queryClient, updated);
      queryClient.invalidateQueries({ queryKey: linesKey(updated.id) });
    },
  });
}

export function useSubmitVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => submitVerification(id),
    onSuccess: (updated) => invalidateVerificationQueries(queryClient, updated),
  });
}

export function useDecideVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: DecideFaVerificationDto }) => decideVerification(id, dto),
    onSuccess: (updated) => invalidateVerificationQueries(queryClient, updated),
  });
}

/**
 * `post()` genuinely mutates every FOUND-with-a-recorded-`condition` line's
 * own asset (`AssetsService.updateCondition()`, composed server-side in the
 * same transaction) — this is the ONE mutation in this file that also
 * invalidates `FIXED_ASSETS_ASSETS_QUERY_KEY` (Part 1's own asset list/
 * detail queries), the same "a write here changes another feature's own
 * cached data" pattern `use-disposals.ts`'s own `usePostDisposal()`/
 * `use-depreciation-runs.ts`'s own `usePostDepreciationRun()` already
 * established. Also re-invalidates `lines` — `post()` doesn't change
 * `found`/`notes` itself, but re-fetching keeps the recorder's own
 * already-fetched lines consistent with the now-`POSTED` session.
 */
export function usePostVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => postVerification(id),
    onSuccess: ({ verification }) => {
      invalidateVerificationQueries(queryClient, verification);
      queryClient.invalidateQueries({ queryKey: linesKey(verification.id) });
      queryClient.invalidateQueries({ queryKey: FIXED_ASSETS_ASSETS_QUERY_KEY });
    },
  });
}

export type { FaVerificationResponseDto };
