"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Lock, Unlock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-error";
import { useSetTermBillingLock } from "../hooks/use-academic-calendar";
import type { TermResponse } from "../types";

/**
 * Phase 6 Slice 11 Part 1 — the first billing-lock toggle anywhere in this
 * app (`PATCH /terms/:id/billing-lock` has existed since Slice 3b with no
 * frontend caller until now). Shows the current state as a badge and offers
 * the OPPOSITE action as a button — locking/unlocking is a genuinely
 * consequential toggle (it gates whether `seq`/`startsOn`/`endsOn` can be
 * edited at all, and will gate real billing enforcement once a future
 * module reads this flag, per `set-term.entity.ts`'s own doc comment) but
 * is itself always instantly reversible from this same control, so a
 * confirm dialog would add friction without adding real safety.
 */
export function TermBillingLockToggle({ term }: { term: TermResponse }) {
  const t = useTranslations("settings.academicCalendar");
  const mutation = useSetTermBillingLock();
  const [error, setError] = React.useState<string | null>(null);

  async function handleToggle() {
    setError(null);
    try {
      await mutation.mutateAsync({ id: term.id, dto: { locked: !term.billingLocked } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Badge variant={term.billingLocked ? "soft-warning" : "soft-secondary"}>
          {term.billingLocked ? (
            <>
              <Lock className="mr-1 size-3" />
              {t("locked")}
            </>
          ) : (
            <>
              <Unlock className="mr-1 size-3" />
              {t("unlocked")}
            </>
          )}
        </Badge>
        <Button type="button" size="sm" variant="outline" onClick={() => void handleToggle()} disabled={mutation.isPending}>
          {mutation.isPending ? t("saving") : term.billingLocked ? t("unlockBilling") : t("lockBilling")}
        </Button>
      </div>
      {error && <p className="max-w-[16rem] text-xs text-destructive">{error}</p>}
    </div>
  );
}
