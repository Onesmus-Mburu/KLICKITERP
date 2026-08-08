"use client";

import { create } from "zustand";
import type { PublicUser } from "./auth-types";

export type AuthStatus = "checking" | "authenticated" | "unauthenticated";

interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  user: PublicUser | null;
  mustChangePassword: boolean;
  setSession(input: { accessToken: string; user: PublicUser; mustChangePassword: boolean }): void;
  setMustChangePassword(value: boolean): void;
  clear(): void;
}

/**
 * In-memory-ONLY session state (flagged decision #2, docs/phase-6/PROGRESS.md):
 * the access token NEVER touches localStorage/sessionStorage — it lives
 * only in this zustand store's JS heap, lost on a hard reload by design.
 * The refresh token lives in an httpOnly cookie the browser manages
 * entirely on its own (see `app/api/auth/*` route handlers) — this store
 * never sees it at all. On a hard reload, `Providers`'s bootstrap effect
 * calls `POST /api/auth/refresh`, which reads that cookie server-side and
 * mints a fresh access token to repopulate this store, so a reload doesn't
 * force a full re-login as long as the refresh cookie is still valid.
 */
export const useAuthStore = create<AuthState>((set) => ({
  status: "checking",
  accessToken: null,
  user: null,
  mustChangePassword: false,
  setSession: ({ accessToken, user, mustChangePassword }) =>
    set({ status: "authenticated", accessToken, user, mustChangePassword }),
  setMustChangePassword: (value) => set({ mustChangePassword: value }),
  clear: () => set({ status: "unauthenticated", accessToken: null, user: null, mustChangePassword: false }),
}));
