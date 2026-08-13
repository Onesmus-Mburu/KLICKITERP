"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { BudgetResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-error";
import { useActivateBudget, useBudgets, useRejectBudget, useSubmitBudget } from "../hooks/use-budgets";

/**
 * Phase 6 Slice 17 Part 3 (Budgets, Module 7) — one action set per current
 * `GL_BUDGET_STATUSES` state: DRAFT gets a direct-click Submit button
 * (mirrors `period-status-actions.tsx`'s own Open/Soft-Close treatment —
 * safely retryable, no destructive consequence of its own), PENDING_APPROVAL
 * gets Activate/Reject behind their own confirm dialogs (mirrors
 * `reverse-journal-dialog.tsx`'s shape), ACTIVE/SUPERSEDED render nothing —
 * both are terminal-for-this-UI states (`BudgetsController` has no further
 * transition off either, confirmed by reading it directly).
 *
 * **"No approval workflow configured" — handled explicitly, not as a
 * generic error.** Nothing in this codebase seeds a `GL_BUDGET`
 * `appr_workflow_def`/`appr_workflow_version` (`BudgetsService`'s own doc
 * comment, confirmed directly) — Submit is very likely to hit a real 422
 * (`ValidationException`, message `"No active appr_workflow_def registered
 * for domain_code: GL_BUDGET"`) on an install where nobody has registered
 * one yet. `handleSubmit()` below checks for that exact substring
 * (`"appr_workflow_def"`) and swaps in an honest, actionable message instead
 * of the raw server string or a generic toast — every OTHER submit failure
 * still falls back to `ApiError.message`/`genericError`, same as every other
 * mutation error path in this codebase. See this slice's PROGRESS.md
 * write-up for whether this was actually observed live against the local
 * dev DB, or whether a workflow happened to already exist.
 *
 * **ACTIVE-supersede warning**: `activateBudget()`'s own doc comment
 * confirms activation auto-supersedes the fiscal year's previous ACTIVE
 * budget, if any, with no separate confirmation of its OWN — so this
 * component fetches the fiscal year's sibling budgets (`useBudgets()`, the
 * same list query the budgets list page itself uses, so this rides that
 * cache rather than adding a new round trip in the common case) and shows a
 * named warning inside the activate-confirm dialog whenever another budget
 * in this fiscal year is currently `ACTIVE`.
 */
export function BudgetStatusActions({ budget }: { budget: BudgetResponseDto }) {
  const t = useTranslations("accounting.budgets.statusActions");
  const tCommon = useTranslations("common");
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [activateOpen, setActivateOpen] = React.useState(false);
  const [activateError, setActivateError] = React.useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectError, setRejectError] = React.useState<string | null>(null);

  const submitMutation = useSubmitBudget();
  const activateMutation = useActivateBudget();
  const rejectMutation = useRejectBudget();

  const siblingsQuery = useBudgets(budget.fiscalYearId);
  const otherActive = (siblingsQuery.data ?? []).find((b) => b.status === "ACTIVE" && b.id !== budget.id);

  async function handleSubmit() {
    setSubmitError(null);
    try {
      await submitMutation.mutateAsync(budget.id);
    } catch (err) {
      if (err instanceof ApiError && err.message.includes("appr_workflow_def")) {
        setSubmitError(t("noWorkflowError"));
      } else {
        setSubmitError(err instanceof ApiError ? err.message : t("genericError"));
      }
    }
  }

  function handleActivateOpenChange(next: boolean) {
    setActivateOpen(next);
    if (next) setActivateError(null);
  }

  async function handleActivate() {
    setActivateError(null);
    try {
      await activateMutation.mutateAsync(budget.id);
      setActivateOpen(false);
    } catch (err) {
      setActivateError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  function handleRejectOpenChange(next: boolean) {
    setRejectOpen(next);
    if (next) setRejectError(null);
  }

  async function handleReject() {
    setRejectError(null);
    try {
      await rejectMutation.mutateAsync(budget.id);
      setRejectOpen(false);
    } catch (err) {
      setRejectError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  if (budget.status === "DRAFT") {
    return (
      <div className="space-y-2">
        <Button type="button" onClick={() => void handleSubmit()} disabled={submitMutation.isPending}>
          {submitMutation.isPending ? t("submitting") : t("submitTrigger")}
        </Button>
        {submitError && (
          <Alert variant="destructive">
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  if (budget.status === "PENDING_APPROVAL") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Dialog open={activateOpen} onOpenChange={handleActivateOpenChange}>
          <DialogTrigger asChild>
            <Button type="button">{t("activateTrigger")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("activateConfirmTitle")}</DialogTitle>
              <DialogDescription>{t("activateConfirmDescription", { name: budget.name, versionLabel: budget.versionLabel })}</DialogDescription>
            </DialogHeader>

            {otherActive && (
              <Alert variant="destructive">
                <AlertDescription>
                  {t("activateSupersedeWarning", { name: otherActive.name, versionLabel: otherActive.versionLabel })}
                </AlertDescription>
              </Alert>
            )}
            {activateError && (
              <Alert variant="destructive">
                <AlertDescription>{activateError}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setActivateOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="button" onClick={() => void handleActivate()} disabled={activateMutation.isPending}>
                {activateMutation.isPending ? t("activating") : t("activateConfirmButton")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={rejectOpen} onOpenChange={handleRejectOpenChange}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline">
              {t("rejectTrigger")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("rejectConfirmTitle")}</DialogTitle>
              <DialogDescription>{t("rejectConfirmDescription")}</DialogDescription>
            </DialogHeader>

            {rejectError && (
              <Alert variant="destructive">
                <AlertDescription>{rejectError}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRejectOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button type="button" variant="destructive" onClick={() => void handleReject()} disabled={rejectMutation.isPending}>
                {rejectMutation.isPending ? t("rejecting") : t("rejectConfirmButton")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return null;
}
