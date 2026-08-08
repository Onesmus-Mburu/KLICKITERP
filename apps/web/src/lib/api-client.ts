"use client";

import { createApiClient, type Middleware } from "@klickit/contracts";
import { useAuthStore } from "./auth-store";
import { refreshSession } from "./session-api";

// The generated `paths` type embeds "/api/v1" in every key already (see
// .env.local's own doc comment for why) — this client's `baseUrl` is
// therefore the bare origin, NOT NEXT_PUBLIC_API_BASE_URL.
//
// Deliberately NOT a hardcoded "http://localhost:3000" fallback: this file
// is genuinely browser-executed (unlike lib/theme-server.ts/lib/document-
// verification-server.ts and the app/api/auth/* route handlers, which run
// server-side in the SAME Next.js Node process as a plain fetch — always on
// the same machine as apps/api regardless of how the browser reached the
// page, so a "localhost" fallback is correct for THOSE). This client makes
// requests FROM the browser, so when someone reaches apps/web via a LAN IP
// (e.g. http://192.168.1.50:3002 from another device) instead of localhost,
// a hardcoded "localhost:3000" fallback would send every request to port
// 3000 on THAT DEVICE, not the actual API server — surfacing as a failed
// cross-origin fetch the browser reports as a CORS error, even though the
// real problem is a wrong host, not a CORS policy (found and fixed
// 2026-08-08). Falls back to deriving the origin from wherever the page
// itself was loaded (same hostname/protocol, api's own port 3000) so login
// works identically over localhost or a LAN IP with zero config — an
// explicit NEXT_PUBLIC_API_ORIGIN still wins when set, for the real case of
// the API genuinely living on a different host.
const API_ORIGIN =
  process.env.NEXT_PUBLIC_API_ORIGIN ??
  (typeof window !== "undefined" ? `${window.location.protocol}//${window.location.hostname}:3000` : "http://localhost:3000");

/**
 * Attaches `Authorization: Bearer <accessToken>` to every request from the
 * in-memory auth store (`createApiClient` deliberately doesn't bake this
 * in — see `packages/contracts/src/client.ts`'s own doc comment: "token
 * storage/refresh is a frontend concern"). On a 401, makes ONE attempt to
 * silently refresh via the httpOnly-cookie-backed `POST /api/auth/refresh`
 * route handler and, if that succeeds, retries the original request once
 * with the new token — openapi-fetch's `onResponse` hook can return a
 * different `Response` and it becomes the final result, so this is a real
 * transparent retry, not just a token swap for the NEXT request. If refresh
 * also fails, the auth store is cleared (`session-api.ts`'s own
 * `refreshSession()` does this) and the original 401 is returned as-is —
 * `<QueryBoundary>`/route guards handle bouncing the user back to /login.
 */
const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      request.headers.set("Authorization", `Bearer ${token}`);
    }
    return request;
  },
  async onResponse({ request, response }) {
    if (response.status !== 401) {
      return response;
    }
    const refreshed = await refreshSession();
    if (!refreshed) {
      return response;
    }
    const retryRequest = request.clone();
    retryRequest.headers.set("Authorization", `Bearer ${refreshed.accessToken}`);
    return fetch(retryRequest);
  },
};

export const apiClient = createApiClient({ baseUrl: API_ORIGIN });
apiClient.use(authMiddleware);
