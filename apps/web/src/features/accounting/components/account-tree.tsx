"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import type { AccountTreeNodeResponseDto } from "@klickit/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useActivateAccount, useDeactivateAccount } from "../hooks/use-accounts";
import { EditAccountDialog } from "./edit-account-dialog";
import { DeleteAccountButton } from "./delete-account-button";

/** One color per `gl_account.class` — a stable, purely visual mapping (not derived from any backend value), reusing this app's own existing `soft-*` badge variant palette (`components/ui/badge.tsx`) rather than inventing new colors. */
const CLASS_BADGE_VARIANT: Record<string, BadgeProps["variant"]> = {
  ASSET: "soft-primary",
  LIABILITY: "soft-warning",
  EQUITY: "soft-accent",
  INCOME: "soft-success",
  EXPENSE: "soft-destructive",
};

/**
 * Phase 6 Slice 17 Part 1 (Accounting Core foundations, Module 7) — the
 * Chart of Accounts screen's primary view: a recursive expandable tree
 * rendering `GET /accounting/accounts/tree`'s own pre-assembled hierarchy
 * (`AccountTreeNodeResponseDto[]`), one node per `gl_account` row, each
 * showing code/name/class (colored badge)/postable/control/active
 * indicators plus row actions (edit, deactivate/activate toggle, delete).
 * No pagination, no virtualization — a chart of accounts is a small,
 * bounded, admin-curated list (the same "small reference list" assumption
 * `wallet/components/service-points-table.tsx`'s own doc comment makes for
 * an analogous flat list), and this one is additionally already
 * hierarchical/expandable, further shrinking what's visible by default.
 *
 * **Deactivate/activate is a direct-click toggle, no confirm dialog** —
 * matches `billing`'s fee-categories page / `wallet`'s service-points table
 * precedent for the exact same shape of action (a real, always-reversible
 * status flag, unlike account DELETE which is genuinely destructive and
 * gets its own confirm dialog in `<DeleteAccountButton>`).
 */
function AccountTreeNode({ node, depth }: { node: AccountTreeNodeResponseDto; depth: number }) {
  const t = useTranslations("accounting.accounts.tree");
  const tClasses = useTranslations("accounting.classes");
  const tCommon = useTranslations("common");
  const [expanded, setExpanded] = React.useState(true);
  const deactivateMutation = useDeactivateAccount();
  const activateMutation = useActivateAccount();

  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-muted/50"
        style={{ paddingLeft: depth * 20 + 8 }}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-label={expanded ? t("collapse") : t("expand")}
              className="flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted"
            >
              <ChevronRight className={cn("size-4 transition-transform", expanded && "rotate-90")} />
            </button>
          ) : (
            <span className="size-5 shrink-0" aria-hidden />
          )}
          <span className="font-mono text-xs text-muted-foreground">{node.code}</span>
          <span className="font-medium">{node.name}</span>
          <Badge variant={CLASS_BADGE_VARIANT[node.class] ?? "outline"}>{tClasses(node.class)}</Badge>
          {node.isPostable && <Badge variant="soft-secondary">{t("postable")}</Badge>}
          {node.isControl && <Badge variant="soft-accent">{t("control")}</Badge>}
          {!node.isActive && <Badge variant="soft-destructive">{tCommon("inactive")}</Badge>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <EditAccountDialog account={node} />
          {node.isActive ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={deactivateMutation.isPending}
              onClick={() => deactivateMutation.mutate(node.id)}
            >
              {t("deactivate")}
            </Button>
          ) : (
            <Button type="button" size="sm" variant="ghost" disabled={activateMutation.isPending} onClick={() => activateMutation.mutate(node.id)}>
              {t("activate")}
            </Button>
          )}
          <DeleteAccountButton account={node} />
        </div>
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <AccountTreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function AccountTree({ nodes }: { nodes: AccountTreeNodeResponseDto[] }) {
  return (
    <div className="space-y-0.5">
      {nodes.map((node) => (
        <AccountTreeNode key={node.id} node={node} depth={0} />
      ))}
    </div>
  );
}
