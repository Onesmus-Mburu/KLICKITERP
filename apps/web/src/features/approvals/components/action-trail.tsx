"use client";

import { useTranslations } from "next-intl";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { Action } from "../types";
import { UserName } from "./user-name";

const DECISION_VARIANT: Record<string, NonNullable<BadgeProps["variant"]>> = {
  APPROVE: "soft-success",
  REJECT: "soft-destructive",
  RETURN: "soft-warning",
};

/** `InstanceDetailResponseDto.actions` (`ApprActionEntity[]`, FR-APPR-003 "full decision trail") rendered as a real audit log — who decided what, when, with what comment — never derived/summarized, only what `GET /approvals/instances/{id}` actually returned. */
export function ActionTrail({ actions }: { actions: Action[] }) {
  const t = useTranslations("approvals.detail.actionTrail");

  if (actions.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <ul className="space-y-3">
      {actions.map((action) => (
        <li key={action.id} className="rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">
              <UserName id={action.actorId} />
            </span>
            <Badge variant={DECISION_VARIANT[action.decision] ?? "outline"}>{t(`decisions.${action.decision}`)}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("levelLabel", { level: action.levelSeq })} · {new Date(action.actedAt).toLocaleString()}
            {action.wasDelegatedFrom ? ` · ${t("delegatedFrom")}` : ""}
          </p>
          {action.comment && <p className="mt-2 text-sm text-foreground">{action.comment}</p>}
        </li>
      ))}
    </ul>
  );
}
