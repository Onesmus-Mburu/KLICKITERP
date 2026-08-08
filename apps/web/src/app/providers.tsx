"use client";

import * as React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { MotionConfig } from "framer-motion";
import { createQueryClient } from "@/lib/query-client";
import { useAuthStore } from "@/lib/auth-store";
import { refreshSession } from "@/lib/session-api";

/**
 * App-boot session bootstrap: attempts ONE silent refresh via the
 * httpOnly-cookie-backed `POST /api/auth/refresh` route handler. This is
 * what lets a hard page reload survive without forcing a full re-login —
 * the in-memory access token is gone (by design, see `auth-store.ts`), but
 * the refresh cookie the browser still holds lets a fresh one be minted.
 * Runs exactly once per app load.
 */
function AuthBootstrap({ children }: { children: React.ReactNode }) {
  // Deliberately does NOT block rendering while the silent refresh is in
  // flight — a public route (/login) must paint immediately. Protected
  // routes ((erp)/layout.tsx) read `status` themselves and show their own
  // brief loading gate only where it's actually needed.
  React.useEffect(() => {
    let cancelled = false;
    refreshSession().then((result) => {
      if (cancelled) return;
      if (!result) {
        useAuthStore.getState().clear();
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
        {/* Slice 1.5b (visual polish iteration): `reducedMotion="user"` makes
            EVERY `motion.*`/`AnimatePresence` component in the app respect
            the OS/browser `prefers-reduced-motion: reduce` setting by
            disabling transform-based animation — framer-motion's own
            `index.d.ts` doc comment confirms this behavior (see
            `lib/motion.ts`'s doc comment for the full reasoning on why this
            is required in addition to, not instead of, the existing
            CSS-only reduced-motion block in `app/globals.css`). */}
        <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: "easeOut" }}>
          <AuthBootstrap>{children}</AuthBootstrap>
        </MotionConfig>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
