"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImportStatementForm } from "@/features/banking/components/import-statement-form";

/**
 * Phase 6 Slice 21 Part 3 (Statement Import, Module 16) — the multi-step
 * import wizard's own page, reached from the import-history list's "New
 * Import" button. Same "dedicated page, real header + back link, form does
 * the rest" shape `accounting/journals/new/page.tsx` (Slice 17 Part 2)
 * already establishes.
 */
export default function NewStatementImportPage() {
  const t = useTranslations("banking.statementImports.new");

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/banking/statement-imports">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
      </div>
      <ImportStatementForm />
    </div>
  );
}
