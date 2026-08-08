"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Banknote, Landmark, Plus, Smartphone, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { formatMoney } from "@/lib/money";
import { useMySession } from "@/features/payments/hooks/use-sessions";
import { useSessionReceipts } from "@/features/payments/hooks/use-receipts";
import { SessionOpenDialog } from "@/features/payments/components/session-open-dialog";
import { SessionCloseDialog } from "@/features/payments/components/session-close-dialog";
import { ReceiptsTable } from "@/features/payments/components/receipts-table";

/**
 * Phase 6 Slice 6 — quick links onward to Cheques/Suspense/M-Pesa/Bulk
 * allocation, mirroring the exact "land on the entry screen, link onward"
 * shape `billing/fee-categories`'s own page already establishes for its own
 * sibling screens (per `nav-links.tsx`'s own doc comment on that
 * precedent). None of these four areas gets its own top-level `NAV_ITEMS`
 * entry — they're sub-routes of `/payments`, which already has one; adding
 * four more nav entries for sub-features one hop from the page that already
 * hosts this quick-link row would be redundant, not more discoverable.
 */
function QuickLinksCard() {
  const t = useTranslations("payments.landing.quickLinks");
  const links = [
    { href: "/payments/cheques", label: t("cheques"), icon: Landmark },
    { href: "/payments/suspense", label: t("suspense"), icon: Banknote },
    { href: "/payments/mpesa", label: t("mpesa"), icon: Smartphone },
    { href: "/payments/bulk-allocations/new", label: t("bulkAllocations"), icon: Upload },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {links.map((link) => (
          <Button key={link.href} asChild variant="outline" size="sm">
            <Link href={link.href}>
              <link.icon className="size-4" />
              {link.label}
            </Link>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

function SessionReceiptsCard({ sessionId }: { sessionId: string }) {
  const t = useTranslations("payments.landing");
  const receiptsQuery = useSessionReceipts(sessionId);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-foreground">{t("thisSessionReceipts")}</CardTitle>
      </CardHeader>
      <CardContent>
        <QueryBoundary query={receiptsQuery} isEmpty={(d) => d.length === 0}>
          {(receipts) => <ReceiptsTable receipts={receipts} />}
        </QueryBoundary>
      </CardContent>
    </Card>
  );
}

/**
 * Payments landing page (Module 10, Phase 6 Slice 4) — session status,
 * Open/Close triggers, this session's own receipts, and a "New Receipt"
 * link into `/payments/capture`. `isEmpty={() => false}` on the session
 * `<QueryBoundary>` below is deliberate: `useMySession()`'s `null` result is
 * a real, VALID "no session open" state (see `use-sessions.ts`'s own doc
 * comment), not `<QueryBoundary>`'s generic empty state — this page renders
 * that branch itself (the "Closed" card + Open trigger) rather than letting
 * the boundary's default empty-state copy paper over it.
 */
export default function PaymentsLandingPage() {
  const t = useTranslations("payments.landing");
  const sessionQuery = useMySession();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button asChild>
          <Link href="/payments/capture">
            <Plus className="size-4" />
            {t("newReceipt")}
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("sessionCardTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryBoundary query={sessionQuery} isEmpty={() => false}>
            {(session) =>
              session ? (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <Badge variant="soft-success">{t("openStatus")}</Badge>
                    <p className="text-sm text-foreground">{t("tillLabel", { till: session.till })}</p>
                    <p className="text-sm text-muted-foreground">{t("floatLabel", { amount: formatMoney(session.floatAmount) })}</p>
                    <p className="text-xs text-muted-foreground">{t("openedAtLabel", { date: new Date(session.openedAt).toLocaleString() })}</p>
                  </div>
                  <SessionCloseDialog session={session} />
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <Badge variant="outline">{t("closedStatus")}</Badge>
                    <p className="mt-1 text-sm text-muted-foreground">{t("noSessionHint")}</p>
                  </div>
                  <SessionOpenDialog />
                </div>
              )
            }
          </QueryBoundary>
        </CardContent>
      </Card>

      <QuickLinksCard />

      {sessionQuery.data && <SessionReceiptsCard sessionId={sessionQuery.data.id} />}
    </div>
  );
}
