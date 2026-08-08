"use client";

import { useTranslations } from "next-intl";
import type { TemplateResponseDto } from "@klickit/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";

/**
 * `CommChannel` (`SMS`/`EMAIL`/`PUSH`/`WHATSAPP`/`INAPP`) — same soft-tint
 * badge convention `ThemeStatusBadge` already establishes. Typed via
 * `TemplateResponseDto["channel"]` rather than a hand-typed union —
 * `CommChannel` itself is a `packages/server`-only TS type
 * (`comm-template.entity.ts`), never re-exported through `@klickit/contracts`
 * (confirmed: no schema file there mentions it), so the response DTO's own
 * field type is the closest real source of truth at this layer, mirroring
 * `ThemeStatusBadge`'s own `ThemeResponseDto["status"]` precedent.
 *
 * Only EMAIL/SMS/PUSH have real delivery adapters (confirmed by reading
 * `packages/server/src/platform/comms/infrastructure/*.ts` directly) —
 * WHATSAPP/INAPP are still valid, selectable values on `CreateTemplateDto`
 * (its own `@ApiProperty({ enum: COMM_CHANNELS })` lists all 5), but
 * anything sent through them today falls back to a log-only no-op adapter.
 * That distinction is surfaced here as visible subtext under the badge —
 * not hidden in a tooltip, since this app has no `Tooltip` primitive yet
 * (confirmed by listing `components/ui/`) — so an admin creating a
 * WHATSAPP/INAPP template knows upfront it won't actually deliver yet.
 */
const CHANNEL_VARIANT: Record<string, NonNullable<BadgeProps["variant"]>> = {
  SMS: "soft-primary",
  EMAIL: "soft-primary",
  PUSH: "soft-primary",
  WHATSAPP: "soft-warning",
  INAPP: "soft-warning",
};

const LOG_ONLY_CHANNELS = new Set<TemplateResponseDto["channel"]>(["WHATSAPP", "INAPP"]);

export function ChannelBadge({ channel }: { channel: TemplateResponseDto["channel"] }) {
  const t = useTranslations("communications.channels");
  return (
    <div className="flex flex-col gap-0.5">
      <Badge variant={CHANNEL_VARIANT[channel] ?? "outline"} className="w-fit">
        {t(channel)}
      </Badge>
      {LOG_ONLY_CHANNELS.has(channel) && <span className="text-[11px] text-muted-foreground">{t("logOnlyNote")}</span>}
    </div>
  );
}
