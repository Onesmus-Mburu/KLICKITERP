import { NextRequest, NextResponse } from "next/server";
import { REFRESH_COOKIE_NAME, refreshCookieOptions } from "@/lib/auth-cookie";

/**
 * FLAGGED DECISION #2 (docs/phase-6/PROGRESS.md): `AuthService.login`/`.verify`
 * never set a cookie themselves — the whole `LoginOutcome` (access + refresh
 * token) comes back as plain JSON. Storing the refresh token in
 * localStorage/sessionStorage was ruled out for an ERP handling
 * payroll/financial data, so this Route Handler closes that gap on
 * apps/web's own side: called immediately after a successful
 * `POST /auth/login` (stage "complete") or `POST /auth/2fa/verify`, it
 * takes the refresh token OUT of client-reachable JS entirely and re-homes
 * it as an httpOnly, SameSite=Lax cookie — the access token is handed back
 * in the JSON response for the client to hold in memory only (never
 * persisted, per docs/phase-6/PROGRESS.md's session-storage decision).
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { accessToken?: string; refreshToken?: string; user?: unknown; mustChangePassword?: boolean };

  if (!body.accessToken || !body.refreshToken) {
    return NextResponse.json({ error: "accessToken and refreshToken are required" }, { status: 400 });
  }

  const response = NextResponse.json({
    accessToken: body.accessToken,
    user: body.user ?? null,
    mustChangePassword: body.mustChangePassword ?? false,
  });
  response.cookies.set(REFRESH_COOKIE_NAME, body.refreshToken, refreshCookieOptions());
  return response;
}
