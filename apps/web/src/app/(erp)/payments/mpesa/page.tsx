"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StkInitiateForm } from "@/features/payments/components/stk-initiate-form";
import { B2cInitiateForm } from "@/features/payments/components/b2c-initiate-form";

/**
 * `payments:mpesa:initiate` — STK/B2C initiate forms, real submits against
 * `MpesaController`'s two authenticated endpoints. No status-tracking screen
 * exists here (per the plan's explicit instruction — confirmed no read
 * surface exists anywhere for M-Pesa transactions): STK gets one honest
 * "check for the resulting receipt" affordance, B2C gets none, both stated
 * plainly rather than implied.
 */
export default function MpesaPage() {
  const t = useTranslations("payments.mpesa");

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/payments">
          <ArrowLeft className="size-4" />
          {t("backToPayments")}
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("stk.title")}</CardTitle>
          <CardDescription>{t("stk.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <StkInitiateForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground">{t("b2c.title")}</CardTitle>
          <CardDescription>{t("b2c.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <B2cInitiateForm />
        </CardContent>
      </Card>
    </div>
  );
}
