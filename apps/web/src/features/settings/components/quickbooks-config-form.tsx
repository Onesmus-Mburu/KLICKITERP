"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { QuickBooksConfig } from "../types";

/**
 * Phase 6 Slice 11 Part 4 — controlled form for `QuickBooksConfig`, the
 * exact real field names `QuickBooksAdapter`'s own config interface declares
 * (see `../types.ts`'s own doc comment). `clientSecret`/`refreshToken` are
 * masked (`type="password"`) — the same convention `<MpesaConfigForm>`
 * establishes for `consumerSecret`/`passkey`. Reused verbatim by BOTH
 * `<NewIntegrationDialog>` and `<EditIntegrationDialog>`'s "resubmit
 * credentials" branch, for the identical "configEnc is never readable back"
 * reason `<MpesaConfigForm>`'s own doc comment documents.
 */
export function QuickBooksConfigForm({
  value,
  onChange,
  disabled,
}: {
  value: QuickBooksConfig;
  onChange: (next: QuickBooksConfig) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("settings.integrations.quickbooksForm");

  function set<K extends keyof QuickBooksConfig>(key: K, v: QuickBooksConfig[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label required>{t("environment")}</Label>
        <Select value={value.environment} onValueChange={(v) => set("environment", v as QuickBooksConfig["environment"])} disabled={disabled}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sandbox">{t("environmentSandbox")}</SelectItem>
            <SelectItem value="production">{t("environmentProduction")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label required>{t("realmId")}</Label>
        <Input value={value.realmId} onChange={(e) => set("realmId", e.target.value)} disabled={disabled} placeholder={t("realmIdPlaceholder")} />
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
      <div className="space-y-1.5 sm:col-span-2">
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
        <Label>{t("minorVersion")}</Label>
        <Input value={value.minorVersion ?? ""} onChange={(e) => set("minorVersion", e.target.value)} disabled={disabled} placeholder={t("minorVersionPlaceholder")} />
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

export const EMPTY_QUICKBOOKS_CONFIG: QuickBooksConfig = {
  environment: "sandbox",
  clientId: "",
  clientSecret: "",
  refreshToken: "",
  realmId: "",
  minorVersion: "",
  timeoutMs: undefined,
};

/** `QuickBooksConfig`'s own required fields (per `../types.ts` — the ones with no `?`) — gates the submit button before a wasted round trip. */
export function isQuickBooksConfigComplete(value: QuickBooksConfig): boolean {
  return Boolean(value.environment && value.clientId && value.clientSecret && value.refreshToken && value.realmId);
}
