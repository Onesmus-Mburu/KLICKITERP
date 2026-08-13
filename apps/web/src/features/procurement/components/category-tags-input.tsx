"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** `CreateSupplierDto.categories`/`UpdateSupplierDto.categories` cap at 40 array ITEMS (`@ArrayMaxSize(40)`) — no per-string length limit exists server-side (confirmed by reading `supplier.dto.ts` directly, no `@MaxLength` on the `each: true` string validator). */
const MAX_CATEGORIES = 40;

/**
 * Phase 6 Slice 18 Part 1 (Procurement, Module 12) — one small addition
 * beyond the plan's own named component list (`supplier-search-bar`/
 * `create-supplier-dialog`/`edit-supplier-dialog`/`blacklist-supplier-dialog`/
 * `supplier-ratings-panel`), the same "pulled out because both
 * create/edit dialogs need the identical behavior" reasoning
 * `delete-account-button.tsx`'s own doc comment documents for Slice 17 Part
 * 1's own one extra file. No generic key-value/tag-input primitive exists
 * anywhere in `components/ui/` (confirmed by listing that folder before
 * writing this) — this is a simple, purpose-built `string[]` editor, not an
 * over-built reusable component: type + Enter (or the Add button) appends a
 * trimmed, deduplicated tag; each tag renders as a removable `Badge`.
 */
export interface CategoryTagsInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

export function CategoryTagsInput({ value, onChange, placeholder }: CategoryTagsInputProps) {
  const t = useTranslations("procurement.suppliers.categoryTags");
  const [draft, setDraft] = React.useState("");

  function addTag() {
    const trimmed = draft.trim();
    if (!trimmed || value.includes(trimmed) || value.length >= MAX_CATEGORIES) return;
    onChange([...value, trimmed]);
    setDraft("");
  }

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={draft}
          placeholder={placeholder}
          disabled={value.length >= MAX_CATEGORIES}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={addTag} disabled={!draft.trim() || value.length >= MAX_CATEGORIES}>
          {t("addButton")}
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <Badge key={tag} variant="soft-secondary" className="gap-1 pr-1">
              {tag}
              <button type="button" onClick={() => removeTag(tag)} className="rounded-full p-0.5 hover:bg-tint-destructive hover:text-destructive">
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
