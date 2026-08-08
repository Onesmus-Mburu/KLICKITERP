"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * `CreateWebhookSubscriptionDto.events`/`UpdateWebhookSubscriptionDto.events`
 * are validated server-side only as `string[]` (`@ArrayMinSize(1)`,
 * `@IsString({each:true})`, confirmed by reading
 * `webhook-subscription.dto.ts` directly) — no fixed enum of real event
 * types exists anywhere in this codebase (`WebhookDeliveryService.dispatch()`
 * is a directly-callable method with no caller wired up yet, confirmed by
 * reading its own class doc comment: "NO automatic wiring exists yet from
 * this codebase's outbox events to this method"). `FR-INTG-007.1`/the SRS
 * only give illustrative examples ("payment received, invoice created").
 *
 * So this is an open-ended chip picker, not `FeeCategoryChipPicker`'s
 * fixed-option shape (`features/billing/components/fee-category-chip-picker.tsx`)
 * — selected events render as removable chips, a text input + "Add" button
 * appends any freely-typed event string, and a row of illustrative
 * suggestions (drawn from the SRS/FR-INTG-007.1 examples) offers one-click
 * adds for the common cases without limiting the field to them.
 */
const SUGGESTED_EVENT_TYPES: readonly string[] = [
  "invoice.posted",
  "payment.received",
  "receipt.reversed",
  "wallet.topup",
  "wallet.spend",
  "student.admitted",
];

export function WebhookEventsPicker({
  selected,
  onChange,
  disabled,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("settings.webhooks.eventsPicker");
  const [draft, setDraft] = React.useState("");

  function addEvent(value: string) {
    const trimmed = value.trim();
    if (!trimmed || selected.includes(trimmed)) return;
    onChange([...selected, trimmed]);
    setDraft("");
  }

  function removeEvent(value: string) {
    onChange(selected.filter((v) => v !== value));
  }

  const unselectedSuggestions = SUGGESTED_EVENT_TYPES.filter((e) => !selected.includes(e));

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((event) => (
            <span
              key={event}
              className="inline-flex items-center gap-1.5 rounded-full border border-transparent bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
            >
              {event}
              <button
                type="button"
                onClick={() => removeEvent(event)}
                disabled={disabled}
                aria-label={t("remove", { event })}
                className="rounded-full hover:bg-primary/20"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("addPlaceholder")}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addEvent(draft);
            }
          }}
        />
        <Button type="button" variant="outline" onClick={() => addEvent(draft)} disabled={disabled || !draft.trim()}>
          {t("addButton")}
        </Button>
      </div>
      {unselectedSuggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("suggestionsLabel")}</span>
          {unselectedSuggestions.map((event) => (
            <button
              key={event}
              type="button"
              onClick={() => addEvent(event)}
              disabled={disabled}
              className="rounded-full border border-dashed border-input px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
            >
              + {event}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
