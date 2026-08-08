import { NextRequest, NextResponse } from "next/server";
import { REFRESH_COOKIE_NAME, refreshCookieOptions } from "@/lib/auth-cookie";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api/v1";

/**
 * Reads the httpOnly refresh cookie server-side (never exposed to client
 * JS), calls the REAL backend `POST /auth/refresh` (`AuthService.refresh` —
 * rotates the token, revokes the old one, detects reuse), rotates this
 * cookie to the new refresh token, and returns ONLY the new access token +
 * user to the browser. Called on app boot (silent session restore) and by
 * `lib/api-client.ts`'s auth middleware on a 401.
 */
export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value;
  if (!refreshToken) {
    return NextResponse.json({ error: "No session" }, { status: 401 });
  }

  const backendResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
  });

  if (!backendResponse.ok) {
    const response = NextResponse.json({ error: "Session expired" }, { status: 401 });
    response.cookies.delete({ name: REFRESH_COOKIE_NAME, path: "/api/auth" });
    return response;
  }

  const outcome = (await backendResponse.json()) as {
    accessToken: string;
    refreshToken: string;
    user: unknown;
    mustChangePassword?: boolean;
  };

  const response = NextResponse.json({
    accessToken: outcome.accessToken,
    user: outcome.user,
    mustChangePassword: outcome.mustChangePassword ?? false,
  });
  response.cookies.set(REFRESH_COOKIE_NAME, outcome.refreshToken, refreshCookieOptions());
  return response;
}
