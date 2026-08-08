/** Shared by the 3 auth Route Handlers (`app/api/auth/{session,refresh,logout}/route.ts`) so the cookie name/options can never drift between them. */
export const REFRESH_COOKIE_NAME = "klickit_rt";

/**
 * 7 days matches `AppConfigService.refreshTokenTtlDays` (see
 * `docs/phase-5/PROGRESS.md`'s auth write-up) — kept in sync manually since
 * apps/web has no runtime access to that backend config value; if it ever
 * changes server-side, this is the one place to update.
 */
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/auth",
    maxAge: REFRESH_TOKEN_TTL_SECONDS,
  };
}
