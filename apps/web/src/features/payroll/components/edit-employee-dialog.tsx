"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Pencil, X } from "lucide-react";
import type { PyrlEmployeeResponseDto } from "@klickit/contracts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import { useDepartments } from "@/features/departments/hooks/use-departments";
import { useCostCenters } from "@/features/accounting/hooks/use-cost-centers";
import { useUpdateEmployee } from "../hooks/use-employees";
import { useUsersLookup } from "../hooks/use-users-lookup";
import type { UpdateEmployeeInput } from "../api/employees.api";

const FULL_NAME_MAX_LENGTH = 120;
const NSSF_NO_MAX_LENGTH = 20;
const SHIF_NO_MAX_LENGTH = 20;
const JOB_TITLE_MAX_LENGTH = 80;

const EMPLOYMENT_TYPES = ["PERMANENT", "CONTRACT", "CASUAL", "PART_TIME"] as const;

/**
 * Phase 6 Slice 22 Part 1 (Payroll foundations, Module 15) —
 * `UpdatePyrlEmployeeDto` only allows `fullName?`/`jobTitle?`/`departmentId?`/
 * `costCenterId?`/`employmentType?`/`nssfNo?`/`shifNo?`/`userId?`, plus the 4
 * encrypted fields (confirmed by reading `employee.dto.ts`/
 * `EmployeesController.update()` directly). `staffNo`/`nationalId`/`kraPin`/
 * `hireDate` are create-only/immutable and are OMITTED from this form
 * entirely, not disabled — the same precedent `edit-account-dialog.tsx`
 * (Banking, Slice 21 Part 1) already establishes for `kind`/`glAccountId`.
 *
 * **The 4 encrypted fields (`payDetails`/`bankName`/`branch`/`account`) are
 * NEVER prefilled with their real value here** — this dialog only ever
 * receives the REDACTED employee (`"***"` or `null`), never plaintext (that's
 * `employee-bank-details-panel.tsx`'s own separate, explicit-action-only
 * concern). Each of the 4 gets its own blank text input (a placeholder shows
 * whether something is currently set) PLUS a "clear" checkbox — leaving the
 * input blank with the checkbox unchecked omits the field entirely (no
 * change, per `UpdatePyrlEmployeeInput`'s own `undefined` = "leave untouched"
 * semantics); typing a new value replaces it; checking "clear" sends an
 * explicit `null` regardless of what's typed. This is the only safe way to
 * let an admin update an opaque, never-re-displayed field without
 * accidentally overwriting it with an empty string.
 */
