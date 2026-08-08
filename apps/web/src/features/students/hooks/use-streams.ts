"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateStreamDto, UpdateStreamDto } from "@klickit/contracts";
import { createStream, deleteStream, listStreamsForClass, updateStream } from "../api/streams.api";

function streamsQueryKey(classId: string | undefined | null) {
  return ["students", "streams", classId] as const;
}

export function useStreamsForClass(classId: string | undefined | null) {
  return useQuery({
    queryKey: streamsQueryKey(classId),
    queryFn: () => listStreamsForClass(classId as string),
    enabled: !!classId,
  });
}

/** Phase 6 Slice 2b item 6 — real create/update mutations, invalidating the exact `(classId)`-scoped query key so the Streams section (and the student form's cascading picker) sees a newly-created stream via a fresh query. */
export function useCreateStream(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateStreamDto) => createStream(dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: streamsQueryKey(classId) }),
  });
}

export function useUpdateStream(classId: string, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateStreamDto) => updateStream(id, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: streamsQueryKey(classId) }),
  });
}

/** Real delete, scoped to `classId` the same way create/update are — invalidates the exact `(classId)`-scoped query key so the deleted stream disappears from the Streams section/cascading picker immediately. */
export function useDeleteStream(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteStream(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: streamsQueryKey(classId) }),
  });
}
