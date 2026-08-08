"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { XeroConfig } from "../types";

/**
 * Phase 6 Slice 11 Part 4 — controlled form for `XeroConfig`, the exact real
 * field names `XeroAdapter`'s own config interface declares (see
 * `../types.ts`'s own doc comment). `clientSecret`/`refreshToken` are masked
 * (`type="password"`) — same convention `<MpesaConfigForm>`/
 * `<QuickBooksConfigForm>` establish. Reused verbatim by BOTH
 * `<NewIntegrationDialog>` and `<EditIntegrationDialog>`'s "resubmit
 * credentials" branch.
 */
export function XeroConfigForm({ value, onChange, disabled }: { value: XeroConfig; onChange: (next: XeroConfig) => void; disabled?: boolean }) {
  const t = useTranslations("settings.integrations.xeroForm");

  function set<K extends keyof XeroConfig>(key: K, v: XeroConfig[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label required>{t("tenantId")}</Label>
        <Input value={value.tenantId} onChange={(e) => set("tenantId", e.target.value)} disabled={disabled} placeholder={t("tenantIdPlaceholder")} />
      </div>
      <div className="space-y-1.5">
        <Label required>{t("clientId")}</Label>
        <Input value={value.clientId} onChange={(e) => set("clientId", e.target.value)} disabled={disabled} placeholder={t("clientIdPlaceholder")} />
      </div>
      <div className="space-y-1.5">
        <Label required>{t("clientSecret")}</Label>
        <Input
          type="password"
          value={value.clientSecret}
          onChange={(e) => set("clientSecret", e.target.value)}
          disabled={disabled}
          placeholder={t("clientSecretPlaceholder")}
        />
      </div>
      <div className="space-y-1.5">
        <Label required>{t("refreshToken")}</Label>
        <Input
          type="password"
          value={value.refreshToken}
          onChange={(e) => set("refreshToken", e.target.value)}
          disabled={disabled}
          placeholder={t("refreshTokenPlaceholder")}
        />
      </div>
      <div className="space-y-1.5">
        <Label>{t("timeoutMs")}</Label>
        <Input
          type="number"
          min={0}
          value={value.timeoutMs ?? ""}
          onChange={(e) => set("timeoutMs", e.target.value === "" ? undefined : Number(e.target.value))}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

export const EMPTY_XERO_CONFIG: XeroConfig = {
  clientId: "",
  clientSecret: "",
  refreshToken: "",
  tenantId: "",
  timeoutMs: undefined,
};

/** `XeroConfig`'s own required fields (per `../types.ts` — the ones with no `?`) — gates the submit button before a wasted round trip. */
export function isXeroConfigComplete(value: XeroConfig): boolean {
  return Boolean(value.clientId && value.clientSecret && value.refreshToken && value.tenantId);
}
