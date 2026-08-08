"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/lib/auth-store";

/**
 * Time-of-day dashboard greeting (docs/phase-6/PROGRESS.md Slice 1.5c).
 *
 * REAL data only: the name shown is the first word of the actual
 * authenticated session's `user.fullName` (`lib/auth-store.ts` — the same
 * real field `user-menu.tsx`'s avatar/label already renders, not
 * fabricated), with an i18n fallback for the edge case of an empty/
 * whitespace-only name. Time-of-day is a REAL client-side `Date` read
 * (never a server-fixed value — a server-computed greeting would reflect
 * the SERVER's timezone/clock, not the actual logged-in staff member's own
 * local time). "This should be changing as the day progresses" (the user's
 * own words) is met with a `setInterval` that re-checks every 5 minutes —
 * plenty for a morning/afternoon/evening bucket that only changes twice a
 * day, no need for per-second precision.
 *
 * Rendered only after mount (the `mounted` guard below) rather than
 * computed inline during the first render: this is a client component, but
 * Next still server-renders it for the initial HTML response — the
 * SERVER's wall clock could land in a different hour bucket than the
 * browser's (different TZ, or execution-time skew right around an hour
 * boundary), which would throw a real hydration mismatch. Deferring to a
 * client-only effect avoids that entirely, at the cost of a briefly empty
 * greeting on first paint — a deliberate, explicit tradeoff for a
 * non-critical, decorative string, not an oversight.
 */
type GreetingBucket = "morning" | "afternoon" | "evening";

function greetingBucketForHour(hour: number): GreetingBucket {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function firstNameOf(fullName: string | undefined, fallback: string): string {
  const first = fullName?.trim().split(/\s+/).filter(Boolean)[0];
  return first && first.length > 0 ? first : fallback;
}

const RECOMPUTE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes — plenty for a twice-a-day bucket change.

export function DashboardGreeting() {
  const t = useTranslations("dashboard.greeting");
  const user = useAuthStore((s) => s.user);
  const [mounted, setMounted] = React.useState(false);
  const [bucket, setBucket] = React.useState<GreetingBucket>("morning");

  React.useEffect(() => {
    setBucket(greetingBucketForHour(new Date().getHours()));
    setMounted(true);

    const id = window.setInterval(() => {
      setBucket(greetingBucketForHour(new Date().getHours()));
    }, RECOMPUTE_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, []);

  if (!mounted) {
    // Reserve the line's height so nothing shifts once the real greeting
    // appears a tick later — no text at all, rather than a guessed one.
    return <div aria-hidden className="h-8" />;
  }

  const name = firstNameOf(user?.fullName, t("fallbackName"));

  // text-xl font-semibold: one step below the page's own `text-2xl` title
  // (dashboard/page.tsx's `<h1>`) so the two don't read as two competing
  // headlines stacked directly on top of each other, but still an existing
  // step in this app's own scale — the exact tier `(auth)` screens'
  // `CardTitle` already uses (Slice 1.5b), not an invented new size.
  return (
    <h2 className="text-xl font-semibold tracking-tight text-foreground">
      {t(bucket, { name })}
    </h2>
  );
}
