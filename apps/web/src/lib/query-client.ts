import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api-error";

/**
 * Shared TanStack Query defaults. `retry` explicitly does NOT retry a 403
 * (permission-denied — retrying won't change the server's RBAC decision) or
 * a 401 (handled by `lib/api-client.ts`'s own single refresh-and-retry, not
 * TanStack Query retrying the same stale request) — every other error gets
 * up to 2 retries, the conventional default.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && (error.status === 403 || error.status === 401)) {
            return false;
          }
          return failureCount < 2;
        },
      },
    },
  });
}
