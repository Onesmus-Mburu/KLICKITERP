import type * as React from "react";

/**
 * Escape's job is inherently about whatever currently has focus (per the
 * plan) — a per-element `onKeyDown` handler attached individually to each
 * relevant field, deliberately NOT part of the global `useHotkeys` mechanism
 * (`hooks/use-hotkeys.ts`), which only ever matches function keys reported
 * via `event.key` regardless of focus. Clears just the one field it's
 * attached to via the caller-supplied `clear` callback.
 */
export function escapeClear(clear: () => void) {
  return (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      clear();
    }
  };
}
