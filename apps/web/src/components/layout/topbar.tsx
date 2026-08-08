import { SessionStatusWidget } from "@/features/payments/components/session-status-widget";
import { NotificationBell } from "./notification-bell";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

/**
 * Static container (server component) around 4 session-aware client
 * islands. Slice 1.5b (visual polish iteration): `px-4` -> `px-6` so the
 * topbar's horizontal padding lines up with `(erp)/layout.tsx`'s `<main>`
 * (`p-6`) directly beneath it, instead of the content edge jumping
 * sideways at the topbar/main seam.
 *
 * Phase 6 Slice 4 (Payments) — `<SessionStatusWidget>` added alongside
 * `NotificationBell`/`ThemeToggle`/`UserMenu`, per the plan's explicit
 * instruction: cashier session state matters from anywhere in the app, not
 * just the `/payments` pages, so it's a persistent topbar surface rather
 * than something only visible on the payments landing page.
 */
export function Topbar() {
  return (
    // Phase 6 Slice 3b: `print:hidden` — the shell chrome has no place in a printed fee
    // structure/receipt (see `(erp)/layout.tsx`'s matching print-overflow reset and the fee
    // structure detail page's own `@media print` treatment).
    <header className="flex h-16 items-center justify-end gap-3 border-b border-border bg-background px-6 print:hidden">
      <SessionStatusWidget />
      <NotificationBell />
      <ThemeToggle />
      <UserMenu />
    </header>
  );
}
