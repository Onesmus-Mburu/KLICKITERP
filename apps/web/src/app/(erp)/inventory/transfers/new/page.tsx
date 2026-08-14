"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TransferForm } from "@/features/inventory/components/transfer-form";

/**
 * Phase 6 Slice 19 Part 2 (Stock Movements + Transfers, Module 13) — the
 * transfer-issue screen, reached from the transfers list's "New Transfer"
 * button. A dedicated page rather than a dialog — see `transfer-form.tsx`'s
 * own doc comment for why.
 */
export default function NewTransferPage() {
  const t = useTranslations("inventory.transfers.create");

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/inventory/transfers">
          <ArrowLeft className="size-4" />
          {t("backToList")}
        </Link>
      </Button>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
      </div>
      <TransferForm />
    </div>
  );
}
