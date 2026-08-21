"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-error";
import { useDepartments } from "@/features/departments/hooks/use-departments";
import { useCostCenters } from "@/features/accounting/hooks/use-cost-centers";
import { useCreateEmployee } from "../hooks/use-employees";
import { useUsersLookup } from "../hooks/use-users-lookup";

const STAFF_NO_MAX_LENGTH = 20; // pyrl_employee.staff_no — employee.dto.ts's own @MaxLength(20).
const FULL_NAME_MAX_LENGTH = 120; // pyrl_employee.full_name — @MaxLength(120).
const NATIONAL_ID_MAX_LENGTH = 20; // pyrl_employee.national_id — @MaxLength(20).
const KRA_PIN_MAX_LENGTH = 15; // pyrl_employee.kra_pin — @MaxLength(15).
const NSSF_NO_MAX_LENGTH = 20; // pyrl_employee.nssf_no — @MaxLength(20).
const SHIF_NO_MAX_LENGTH = 20; // pyrl_employee.shif_no — @MaxLength(20).
const JOB_TITLE_MAX_LENGTH = 80; // pyrl_employee.job_title — @MaxLength(80).

const EMPLOYMENT_TYPES = ["PERMANENT", "CONTRACT", "CASUAL", "PART_TIME"] as const;

/**
 * Phase 6 Slice 22 Part 1 (Payroll foundations, Module 15) — the payroll
 * employee create form. `staffNo`/`nationalId`/`kraPin`/`hireDate` are
 * create-only/immutable (never editable again after this dialog, per
 * `UpdatePyrlEmployeeDto`'s own field set — `edit-employee-dialog.tsx` omits
 * them entirely, not disabled, matching this codebase's established
 * immutable-field precedent).
 *
 * **UPDATE (migration `0240`) — now genuinely encrypted, fixing a real gap
 * live-verified when this dialog was first built.** `nationalId`/`kraPin`
 * used to be plain `varchar` columns on `pyrl_employee`, never masked or
 * encrypted, contradicting Part 1's own task brief. Migration `0240`
 * widened both to the same `jsonb` "(enc)" shape `payDetails`/`bankName`/
 * `branch`/`account` already used, and `EmployeesService.redact()` now
 * redacts both the same way (`GET /payroll/employees/:id` returns `"***"`
 * for a caller with only `payroll:employee:view`; real plaintext only via
 * `/decrypted`, `payroll:employee:manage`-gated). This dialog's own
 * `encryptedFieldHint` copy next to these two inputs now says exactly that.
 *
 * `payDetails`/`bankName`/`branch`/`account` are genuinely opaque `unknown`
 * server-side (no backend-defined shape at all, confirmed by reading
 * `CreatePyrlEmployeeDto` directly) — this form treats all 4 as plain
 * free-text inputs, per this part's own task brief. `userId` (an optional
 * link to a `usr_user` login account) reuses the same `<Combobox>` +
 * clear-button shape `create-department-dialog.tsx`'s own `headUserId`
 * picker already establishes, backed by this feature's own self-contained
 * `useUsersLookup()`.
 *
 * **No clean 409 on duplicate `staffNo`** — a raw `500` reaches this dialog
 * (documented, not fixed, see `employees.api.ts`'s own doc comment); on ANY
 * caught 500 specifically, this dialog shows a targeted "this staff number
 * may already be in use" message rather than the generic fallback, since a
 * raw `500`'s own `ApiError.message` is an unhelpful internal-error string,
 * not something safe to show verbatim the way a real 409's message is.
 */