export function EditEmployeeDialog({ employee }: { employee: PyrlEmployeeResponseDto }) {
  const t = useTranslations("payroll.employees.editDialog");
  const tEmploymentTypes = useTranslations("payroll.employmentTypes");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [fullName, setFullName] = React.useState(employee.fullName);
  const [jobTitle, setJobTitle] = React.useState(employee.jobTitle);
  const [departmentId, setDepartmentId] = React.useState(employee.departmentId);
  const [costCenterId, setCostCenterId] = React.useState(employee.costCenterId);
  const [employmentType, setEmploymentType] = React.useState<(typeof EMPLOYMENT_TYPES)[number]>(
    employee.employmentType as (typeof EMPLOYMENT_TYPES)[number],
  );
  const [nssfNo, setNssfNo] = React.useState(employee.nssfNo ?? "");
  const [shifNo, setShifNo] = React.useState(employee.shifNo ?? "");
  const [userId, setUserId] = React.useState(employee.userId ?? "");
  const [payDetails, setPayDetails] = React.useState("");
  const [clearPayDetails, setClearPayDetails] = React.useState(false);
  const [bankName, setBankName] = React.useState("");
  const [clearBankName, setClearBankName] = React.useState(false);
  const [branch, setBranch] = React.useState("");
  const [clearBranch, setClearBranch] = React.useState(false);
  const [account, setAccount] = React.useState("");
  const [clearAccount, setClearAccount] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const updateMutation = useUpdateEmployee();
  const departmentsQuery = useDepartments();
  const costCentersQuery = useCostCenters(true);
  const usersQuery = useUsersLookup();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setFullName(employee.fullName);
      setJobTitle(employee.jobTitle);
      setDepartmentId(employee.departmentId);
      setCostCenterId(employee.costCenterId);
      setEmploymentType(employee.employmentType as (typeof EMPLOYMENT_TYPES)[number]);
      setNssfNo(employee.nssfNo ?? "");
      setShifNo(employee.shifNo ?? "");
      setUserId(employee.userId ?? "");
      setPayDetails("");
      setClearPayDetails(false);
      setBankName("");
      setClearBankName(false);
      setBranch("");
      setClearBranch(false);
      setAccount("");
      setClearAccount(false);
      setError(null);
    }
  }

  const userItems = React.useMemo(
    () => (usersQuery.data?.items ?? []).map((u) => ({ value: u.id, label: `${u.fullName} (${u.username})` })),
    [usersQuery.data],
  );
  const costCenterItems = React.useMemo(
    () => (costCentersQuery.data ?? []).map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
    [costCentersQuery.data],
  );

  const canSubmit = fullName.trim().length > 0 && jobTitle.trim().length > 0 && !!departmentId && !!costCenterId;

  function opaqueFieldValue(clear: boolean, value: string): string | null | undefined {
    if (clear) return null;
    return value.trim() ? value.trim() : undefined;
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const dto: UpdateEmployeeInput = {};
    if (fullName.trim() !== employee.fullName) dto.fullName = fullName.trim();
    if (jobTitle.trim() !== employee.jobTitle) dto.jobTitle = jobTitle.trim();
    if (departmentId !== employee.departmentId) dto.departmentId = departmentId;
    if (costCenterId !== employee.costCenterId) dto.costCenterId = costCenterId;
    if (employmentType !== employee.employmentType) dto.employmentType = employmentType;

    const originalNssfNo = employee.nssfNo ?? "";
    if (nssfNo.trim() !== originalNssfNo) dto.nssfNo = nssfNo.trim() === "" ? null : nssfNo.trim();

    const originalShifNo = employee.shifNo ?? "";
    if (shifNo.trim() !== originalShifNo) dto.shifNo = shifNo.trim() === "" ? null : shifNo.trim();

    const originalUserId = employee.userId ?? "";
    if (userId !== originalUserId) dto.userId = userId === "" ? null : userId;

    const nextPayDetails = opaqueFieldValue(clearPayDetails, payDetails);
    if (nextPayDetails !== undefined) dto.payDetails = nextPayDetails;
    const nextBankName = opaqueFieldValue(clearBankName, bankName);
    if (nextBankName !== undefined) dto.bankName = nextBankName;
    const nextBranch = opaqueFieldValue(clearBranch, branch);
    if (nextBranch !== undefined) dto.branch = nextBranch;
    const nextAccount = opaqueFieldValue(clearAccount, account);
    if (nextAccount !== undefined) dto.account = nextAccount;

    if (Object.keys(dto).length === 0) {
      setOpen(false);
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: employee.id, dto });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Pencil className="size-4" />
          {tCommon("edit")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title", { name: employee.fullName })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>{t("fullNameLabel")}</Label>
              <Input value={fullName} maxLength={FULL_NAME_MAX_LENGTH} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label required>{t("jobTitleLabel")}</Label>
              <Input value={jobTitle} maxLength={JOB_TITLE_MAX_LENGTH} onChange={(e) => setJobTitle(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>{t("employmentTypeLabel")}</Label>
              <Select value={employmentType} onValueChange={(v) => setEmploymentType(v as (typeof EMPLOYMENT_TYPES)[number])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYMENT_TYPES.map((et) => (
                    <SelectItem key={et} value={et}>
                      {tEmploymentTypes(et)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label required>{t("departmentLabel")}</Label>
              <Select value={departmentId} onValueChange={setDepartmentId} disabled={departmentsQuery.isLoading}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(departmentsQuery.data ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>{t("costCenterLabel")}</Label>
              <Combobox
                items={costCenterItems}
                value={costCenterId}
                onChange={setCostCenterId}
                placeholder={costCentersQuery.isLoading ? t("loadingCostCenters") : t("costCenterPlaceholder")}
                searchPlaceholder={t("costCenterSearchPlaceholder")}
                emptyText={t("costCenterEmptyText")}
                disabled={costCentersQuery.isLoading}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("userIdLabel")}</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Combobox
                    items={userItems}
                    value={userId}
                    onChange={setUserId}
                    placeholder={usersQuery.isLoading ? t("loadingUsers") : t("userIdPlaceholder")}
                    searchPlaceholder={t("userIdSearchPlaceholder")}
                    emptyText={t("userIdEmptyText")}
                    disabled={usersQuery.isLoading}
                  />
                </div>
                {userId && (
                  <Button type="button" variant="outline" size="icon" onClick={() => setUserId("")} aria-label={t("clearUserId")}>
                    <X className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("nssfNoLabel")}</Label>
              <Input value={nssfNo} maxLength={NSSF_NO_MAX_LENGTH} onChange={(e) => setNssfNo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("shifNoLabel")}</Label>
              <Input value={shifNo} maxLength={SHIF_NO_MAX_LENGTH} onChange={(e) => setShifNo(e.target.value)} />
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-sm font-medium text-foreground">{t("bankDetailsSectionTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("bankDetailsSectionHint")}</p>

            <OpaqueFieldRow
              label={t("bankNameLabel")}
              currentlySet={!!employee.bankName}
              value={bankName}
              onValueChange={setBankName}
              clear={clearBankName}
              onClearChange={setClearBankName}
              clearLabel={t("clearField")}
            />
            <OpaqueFieldRow
              label={t("branchLabel")}
              currentlySet={!!employee.branch}
              value={branch}
              onValueChange={setBranch}
              clear={clearBranch}
              onClearChange={setClearBranch}
              clearLabel={t("clearField")}
            />
            <OpaqueFieldRow
              label={t("accountLabel")}
              currentlySet={!!employee.account}
              value={account}
              onValueChange={setAccount}
              clear={clearAccount}
              onClearChange={setClearAccount}
              clearLabel={t("clearField")}
            />
            <OpaqueFieldRow
              label={t("payDetailsLabel")}
              currentlySet={!!employee.payDetails}
              value={payDetails}
              onValueChange={setPayDetails}
              clear={clearPayDetails}
              onClearChange={setClearPayDetails}
              clearLabel={t("clearField")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || updateMutation.isPending}>
            {updateMutation.isPending ? t("saving") : tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One row of the "clear-or-replace an opaque encrypted field" shape every one of the 4 bank/pay fields shares — see this file's own doc comment above for why blank-input-alone can never mean "clear." */
function OpaqueFieldRow({
  label,
  currentlySet,
  value,
  onValueChange,
  clear,
  onClearChange,
  clearLabel,
}: {
  label: string;
  currentlySet: boolean;
  value: string;
  onValueChange: (value: string) => void;
  clear: boolean;
  onClearChange: (clear: boolean) => void;
  clearLabel: string;
}) {
  const inputId = React.useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <div className="flex items-center gap-3">
        <Input
          id={inputId}
          className="flex-1"
          value={value}
          disabled={clear}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={currentlySet ? "***" : "—"}
        />
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Checkbox checked={clear} onChange={(e) => onClearChange(e.target.checked)} />
          {clearLabel}
        </label>
      </div>
    </div>
  );
}
