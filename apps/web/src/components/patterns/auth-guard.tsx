"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The one genuinely session-aware client island wrapping the whole `(erp)`
 * segment's `{children}`: redirects to `/login` once `useAuthStore`
 * resolves to `"unauthenticated"` (i.e. `app/providers.tsx`'s silent
 * `POST /api/auth/refresh` bootstrap attempt finished and found no valid
 * session). While `"checking"`, renders a brief skeleton rather than
 * flashing protected content or bouncing to /login prematurely on a hard
 * reload that would have otherwise succeeded via the refresh cookie.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const router = useRouter();

  React.useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return <>{children}</>;
}
