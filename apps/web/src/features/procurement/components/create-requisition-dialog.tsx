"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { CreateRequisitionDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-error";
import { useDepartments } from "@/features/departments/hooks/use-departments";
import { useCreateRequisition } from "../hooks/use-requisitions";

/**
 * Phase 6 Slice 18 Part 2 (Requisitions, Procurement) — creates the DRAFT
 * requisition itself: `departmentId` + `justification` only —
 * `CreateRequisitionDto` has no `lines` field at all (confirmed by reading
 * `requisition.dto.ts` directly), unlike `create-budget-dialog.tsx`'s own
 * batched-initial-lines create. Lines are added afterward on the detail page
 * via `<RequisitionLineEditor>`, once a real requisition id exists.
 * `requestedBy` is never sent — the server sets it from the caller's own
 * auth context (`RequisitionsController.create()`'s `requireUserId()`).
 *
 * Reuses `features/departments/api/departments.api.ts`'s existing
 * `listDepartments()` (via `useDepartments()`, already built in an earlier
 * slice) for the department picker, per the plan's own explicit instruction
 * not to build a new one.
 */
export function CreateRequisitionDialog() {
  const t = useTranslations("procurement.requisitions.createDialog");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [departmentId, setDepartmentId] = React.useState("");
  const [justification, setJustification] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const createMutation = useCreateRequisition();
  const departmentsQuery = useDepartments();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setDepartmentId("");
      setJustification("");
      setError(null);
    }
  }

  const canSubmit = !!departmentId && justification.trim().length > 0 && !createMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: CreateRequisitionDto = { departmentId, justification: justification.trim() };
    try {
      const requisition = await createMutation.mutateAsync(dto);
      setOpen(false);
      router.push(`/procurement/requisitions/${requisition.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">
          <Plus className="size-4" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label required>{t("departmentLabel")}</Label>
            <Select value={departmentId} onValueChange={setDepartmentId} disabled={departmentsQuery.isLoading}>
              <SelectTrigger>
                <SelectValue placeholder={departmentsQuery.isLoading ? t("loadingDepartments") : t("selectDepartmentPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {(departmentsQuery.data ?? []).map((department) => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label required>{t("justificationLabel")}</Label>
            <Textarea value={justification} onChange={(e) => setJustification(e.target.value)} rows={4} placeholder={t("justificationPlaceholder")} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {createMutation.isPending ? t("creating") : t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
