"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Phase 6 Slice 3b follow-up — a reusable searchable-select primitive.
 * Hand-written in this file's own established shape (see `dropdown-menu.tsx`'s
 * doc comment for why every `components/ui/*` primitive here is authored by
 * hand rather than via `pnpm dlx shadcn@latest add`, and `select.tsx`'s
 * `MultiSelect` for the precedent this follows most directly: a single
 * value/onChange-props component built directly on a Radix primitive rather
 * than a Trigger/Content/Item composition, since a combobox's usage shape — a
 * flat option list + one selected value + a search query — doesn't benefit
 * from sub-part composition the way `<Select>` does).
 *
 * Built on `@radix-ui/react-popover` (added this pass — Radix's own `Select`
 * primitive genuinely cannot host an arbitrary `<input>` inside its content
 * in a way that supports real substring filtering; `Select.Content` only
 * offers basic single-key-jump typeahead, confirmed by reading Radix's docs
 * before reaching for a different primitive). Version pinned to `^1.1.23`,
 * matching `@radix-ui/react-dialog`'s already-installed version exactly (same
 * release, same peer-dependency range covering React 19) — checked via
 * `npm view @radix-ui/react-popover peerDependencies`/`version` before adding
 * it, per this codebase's established new-dependency discipline.
 *
 * Deliberately generic: `items`/`value`/`onChange`/`placeholder`/
 * `searchPlaceholder` only, zero fee-category (or any other domain) logic
 * baked in, so it's reusable for the GL account picker, guardian search, etc.
 * without modification — same "pure infrastructure" spirit as
 * `dropdown-menu.tsx`/`select.tsx` themselves.
 *
 * Filtering is a plain client-side case-insensitive substring match over
 * `label` (no fuzzy/ranked matching) — sufficient for the list sizes this
 * app's pickers deal with (fee categories, GL accounts), and keeps the
 * primitive simple per the plan's own instruction. The full unfiltered list
 * stays reachable by clearing the search box, and is independently
 * scrollable (`max-h-64 overflow-y-auto`) — both "type to filter" and "clear
 * and scroll to browse" are real, supported paths, not just the former.
 */
export interface ComboboxItem {
  value: string;
  label: string;
}

export function Combobox({
  items,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText = "No results found.",
  disabled,
  className,
}: {
  items: ComboboxItem[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [highlighted, setHighlighted] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const itemRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map());

  const selectedLabel = React.useMemo(() => items.find((item) => item.value === value)?.label, [items, value]);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => item.label.toLowerCase().includes(needle));
  }, [items, query]);

  // Re-clamp the highlighted row whenever the filtered set changes (typing
  // narrows the list out from under whatever index was highlighted before).
  React.useEffect(() => {
    setHighlighted(0);
  }, [query]);

  React.useEffect(() => {
    if (!open) return;
    const item = filtered[highlighted];
    if (item) itemRefs.current.get(item.value)?.scrollIntoView({ block: "nearest" });
  }, [highlighted, filtered, open]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setQuery("");
      setHighlighted(0);
      // Radix mounts `Popover.Content` after this tick — focus the search
      // input once it exists so typing works immediately on open, matching
      // the "type to search" half of the requirement.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function handleSelect(item: ComboboxItem) {
    onChange(item.value);
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = filtered[highlighted];
      if (item) handleSelect(item);
    }
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger asChild disabled={disabled}>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            !selectedLabel && "text-muted-foreground",
            className,
          )}
        >
          <span className="line-clamp-1 text-left">{selectedLabel ?? placeholder ?? ""}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className={cn(
            "z-50 min-w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-md",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        >
          <div className="flex items-center gap-2 border-b border-border px-2">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={searchPlaceholder}
              className="flex h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">{emptyText}</div>
            ) : (
              filtered.map((item, index) => (
                <button
                  key={item.value}
                  ref={(el) => {
                    if (el) itemRefs.current.set(item.value, el);
                    else itemRefs.current.delete(item.value);
                  }}
                  type="button"
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setHighlighted(index)}
                  className={cn(
                    "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-left text-sm outline-none",
                    index === highlighted && "bg-muted",
                  )}
                >
                  <span className="absolute left-2 flex size-3.5 items-center justify-center">
                    {item.value === value && <Check className="size-4" />}
                  </span>
                  {item.label}
                </button>
              ))
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