export function CreateEmployeeDialog() {
  const t = useTranslations("payroll.employees.createDialog");
  const tEmploymentTypes = useTranslations("payroll.employmentTypes");
  const tCommon = useTranslations("common");
  const [open, setOpen] = React.useState(false);
  const [staffNo, setStaffNo] = React.useState("");
  const [userId, setUserId] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [nationalId, setNationalId] = React.useState("");
  const [kraPin, setKraPin] = React.useState("");
  const [nssfNo, setNssfNo] = React.useState("");
  const [shifNo, setShifNo] = React.useState("");
  const [employmentType, setEmploymentType] = React.useState<(typeof EMPLOYMENT_TYPES)[number]>("PERMANENT");
  const [departmentId, setDepartmentId] = React.useState("");
  const [jobTitle, setJobTitle] = React.useState("");
  const [hireDate, setHireDate] = React.useState("");
  const [costCenterId, setCostCenterId] = React.useState("");
  const [payDetails, setPayDetails] = React.useState("");
  const [bankName, setBankName] = React.useState("");
  const [branch, setBranch] = React.useState("");
  const [account, setAccount] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateEmployee();
  const departmentsQuery = useDepartments();
  const costCentersQuery = useCostCenters(true);
  const usersQuery = useUsersLookup();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setStaffNo("");
      setUserId("");
      setFullName("");
      setNationalId("");
      setKraPin("");
      setNssfNo("");
      setShifNo("");
      setEmploymentType("PERMANENT");
      setDepartmentId("");
      setJobTitle("");
      setHireDate("");
      setCostCenterId("");
      setPayDetails("");
      setBankName("");
      setBranch("");
      setAccount("");
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

  const canSubmit =
    staffNo.trim().length > 0 &&
    fullName.trim().length > 0 &&
    nationalId.trim().length > 0 &&
    kraPin.trim().length > 0 &&
    !!departmentId &&
    jobTitle.trim().length > 0 &&
    !!hireDate &&
    !!costCenterId;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    try {
      await createMutation.mutateAsync({
        staffNo: staffNo.trim(),
        userId: userId || null,
        fullName: fullName.trim(),
        nationalId: nationalId.trim(),
        kraPin: kraPin.trim(),
        nssfNo: nssfNo.trim() || undefined,
        shifNo: shifNo.trim() || undefined,
        employmentType,
        departmentId,
        jobTitle: jobTitle.trim(),
        hireDate,
        costCenterId,
        payDetails: payDetails.trim() || undefined,
        bankName: bankName.trim() || undefined,
        branch: branch.trim() || undefined,
        account: account.trim() || undefined,
      });
      setOpen(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 500) {
        setError(t("duplicateStaffNoError"));
      } else {
        setError(err instanceof ApiError ? err.message : t("genericError"));
      }
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
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
              <Label required>{t("staffNoLabel")}</Label>
              <Input value={staffNo} maxLength={STAFF_NO_MAX_LENGTH} onChange={(e) => setStaffNo(e.target.value)} placeholder={t("staffNoPlaceholder")} />
              <p className="text-xs text-muted-foreground">{t("staffNoHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label required>{t("fullNameLabel")}</Label>
              <Input value={fullName} maxLength={FULL_NAME_MAX_LENGTH} onChange={(e) => setFullName(e.target.value)} placeholder={t("fullNamePlaceholder")} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>{t("nationalIdLabel")}</Label>
              <Input value={nationalId} maxLength={NATIONAL_ID_MAX_LENGTH} onChange={(e) => setNationalId(e.target.value)} placeholder={t("nationalIdPlaceholder")} />
              <p className="text-xs text-muted-foreground">{t("encryptedFieldHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label required>{t("kraPinLabel")}</Label>
              <Input value={kraPin} maxLength={KRA_PIN_MAX_LENGTH} onChange={(e) => setKraPin(e.target.value)} placeholder={t("kraPinPlaceholder")} />
              <p className="text-xs text-muted-foreground">{t("encryptedFieldHint")}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("nssfNoLabel")}</Label>
              <Input value={nssfNo} maxLength={NSSF_NO_MAX_LENGTH} onChange={(e) => setNssfNo(e.target.value)} placeholder={t("nssfNoPlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("shifNoLabel")}</Label>
              <Input value={shifNo} maxLength={SHIF_NO_MAX_LENGTH} onChange={(e) => setShifNo(e.target.value)} placeholder={t("shifNoPlaceholder")} />
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
              <Label required>{t("jobTitleLabel")}</Label>
              <Input value={jobTitle} maxLength={JOB_TITLE_MAX_LENGTH} onChange={(e) => setJobTitle(e.target.value)} placeholder={t("jobTitlePlaceholder")} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>{t("departmentLabel")}</Label>
              <Select value={departmentId} onValueChange={setDepartmentId} disabled={departmentsQuery.isLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={departmentsQuery.isLoading ? t("loadingDepartments") : t("departmentPlaceholder")} />
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
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>{t("hireDateLabel")}</Label>
              <Input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
              <p className="text-xs text-muted-foreground">{t("hireDateHint")}</p>
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

          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-sm font-medium text-foreground">{t("bankDetailsSectionTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("bankDetailsSectionHint")}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("bankNameLabel")}</Label>
                <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder={t("bankNamePlaceholder")} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("branchLabel")}</Label>
                <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder={t("branchPlaceholder")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("accountLabel")}</Label>
              <Input value={account} onChange={(e) => setAccount(e.target.value)} placeholder={t("accountPlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("payDetailsLabel")}</Label>
              <Input value={payDetails} onChange={(e) => setPayDetails(e.target.value)} placeholder={t("payDetailsPlaceholder")} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || createMutation.isPending}>
            {createMutation.isPending ? t("creating") : t("createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
