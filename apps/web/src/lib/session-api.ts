"use client";

import { useAuthStore } from "./auth-store";
import type { PublicUser } from "./auth-types";

interface SessionResponse {
  accessToken: string;
  user: PublicUser | null;
  mustChangePassword: boolean;
}

/** Called right after a successful `POST /auth/login` (stage "complete") or `POST /auth/2fa/verify` — see `app/api/auth/session/route.ts`. */
export async function establishSession(input: {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
  mustChangePassword: boolean;
}): Promise<void> {
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error("Failed to establish session");
  }
  const data = (await res.json()) as SessionResponse;
  useAuthStore.getState().setSession({
    accessToken: data.accessToken,
    user: data.user ?? input.user,
    mustChangePassword: data.mustChangePassword,
  });
}

let inFlightRefresh: Promise<SessionResponse | null> | null = null;

/**
 * Attempts a silent refresh via the httpOnly-cookie-backed
 * `POST /api/auth/refresh` route handler. Deduplicated across concurrent
 * callers (app-boot bootstrap + a possible simultaneous 401 from the API
 * middleware) via a shared in-flight promise, so two refreshes never race
 * each other into two token rotations.
 */
export function refreshSession(): Promise<SessionResponse | null> {
  if (!inFlightRefresh) {
    inFlightRefresh = doRefresh().finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

async function doRefresh(): Promise<SessionResponse | null> {
  try {
    const res = await fetch("/api/auth/refresh", { method: "POST" });
    if (!res.ok) {
      useAuthStore.getState().clear();
      return null;
    }
    const data = (await res.json()) as SessionResponse;
    if (!data.user) {
      useAuthStore.getState().clear();
      return null;
    }
    useAuthStore.getState().setSession({ accessToken: data.accessToken, user: data.user, mustChangePassword: data.mustChangePassword });
    return data;
  } catch {
    useAuthStore.getState().clear();
    return null;
  }
}

export async function endSession(): Promise<void> {
  const accessToken = useAuthStore.getState().accessToken;
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
    });
  } finally {
    useAuthStore.getState().clear();
  }
}
