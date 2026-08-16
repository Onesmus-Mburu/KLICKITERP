"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { LicenseState, LicenseStatusView } from "../api/license.api";

/**
 * The real 6-value `license.license.state` enum. `ACTIVE` is unambiguously
 * "good" (soft-success); `SUSPENDED`/`DEACTIVATED`/`EXPIRED` are
 * unambiguously "bad" (soft-destructive, matching `LoanStatusBadge`'s own
 * `WRITTEN_OFF` -> soft-destructive convention in Payroll); `GRACE` is a
 * warning, not yet a hard failure; `PROVISIONED` is a neutral pre-activation
 * state, not yet good or bad — matches this codebase's own established
 * soft-badge status-tone vocabulary, no new colors invented.
 */
const STATE_BADGE_VARIANT: Record<LicenseState, "soft-success" | "soft-warning" | "soft-primary" | "soft-destructive"> = {
  ACTIVE: "soft-success",
  GRACE: "soft-warning",
  PROVISIONED: "soft-primary",
  SUSPENDED: "soft-destructive",
  DEACTIVATED: "soft-destructive",
  EXPIRED: "soft-destructive",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

/**
 * `plan`/`features` are NOT constrained by any enum/catalogue anywhere in the
 * backend (`plan` a free-form `varchar(30)`, `features` a free-form `jsonb`
 * string array, confirmed by reading the entity directly) — displayed here
 * as opaque real data, never validated/formatted against a fixed set that
 * doesn't exist server-side.
 */
export function LicenseStatusCard({ status }: { status: LicenseStatusView }) {
  const t = useTranslations("license.status");

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base text-foreground">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </div>
        <Badge variant={STATE_BADGE_VARIANT[status.state]} className="text-sm">
          {t(`states.${status.state}`)}
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t("planLabel")}</p>
          <p className="text-sm font-medium text-foreground">{status.plan}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t("validFromLabel")}</p>
          <p className="text-sm font-medium text-foreground">{formatDate(status.validFrom)}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t("validToLabel")}</p>
          <p className="text-sm font-medium text-foreground">{formatDate(status.validTo)}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t("graceDaysLabel")}</p>
          <p className="text-sm font-medium text-foreground">{t("graceDaysValue", { days: status.graceDays })}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t("verifiedAtLabel")}</p>
          <p className="text-sm font-medium text-foreground">{status.verifiedAt ? formatDateTime(status.verifiedAt) : t("neverVerified")}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t("stateChangedAtLabel")}</p>
          <p className="text-sm font-medium text-foreground">{formatDateTime(status.stateChangedAt)}</p>
        </div>
        <div className="space-y-1 sm:col-span-2 lg:col-span-3">
          <p className="text-xs text-muted-foreground">{t("featuresLabel")}</p>
          {status.features.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noFeatures")}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {status.features.map((feature) => (
                <Badge key={feature} variant="secondary">
                  {feature}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
