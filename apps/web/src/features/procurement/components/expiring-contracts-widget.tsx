"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useContractsExpiringSoon } from "../hooks/use-contracts";

/**
 * Phase 6 Slice 18 Part 5 (Procurement, Module 12) — `GET
 * .../contracts/expiring-soon`, called with NO `withinDays` — the
 * per-contract-default behavior (each row's own `renewalAlertDays` applies,
 * per `ContractsService.listExpiringSoon()`'s own doc comment), the more
 * useful default for a dashboard-style widget like this one per the plan's
 * own explicit instruction, rather than forcing every contract onto one
 * uniform threshold regardless of its own configured alert window. Sits at
 * the top of `contracts/page.tsx`, above the filterable list.
 */
export function ExpiringContractsWidget() {
  const t = useTranslations("procurement.contracts.expiringSoonWidget");
  const query = useContractsExpiringSoon();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-foreground">
          <AlertTriangle className="size-4 text-warning" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <QueryBoundary query={query} isEmpty={(d) => d.length === 0}>
          {(contracts) =>
            contracts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noneHint")}</p>
            ) : (
              <ul className="space-y-2">
                {contracts.map((contract) => (
                  <li key={contract.id}>
                    <Link
                      href={`/procurement/contracts/${contract.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-muted"
                    >
                      <span className="font-medium text-foreground">{contract.title}</span>
                      <span className="text-muted-foreground">{t("endsOnHint", { date: contract.endsOn })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )
          }
        </QueryBoundary>
      </CardContent>
    </Card>
  );
}
