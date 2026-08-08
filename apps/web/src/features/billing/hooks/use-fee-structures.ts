"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateFeeStructureDto, CreateFeeStructureLineDto, UpdateFeeStructureLineDto } from "@klickit/contracts";
import {
  addFeeStructureLine,
  createFeeStructure,
  deleteFeeStructure,
  getFeeStructure,
  listFeeStructureLines,
  listFeeStructures,
  publishFeeStructure,
  updateFeeStructureLine,
} from "../api/fee-structures.api";

export const FEE_STRUCTURES_QUERY_KEY = ["billing", "fee-structures"] as const;

function listKey(academicYearId: string | undefined, classId: string | undefined) {
  return [...FEE_STRUCTURES_QUERY_KEY, "list", academicYearId, classId] as const;
}
function detailKey(id: string | undefined) {
  return [...FEE_STRUCTURES_QUERY_KEY, "detail", id] as const;
}
function linesKey(id: string | undefined) {
  return [...FEE_STRUCTURES_QUERY_KEY, "lines", id] as const;
}

/** `GET /billing/fee-structures` requires both `academicYearId` and `classId` (Phase 6 Slice 3b — see `../api/fee-structures.api.ts`'s doc comment) — only enabled once both are chosen. */
export function useFeeStructures(academicYearId: string | undefined, classId: string | undefined) {
  return useQuery({
    queryKey: listKey(academicYearId, classId),
    queryFn: () => listFeeStructures(academicYearId as string, classId as string),
    enabled: !!academicYearId && !!classId,
  });
}

export function useFeeStructure(id: string | undefined) {
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () => getFeeStructure(id as string),
    enabled: !!id,
  });
}

export function useFeeStructureLines(id: string | undefined) {
  return useQuery({
    queryKey: linesKey(id),
    queryFn: () => listFeeStructureLines(id as string),
    enabled: !!id,
  });
}

export function useCreateFeeStructure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateFeeStructureDto) => createFeeStructure(dto),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: listKey(created.academicYearId, created.classId) });
    },
  });
}

export function useAddFeeStructureLine(structureId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateFeeStructureLineDto) => addFeeStructureLine(structureId, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: linesKey(structureId) }),
  });
}

export function useUpdateFeeStructureLine(structureId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, dto }: { lineId: string; dto: UpdateFeeStructureLineDto }) => updateFeeStructureLine(lineId, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: linesKey(structureId) }),
  });
}

/** Flips `DRAFT` -> `PUBLISHED` (BR-BILL-03) — invalidates both the detail query (status/publishedAt change) and every list query for this module, since the list is keyed by year/classId and this hook doesn't know the caller's current filter selection. */
export function usePublishFeeStructure(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => publishFeeStructure(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: detailKey(id) });
      queryClient.invalidateQueries({ queryKey: [...FEE_STRUCTURES_QUERY_KEY, "list"] });
    },
  });
}

/** Real delete (Phase 6 Slice 3b) — invalidates every list query for this module (same "list is keyed by scope, hook doesn't know the caller's current filter" reasoning as `usePublishFeeStructure`) so the deleted structure disappears from any open list immediately. A blocked (409) delete leaves the cache untouched. */
export function useDeleteFeeStructure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteFeeStructure(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...FEE_STRUCTURES_QUERY_KEY, "list"] });
    },
  });
}
