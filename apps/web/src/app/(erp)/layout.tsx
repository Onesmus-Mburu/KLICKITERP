import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { AuthGuard } from "@/components/patterns/auth-guard";

/**
 * Staff app shell (docs/phase-6/PROGRESS.md scope item 7). Server component
 * for the static grid/chrome; `<AuthGuard>` is the one client island that
 * actually needs the in-memory session store (real redirect-if-unauthenticated
 * behavior — see its own doc comment). `<Sidebar>`/`<Topbar>` are
 * themselves server components with their own further-nested client
 * islands (nav-link gating, user menu, theme toggle).
 *
 * Slice 1.5c (creative sidebar shape): outer container `min-h-screen` ->
 * `h-screen overflow-hidden`. `<Sidebar>` is now a floating, inset,
 * rounded/shadowed panel (its own file's doc comment) rather than a flush
 * full-height block — for it to genuinely read as "floating" for the whole
 * page (not just a tall rounded rectangle that scrolls away with long
 * content), the right column now owns its OWN internal scroll instead of
 * the previous "whole document scrolls together" behavior: the outer row
 * is pinned to exactly one viewport height, `<Topbar>` stays fixed at the
 * top of the right column, and `<main>` (which already declared
 * `overflow-y-auto` before this change — effectively inert until now,
 * since nothing constrained the row's height) becomes the actual
 * scrolling region. `<Sidebar>`'s own height comes from the row's default
 * `align-items: stretch` (no extra height utility needed), so it always
 * spans the full column height minus its own margin, matching the
 * floating-panel look for the page's entire length.
 */
export default function ErpLayout({ children }: { children: React.ReactNode }) {
  return (
    // Phase 6 Slice 3b: `print:h-auto print:overflow-visible` on both the outer row and `<main>`
    // — the on-screen shell deliberately pins itself to exactly one viewport height with its own
    // internal scroll (this file's own doc comment above), which would otherwise CLIP a printed
    // page to whatever fit on screen at print time instead of flowing the full document. `<Sidebar>`/
    // `<Topbar>` are `print:hidden` (their own files), so only `<main>`'s content prints at all.
    <div className="flex h-screen overflow-hidden bg-background print:h-auto print:overflow-visible">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden print:overflow-visible">
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-background p-6 print:overflow-visible print:p-0">
          <AuthGuard>{children}</AuthGuard>
        </main>
      </div>
    </div>
  );
}
