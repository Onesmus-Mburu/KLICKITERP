"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { getSignedUrl, uploadFile } from "../api/files.api";
import { DEFAULT_SIGNED_URL_EXPIRY_SECONDS } from "../constants";

/**
 * No cache invalidation — an uploaded `file_object` has no list/detail query
 * anywhere in this app to invalidate (Module 3's own "browse all files"
 * screen was deferred, per the plan). Each `FilePicker` reads the
 * mutation's own returned `FileObjectResponseDto` directly off
 * `mutateAsync`'s resolved value.
 */
export function useUploadFile() {
  return useMutation({
    mutationFn: ({ file, entityType }: { file: File; entityType: string }) => uploadFile(file, entityType),
  });
}

/** `enabled: !!fileId` — mirrors `useUser(id)`'s own "only fetch once a real id exists" shape. Genuinely refetches per `fileId`/`expirySeconds` pair (not cached indefinitely) since a signed URL actually expires. */
export function useSignedUrl(fileId: string | null, expirySeconds: number = DEFAULT_SIGNED_URL_EXPIRY_SECONDS) {
  return useQuery({
    queryKey: ["files", "signed-url", fileId, expirySeconds] as const,
    queryFn: () => getSignedUrl(fileId as string, expirySeconds),
    enabled: !!fileId,
  });
}
