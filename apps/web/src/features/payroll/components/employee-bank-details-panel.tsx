"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { useEmployeeDecrypted } from "../hooks/use-employees";

/** Renders an opaque `unknown` bank/pay field (a plain string in every real case this app ever writes, since the create/edit forms only ever send plain strings — see `employees.api.ts`'s own doc comment — but genuinely `unknown` server-side) as readable text, never assumed to be a specific shape. */
function renderOpaqueValue(value: unknown, emptyLabel: string): string {
  if (value === null || value === undefined) return emptyLabel;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/**
 * Phase 6 Slice 22 Part 1 (Payroll foundations, Module 15) — the ONE place in
 * this app that can ever show real plaintext `payDetails`/`bankName`/
 * `branch`/`account` (`GET /payroll/employees/{id}/decrypted`,
 * `payroll:employee:manage`-gated — NOT `:view`, a stricter permission than
 * the plain detail read, FR-PYRL-012.1's own access-control split). Every
 * other read of these 4 fields anywhere in this app (the list, the plain
 * detail fetch, the edit dialog) only ever sees the redacted `"***"`/`null`
 * placeholder.
 *
 * **Also shows `nationalId`/`kraPin` here, for a single consolidated
 * "sensitive details" view — this is now the ONLY place either is ever
 * shown as real plaintext**, since migration `0240` closed a real gap: both
 * used to be plain, unmasked `varchar` (contradicting this part's own
 * original task brief, which claimed they were already "ENCRYPTED at
 * rest") — `EmployeesService.redact()` now touches all 6 fields the same
 * way, and the main detail card (`app/(erp)/payroll/employees/[id]/page.tsx`)
 * no longer shows `nationalId`/`kraPin` at all, since they'd just be a
 * redundant `"***"` there.
 *
 * **Deliberately NOT auto-fetched on page mount** — `useEmployeeDecrypted()`
 * defaults `enabled: false`; this component only fires the real request the
 * moment the user explicitly clicks "View bank & ID details" below, and can
 * be collapsed again afterward (re-expanding re-fetches fresh rather than
 * caching the plaintext indefinitely client-side, a deliberate minimal-
 * exposure choice for genuinely sensitive data, even though TanStack Query's
 * own cache would technically keep it around either way for this
 * session — collapsing at least removes it from the visible DOM).
 */
export function EmployeeBankDetailsPanel({ employeeId }: { employeeId: string }) {
  const t = useTranslations("payroll.employees.bankDetailsPanel");
  const [revealed, setRevealed] = React.useState(false);
  const decryptedQuery = useEmployeeDecrypted(employeeId, { enabled: revealed });

  if (!revealed) {
    return (
      <Button type="button" variant="outline" onClick={() => setRevealed(true)}>
        <Eye className="size-4" />
        {t("revealTrigger")}
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
        <Button type="button" variant="ghost" size="sm" onClick={() => setRevealed(false)}>
          <EyeOff className="size-4" />
          {t("hideButton")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="warning">
          <AlertDescription>{t("sensitiveWarning")}</AlertDescription>
        </Alert>
        <QueryBoundary query={decryptedQuery}>
          {(employee) => (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("nationalIdLabel")}</p>
                <p className="text-sm text-foreground">{employee.nationalId}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("kraPinLabel")}</p>
                <p className="text-sm text-foreground">{employee.kraPin}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("bankNameLabel")}</p>
                <p className="text-sm text-foreground">{renderOpaqueValue(employee.bankName, t("notSet"))}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("branchLabel")}</p>
                <p className="text-sm text-foreground">{renderOpaqueValue(employee.branch, t("notSet"))}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("accountLabel")}</p>
                <p className="text-sm text-foreground">{renderOpaqueValue(employee.account, t("notSet"))}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("payDetailsLabel")}</p>
                <p className="text-sm text-foreground">{renderOpaqueValue(employee.payDetails, t("notSet"))}</p>
              </div>
            </div>
          )}
        </QueryBoundary>
      </CardContent>
    </Card>
  );
}
