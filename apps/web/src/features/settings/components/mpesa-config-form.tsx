"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { MpesaConfig } from "../types";

/**
 * Controlled form for `MpesaConfig` — the exact real field names
 * `MpesaAdapterResolverService`'s `DarajaConfig` interface declares (see
 * `../types.ts`'s own doc comment). `consumerSecret`/`passkey`/
 * `securityCredential` are masked (`type="password"`, per the plan's own
 * explicit instruction) — the same plain-input convention this codebase
 * already uses for the login/change-password screens, no custom
 * show/hide-toggle component exists anywhere in this app to reuse.
 *
 * Reused verbatim by BOTH `<NewIntegrationDialog>` and
 * `<EditIntegrationDialog>`'s "resubmit credentials" branch — a real design
 * consequence of `configEnc` never being readable back (see `../api/
 * integration-configs.api.ts`'s own doc comment): there is no "pre-filled,
 * edit one field" form anywhere in this feature, only ever a fresh, fully
 * blank credential entry.
 */
export function MpesaConfigForm({ value, onChange, disabled }: { value: MpesaConfig; onChange: (next: MpesaConfig) => void; disabled?: boolean }) {
  const t = useTranslations("settings.integrations.mpesaForm");

  function set<K extends keyof MpesaConfig>(key: K, v: MpesaConfig[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label required>{t("environment")}</Label>
          <Select value={value.environment} onValueChange={(v) => set("environment", v as MpesaConfig["environment"])} disabled={disabled}>
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
          <Label required>{t("shortcode")}</Label>
          <Input value={value.shortcode} onChange={(e) => set("shortcode", e.target.value)} disabled={disabled} placeholder={t("shortcodePlaceholder")} />
        </div>
        <div className="space-y-1.5">
          <Label required>{t("consumerKey")}</Label>
          <Input value={value.consumerKey} onChange={(e) => set("consumerKey", e.target.value)} disabled={disabled} placeholder={t("consumerKeyPlaceholder")} />
        </div>
        <div className="space-y-1.5">
          <Label required>{t("consumerSecret")}</Label>
          <Input
            type="password"
            value={value.consumerSecret}
            onChange={(e) => set("consumerSecret", e.target.value)}
            disabled={disabled}
            placeholder={t("consumerSecretPlaceholder")}
          />
        </div>
        <div className="space-y-1.5">
          <Label required>{t("passkey")}</Label>
          <Input type="password" value={value.passkey} onChange={(e) => set("passkey", e.target.value)} disabled={disabled} placeholder={t("passkeyPlaceholder")} />
        </div>
        <div className="space-y-1.5">
          <Label required>{t("callbackBaseUrl")}</Label>
          <Input
            value={value.callbackBaseUrl}
            onChange={(e) => set("callbackBaseUrl", e.target.value)}
            disabled={disabled}
            placeholder={t("callbackBaseUrlPlaceholder")}
          />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
        <p className="text-xs font-medium text-muted-foreground">{t("b2cSectionTitle")}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("initiatorName")}</Label>
            <Input value={value.initiatorName ?? ""} onChange={(e) => set("initiatorName", e.target.value)} disabled={disabled} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("securityCredential")}</Label>
            <Input type="password" value={value.securityCredential ?? ""} onChange={(e) => set("securityCredential", e.target.value)} disabled={disabled} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("b2cShortcode")}</Label>
            <Input value={value.b2cShortcode ?? ""} onChange={(e) => set("b2cShortcode", e.target.value)} disabled={disabled} />
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
      </div>
    </div>
  );
}

export const EMPTY_MPESA_CONFIG: MpesaConfig = {
  environment: "sandbox",
  consumerKey: "",
  consumerSecret: "",
  shortcode: "",
  passkey: "",
  callbackBaseUrl: "",
  initiatorName: "",
  securityCredential: "",
  b2cShortcode: "",
  timeoutMs: undefined,
};

/** `MpesaConfig`'s own required fields (per `../types.ts` — the ones with no `?`) — used by both dialogs to gate their submit button before a wasted round trip. */
export function isMpesaConfigComplete(value: MpesaConfig): boolean {
  return Boolean(value.environment && value.consumerKey && value.consumerSecret && value.shortcode && value.passkey && value.callbackBaseUrl);
}
