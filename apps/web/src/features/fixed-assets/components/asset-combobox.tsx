"use client";

import * as React from "react";
import { Combobox } from "@/components/ui/combobox";
import { useAssets } from "../hooks/use-assets";

/**
 * Phase 6 Slice 23 Part 4 (Fixed Assets, Module 17) — a small, REUSABLE asset
 * picker wired directly to Part 1's own `useAssets()` hook. Built now because
 * this part's own create-disposal dialog needs one and none existed yet —
 * checked first, per this part's own task brief: Parts 2/3 both worked from
 * an already-known asset id passed in as a prop (a specific asset's own
 * detail page, or a run computed against every eligible asset server-side),
 * neither ever needed a fresh picker. Part 5 (Verification) is expected to
 * want the same picker for its own missing-asset write-off-linking flow, per
 * this part's own task brief — built standalone (not a private sub-component
 * of `create-disposal-dialog.tsx`) for exactly that reason.
 *
 * Labels each item `code — name` (e.g. `FA-0001 — Executive Office Desk`),
 * mirroring `category-combobox.tsx`'s own labeling precedent.
 *
 * **Defaults to `status: "ACTIVE"`** — a deliberate judgment call, not a
 * backend restriction: `CreateFaDisposalDto` itself carries no status
 * restriction at the DTO level (confirmed by reading `disposal.dto.ts`
 * directly) — only BR-FA-02's own DB trigger blocks a disposal on an asset
 * that's already `DISPOSED`/`WRITTEN_OFF`. Freshly disposing an asset that's
 * currently `UNDER_MAINTENANCE`/`TRANSFERRED` (rather than plain `ACTIVE`)
 * is an unusual enough real-world sequence that defaulting this picker to
 * `ACTIVE` only — with an explicit `status` override prop for the rare
 * exception — is the safer default; it also keeps already-`DISPOSED`/
 * `WRITTEN_OFF` assets out of the list entirely in the common case, since
 * neither of those is `ACTIVE`. Pass `status={undefined}` to list every
 * asset regardless of status (the create-disposal dialog still independently
 * guards against a somehow-already-disposed selection either way — see that
 * file's own doc comment).
 */
export function AssetCombobox({
  value,
  onChange,
  status = "ACTIVE",
  disabled,
  placeholder,
  searchPlaceholder,
  emptyText,
  loadingText,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Defaults to `"ACTIVE"` — see this file's own doc comment above. Pass `undefined` to list every asset regardless of status. */
  status?: string | undefined;
  disabled?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  loadingText?: string;
}) {
  const assetsQuery = useAssets({ status });

  const items = React.useMemo(
    () => (assetsQuery.data ?? []).map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` })),
    [assetsQuery.data],
  );

  return (
    <Combobox
      items={items}
      value={value}
      onChange={onChange}
      placeholder={assetsQuery.isLoading ? loadingText : placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyText={emptyText}
      disabled={disabled || assetsQuery.isLoading}
    />
  );
}
