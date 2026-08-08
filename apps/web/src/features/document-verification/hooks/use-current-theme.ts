"use client";

import { useQuery } from "@tanstack/react-query";
import type { CurrentThemeResponseDto } from "@klickit/contracts";

/**
 * The first CLIENT-side "get current theme" hook anywhere in this app.
 * Every existing consumer of `GET /branding/theme/current` is a SERVER
 * component calling `lib/theme-server.ts`'s `getCurrentThemeServer()`
 * directly (`app/layout.tsx`, `(auth)/layout.tsx`, `components/layout/sidebar.tsx`)
 * — that helper is `server-only` and cannot be imported from a `"use client"`
 * component. `app/api/theme/route.ts` exists specifically for this case (its
 * own doc comment says so): a thin same-origin `GET /api/theme` wrapping the
 * same public branding call, reachable via a plain relative fetch with no
 * `NEXT_PUBLIC_API_BASE_URL` knowledge needed client-side.
 *
 * First real consumer: `<PrintWatermark>` (`features/document-verification/components/print-watermark.tsx`),
 * which needs `documentConfig.watermarkText` from inside a `"use client"`
 * print view (`(erp)/payments/receipts/[id]/page.tsx`,
 * `(erp)/billing/fee-structures/[id]/page.tsx` — both already `"use client"`,
 * so the SSR-only helper was never an option there).
 *
 * `staleTime` set generously (branding rarely changes, same reasoning
 * `theme-server.ts`'s own `revalidate: 60` documents) rather than the
 * app-wide 30s default — a print view re-fetching branding on every render
 * would be wasted work for data that almost never changes mid-session.
 */
export function useCurrentTheme() {
  return useQuery({
    queryKey: ["theme", "current"] as const,
    queryFn: async (): Promise<CurrentThemeResponseDto> => {
      const res = await fetch("/api/theme");
      if (!res.ok) {
        throw new Error(`GET /api/theme -> ${res.status}`);
      }
      return (await res.json()) as CurrentThemeResponseDto;
    },
    staleTime: 5 * 60_000,
  });
}
