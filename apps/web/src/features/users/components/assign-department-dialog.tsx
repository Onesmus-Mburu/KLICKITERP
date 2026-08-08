"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import type { UserResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-error";
import { useDepartments } from "@/features/departments/hooks/use-departments";
import { useAssignDepartment } from "../hooks/use-users";

/**
 * `PATCH /users/:id/department` (`users:user:assign-department`,
 * `AssignDepartmentDto{departmentId?: string|null}`) — a `<Combobox>` fed by
 * `useDepartments()` (`features/departments`, the correct cross-feature
 * dependency direction per the plan: Users ships last, consumes the
 * reference-data feature that shipped first), with an explicit clear
 * affordance — mirrors `CreateDepartmentDialog`/`EditDepartmentDialog`'s own
 * head-of-department picker shape exactly.
 */
export function AssignDepartmentDialog({ user }: { user: UserResponseDto }) {
  const t = useTranslations("users.assignDepartmentDialog");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [departmentId, setDepartmentId] = React.useState(user.departmentId ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const departmentsQuery = useDepartments();
  const assignMutation = useAssignDepartment();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setDepartmentId(user.departmentId ?? "");
      setError(null);
    }
  }

  const pickerItems = React.useMemo(() => {
    const items = (departmentsQuery.data ?? []).map((d) => ({ value: d.id, label: d.name }));
    // The user's current department might not appear in the fetched list in
    // some edge case (e.g. stale cache) — keep its name resolvable in the
    // trigger regardless, same defensive pattern `EditDepartmentDialog`
    // already established for its own head-of-department picker.
    if (user.departmentId && user.departmentName && !items.some((i) => i.value === user.departmentId)) {
      items.push({ value: user.departmentId, label: user.departmentName });
    }
    return items;
  }, [departmentsQuery.data, user.departmentId, user.departmentName]);

  const originalDepartmentId = user.departmentId ?? "";
  const canSubmit = departmentId !== originalDepartmentId;

  async function handleSubmit() {
    if (!canSubmit) {
      setOpen(false);
      return;
    }
    setError(null);
    try {
      await assignMutation.mutateAsync({ id: user.id, dto: { departmentId: departmentId === "" ? null : departmentId } });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
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

        <div className="space-y-1.5">
          <Label>{t("departmentLabel")}</Label>
          <div className="flex gap-2">
            <div className="flex-1">
              <Combobox
                items={pickerItems}
                value={departmentId}
                onChange={setDepartmentId}
                placeholder={departmentsQuery.isLoading ? t("loadingDepartments") : t("selectDepartment")}
                searchPlaceholder={t("searchDepartment")}
                emptyText={t("noDepartmentsFound")}
                disabled={departmentsQuery.isLoading}
              />
            </div>
            {departmentId && (
              <Button type="button" variant="outline" size="icon" onClick={() => setDepartmentId("")} aria-label={t("clearDepartment")}>
                <X className="size-4" />
              </Button>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || assignMutation.isPending}>
            {assignMutation.isPending ? t("assigning") : tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
