"use client";

import * as React from "react";

/**
 * Phase 6 Slice 4 (Payments) — the first keyboard-shortcut mechanism
 * anywhere in this codebase (confirmed via grep before building: no
 * `addEventListener("keydown"` pattern existed anywhere under `apps/web/src`
 * before this pass). Generic, cross-cutting infra deliberately placed
 * alongside `use-dashboard.ts`/`use-periods.ts`/`use-auth.ts` (not
 * feature-scoped under `features/payments/`), even though its first and only
 * caller this slice is the payments capture screen — this is the actual
 * design decision this slice makes for the architecture docs' long-deferred
 * cashier keyboard map (F2/F4/F8), and any future screen that wants real
 * keyboard shortcuts should reuse this, not reinvent it.
 *
 * One `window.addEventListener("keydown", ...)` for the calling component's
 * lifetime — `bindings` is read through a ref updated on EVERY render
 * (never a `useEffect` dependency), so callers can pass a fresh inline
 * closure object every render (capturing up-to-date component state, e.g. an
 * `F8` handler that needs the latest form values) without this hook tearing
 * down and re-attaching the DOM listener on every keystroke, and without the
 * classic stale-closure bug where a handler captured once on mount only ever
 * sees that first render's state.
 *
 * Matches on `event.key` — function keys report the literal string values
 * `"F2"`/`"F4"`/`"F8"` in every evergreen browser (verified live against a
 * real running Chromium instance — see docs/phase-6/PROGRESS.md's Slice 4
 * entry; none of F2/F4/F8 are reserved by Chrome/Firefox's own default
 * keybindings the way e.g. F6/F11 are). Calls `event.preventDefault()`
 * BEFORE invoking the bound handler, for every matched key.
 */
export function useHotkeys(bindings: Record<string, (event: KeyboardEvent) => void>, enabled = true): void {
  const bindingsRef = React.useRef(bindings);
  bindingsRef.current = bindings;

  React.useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      const handler = bindingsRef.current[event.key];
      if (!handler) return;
      event.preventDefault();
      handler(event);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
