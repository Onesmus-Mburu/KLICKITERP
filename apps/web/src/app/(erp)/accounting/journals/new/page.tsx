"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JournalEntryForm } from "@/features/accounting/components/journal-entry-form";

/**
 * Phase 6 Slice 17 Part 2 (Journals, Module 7) — the manual journal entry
 * screen, reached from the journals list's "New Journal Entry" button. A
 * dedicated page rather than a dialog — see `journal-entry-form.tsx`'s own
 * doc comment for why.
 */
export default function NewJournalPage() {
  const t = useTranslations("accounting.journals.create");

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/accounting/journals">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
      </div>
      <JournalEntryForm />
    </div>
  );
}
