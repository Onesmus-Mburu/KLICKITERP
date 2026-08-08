"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import {
  CreateStudentDtoSchema,
  UpdateStudentDtoSchema,
  type CreateStudentDto,
  type StudentResponseDto,
  type UpdateStudentDto,
} from "@klickit/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError, parseFieldErrors } from "@/lib/api-error";
import { STUDENT_BOARDING_KINDS } from "../constants";
import { useCreateStudent, useUpdateStudent } from "../hooks/use-students";
import { useFeeGroups } from "../hooks/use-fee-groups";
import { useAdmissionNoAutogenSetting } from "../hooks/use-admission-no-autogen";
import { createAndLinkGuardian, GuardianLinkAfterCreateError, GUARDIANS_QUERY_KEY } from "../hooks/use-guardians";
import { ClassStreamSelect } from "./class-stream-select";
import { EMPTY_GUARDIAN_FIELDS, GuardianFields, hasGuardianContact, isGuardianFieldsEmpty, type GuardianFieldsValue } from "./guardian-fields";

const NO_FEE_GROUP_VALUE = "__none__";

/**
 * Shared shape for both create/edit forms — a superset of `CreateStudentDto`
 * and `UpdateStudentDto`'s overlapping fields (edit simply never populates
 * `admissionNo`/`enrolledOn` into its submit payload; both are absent from
 * `UpdateStudentDtoSchema` entirely — `admissionNo` has no update path
 * anywhere in `StudentsService`, and `enrolledOn` is create-only per the
 * plan, not merely disabled). `sponsorId`/`transportRouteId`/`photoFileId`/
 * `customFields` are deliberately omitted from this form entirely — forward
 * references to unbuilt Billing/Files modules and an unscoped arbitrary-JSON
 * editor, per the plan's scope boundary; both real DTOs' zod schemas accept
 * their absence (`.optional()`), so omitting them here is a valid submission,
 * not a workaround.
 *
 * Phase 6 Slice 2b item 8: `admissionNo` is now `.optional()` on the real
 * `CreateStudentDtoSchema` (it stays required in this local
 * `StudentFormValues` type only so the `admissionNo` input's own
 * `form.register` binding has a stable non-undefined string to control —
 * whether it's actually SENT depends on the autogen setting, see `onValid`).
 *
 * Phase 6 Slice 2b follow-up item 3: `boarding` is now genuinely optional
 * (`?`, matching `CreateStudentDtoSchema.boarding.optional()` post-regen).
 * Left unset, the Select's `field.value` stays `undefined` (Radix's
 * `<Select>` root natively supports an undefined controlled value — it
 * just renders the placeholder, nothing selected), and `onValid` sends
 * `boarding: undefined` straight through, which `JSON.stringify` drops
 * from the request body entirely — the exact "omit the field" shape
 * `StudentsService.create()` reads as "default to DAY". No client-side
 * default is applied here on purpose — the default is a server concern
 * (see that service's own doc comment for why: a plain code default over a
 * nullable DB column).
 */
interface StudentFormValues {
  admissionNo: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  classId: string;
  streamId?: string;
  boarding?: "DAY" | "BOARDER";
  feeGroupId?: string;
  enrolledOn: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultValuesFor(mode: "create" | "edit", student?: StudentResponseDto): StudentFormValues {
  if (mode === "edit" && student) {
    return {
      admissionNo: student.admissionNo,
      firstName: student.firstName,
      middleName: student.middleName ?? undefined,
      lastName: student.lastName,
      classId: student.classId,
      streamId: student.streamId ?? undefined,
      boarding: student.boarding as "DAY" | "BOARDER",
      feeGroupId: student.feeGroupId ?? undefined,
      enrolledOn: student.enrolledOn,
    };
  }
  // Phase 6 Slice 2b follow-up item 3 — `boarding: undefined`, not `"DAY"`:
  // no client-side default is pre-selected, so the Select genuinely starts
  // unset (placeholder shown) and a submit with it left untouched really
  // does omit the field, letting the server apply its own "DAY" default.
  return { admissionNo: "", firstName: "", middleName: "", lastName: "", classId: "", streamId: undefined, boarding: undefined, feeGroupId: undefined, enrolledOn: todayIso() };
}

export function StudentForm({ mode, student }: { mode: "create" | "edit"; student?: StudentResponseDto }) {
  const t = useTranslations("students.form");
  const router = useRouter();
  const queryClient = useQueryClient();
  const feeGroupsQuery = useFeeGroups();
  const createMutation = useCreateStudent();
  const updateMutation = useUpdateStudent(student?.id ?? "");
  const mutation = mode === "create" ? createMutation : updateMutation;

  // Item 8: only relevant in create mode — an existing student already has a
  // real admissionNo, edit mode never shows/sends it regardless.
  const autogenQuery = useAdmissionNoAutogenSetting();
  const autogenEnabled = mode === "create" && autogenQuery.data?.enabled === true;

  // Item 1: inline "Guardian / Parent Information" section, create mode
  // only. Deliberately NOT `useCreateAndLinkGuardian(studentId)` — that
  // hook needs a REAL studentId at hook-call time, but this form's student
  // doesn't exist yet (React hooks can't be conditionally called with a
  // not-yet-known id) — `createAndLinkGuardian()` (the plain async function
  // that hook itself wraps, see use-guardians.ts's doc comment) is called
  // directly instead, once `created.id` is known, inside `onValid` below.
  const [guardianFields, setGuardianFields] = React.useState<GuardianFieldsValue>(EMPTY_GUARDIAN_FIELDS);
  const [guardianFieldErrors, setGuardianFieldErrors] = React.useState<Record<string, string>>({});
  const [guardianRecoveryNote, setGuardianRecoveryNote] = React.useState<string | null>(null);
  const [guardianSaving, setGuardianSaving] = React.useState(false);
  const [createdStudentId, setCreatedStudentId] = React.useState<string | null>(null);

  const form = useForm<StudentFormValues>({
    // Bound directly to the real CreateStudentDtoSchema/UpdateStudentDtoSchema
    // (packages/contracts/src/domains/students/{create,update}-student.schema.ts)
    // — no hand-tightened local mirror. `StudentFormValues` is a structural
    // superset covering both DTOs' fields; the two real schemas differ only
    // in which keys are required vs absent (admissionNo/enrolledOn), and zod
    // object schemas ignore extra/absent optional keys rather than erroring,
    // so picking the schema by `mode` here is safe. The cast reconciles the
    // one shared form-value TS shape against whichever real DTO type the
    // resolver is actually validating against at runtime — a narrow,
    // documented cast, same spirit as `query-params.ts`'s `optionalQuery`.
    resolver: zodResolver(mode === "create" ? CreateStudentDtoSchema : UpdateStudentDtoSchema) as unknown as Resolver<StudentFormValues>,
    defaultValues: defaultValuesFor(mode, student),
  });

  async function onValid(values: StudentFormValues) {
    // Item 1 + item 4: validate the (optional) guardian section BEFORE
    // creating the student — if the user filled in ANY guardian field, it
    // must be complete enough to submit (a relationship, and phone-or-email,
    // mirroring the server's own `GuardiansService.create()` rule). Blocking
    // here avoids the worse UX of creating a real student and only THEN
    // discovering the guardian half of the submission can't proceed.
    if (mode === "create" && !isGuardianFieldsEmpty(guardianFields)) {
      const errors: Record<string, string> = {};
      if (!guardianFields.relationship.trim()) errors.relationship = t("guardianSection.relationshipRequired");
      if (!hasGuardianContact(guardianFields)) errors.phone = t("guardianSection.eitherOrHint");
      if (Object.keys(errors).length > 0) {
        setGuardianFieldErrors(errors);
        return;
      }
    }
    setGuardianFieldErrors({});

    try {
      if (mode === "create") {
        // Item 8: when autogen is enabled, admissionNo is omitted from the
        // payload entirely (not sent as ""), matching the real
        // `CreateStudentDtoSchema.admissionNo?: string` `.optional()` shape
        // — `StudentsService.create()` reads "absent" to mean "auto-generate".
        const payload: CreateStudentDto = {
          ...(autogenEnabled ? {} : { admissionNo: values.admissionNo }),
          firstName: values.firstName,
          middleName: values.middleName || undefined,
          lastName: values.lastName,
          classId: values.classId,
          streamId: values.streamId || undefined,
          boarding: values.boarding,
          feeGroupId: values.feeGroupId || undefined,
          enrolledOn: values.enrolledOn,
        };
        const created = await createMutation.mutateAsync(payload);

        // Item 1: create-and-link the guardian ONLY if any field was filled
        // in — stays genuinely optional, can still be added later from the
        // student detail page either way. Calls the SAME non-atomic
        // create-then-link function `useCreateAndLinkGuardian` wraps (see
        // use-guardians.ts's doc comment) directly, now that `created.id`
        // is known.
        if (!isGuardianFieldsEmpty(guardianFields)) {
          setGuardianSaving(true);
          try {
            const { guardian, wasExisting } = await createAndLinkGuardian(
              created.id,
              {
                fullName: guardianFields.fullName,
                phone: guardianFields.phone || undefined,
                email: guardianFields.email || undefined,
                nationalId: guardianFields.nationalId || undefined,
              },
              { relationship: guardianFields.relationship, isPrimary: guardianFields.isPrimary, receivesBilling: guardianFields.receivesBilling },
            );
            queryClient.invalidateQueries({ queryKey: GUARDIANS_QUERY_KEY });
            queryClient.invalidateQueries({ queryKey: ["students", "guardian-links", created.id] });
            // Phase 6 Slice 2c — this screen navigates away immediately on
            // success (unlike the failure path below, which deliberately
            // stays put), so there's no persistent surface here to show a
            // "New guardian created" vs. "Linked to existing guardian
            // {fullName}" note on. Handed off via query params instead — the
            // student detail page (`app/(erp)/students/[id]/page.tsx`) reads
            // `guardianStatus`/`guardianName` once on mount and shows the
            // same wasExisting-aware note `guardian-link-dialog.tsx`'s "new
            // guardian" tab shows inline.
            const qs = new URLSearchParams({
              guardianStatus: wasExisting ? "existing" : "new",
              guardianName: guardian.fullName,
            });
            router.push(`/students/${created.id}?${qs.toString()}`);
          } catch (guardianErr) {
            // The STUDENT was created successfully — do NOT navigate away
            // silently; the student is real and queryable either way, but
            // the guardian needs the user's attention. Stay on this screen
            // with the SAME recovery message
            // `GuardianLinkAfterCreateError`/`guardian-link-dialog.tsx`
            // already establish, plus a direct link to the new student
            // (where the guardian can be retried via `GuardianSection`)
            // instead of silently losing that context on a `router.push`.
            setGuardianSaving(false);
            setGuardianRecoveryNote(
              guardianErr instanceof GuardianLinkAfterCreateError ? guardianErr.message : t("guardianSection.createFailedAfterStudent"),
            );
            setCreatedStudentId(created.id);
            return;
          }
        } else {
          router.push(`/students/${created.id}`);
        }
      } else if (student) {
        const payload: UpdateStudentDto = {
          firstName: values.firstName,
          middleName: values.middleName || undefined,
          lastName: values.lastName,
          classId: values.classId,
          streamId: values.streamId || undefined,
          boarding: values.boarding,
          feeGroupId: values.feeGroupId || undefined,
        };
        await updateMutation.mutateAsync(payload);
        router.push(`/students/${student.id}`);
      }
    } catch (err) {
      // admissionNo/guardian phone are uniqueness-checked server-side
      // (409 Conflict) — mapped to a specific inline field error, per the
      // plan, not a generic toast/banner. Only admissionNo applies to THIS
      // form (create mode only — edit never sends admissionNo at all).
      if (err instanceof ApiError && err.status === 409 && mode === "create") {
        form.setError("admissionNo", { message: t("admissionNoConflict") });
        return;
      }
      // Item 2a: generic structured-validation-error fallback, layered
      // UNDER the 409-specific case above (a more user-friendly message
      // than the raw field sentence for that one case).
      if (err instanceof ApiError) {
        const parsed = parseFieldErrors(err);
        if (Object.keys(parsed).length > 0) {
          for (const [field, message] of Object.entries(parsed)) {
            if (field in form.getValues()) {
              form.setError(field as keyof StudentFormValues, { message });
            }
          }
          form.setError("root", { message: t("genericError") });
          return;
        }
      }
      form.setError("root", { message: err instanceof ApiError ? err.message : t("genericError") });
    }
  }

  const rootError = form.formState.errors.root?.message;

  return (
    <form onSubmit={form.handleSubmit(onValid)} className="space-y-5">
      {rootError && (
        <Alert variant="destructive">
          <AlertDescription>{rootError}</AlertDescription>
        </Alert>
      )}
      {guardianRecoveryNote && createdStudentId && (
        <Alert variant="warning">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{guardianRecoveryNote}</span>
            <Button asChild size="sm" variant="outline">
              <Link href={`/students/${createdStudentId}`}>{t("guardianSection.viewStudent")}</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="admissionNo" required={mode === "create" && !autogenEnabled}>
            {t("admissionNo")}
          </Label>
          {mode === "create" ? (
            autogenEnabled ? (
              // Item 8: autogen enabled — no input at all, honest helper text instead of a fake-disabled required field.
              <p className="flex h-10 items-center text-sm text-muted-foreground">{t("admissionNoAutogenHint")}</p>
            ) : (
              <Input id="admissionNo" {...form.register("admissionNo")} maxLength={30} required />
            )
          ) : (
            // enrolledOn/admissionNo are create-only — UpdateStudentDtoSchema
            // has no path to change either (see this file's own doc
            // comment). Shown read-only here for context, never submitted.
            <Input id="admissionNo" value={form.getValues("admissionNo")} disabled readOnly />
          )}
          {form.formState.errors.admissionNo && <p className="text-xs text-destructive">{form.formState.errors.admissionNo.message}</p>}
        </div>

        {mode === "create" && (
          <div className="space-y-2">
            <Label htmlFor="enrolledOn" required>
              {t("enrolledOn")}
            </Label>
            <Input id="enrolledOn" type="date" {...form.register("enrolledOn")} required />
            {form.formState.errors.enrolledOn && <p className="text-xs text-destructive">{form.formState.errors.enrolledOn.message}</p>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="firstName" required>
            {t("firstName")}
          </Label>
          <Input id="firstName" {...form.register("firstName")} maxLength={60} required />
          {form.formState.errors.firstName && <p className="text-xs text-destructive">{form.formState.errors.firstName.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="middleName">{t("middleName")}</Label>
          <Input id="middleName" {...form.register("middleName")} maxLength={60} />
          {form.formState.errors.middleName && <p className="text-xs text-destructive">{form.formState.errors.middleName.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName" required>
            {t("lastName")}
          </Label>
          <Input id="lastName" {...form.register("lastName")} maxLength={60} required />
          {form.formState.errors.lastName && <p className="text-xs text-destructive">{form.formState.errors.lastName.message}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Label required>{t("classAndStream")}</Label>
        <Controller
          control={form.control}
          name="classId"
          render={({ field: classField }) => (
            <Controller
              control={form.control}
              name="streamId"
              render={({ field: streamField }) => (
                <ClassStreamSelect
                  classId={classField.value || null}
                  streamId={streamField.value ?? null}
                  onClassChange={(v) => classField.onChange(v ?? "")}
                  onStreamChange={(v) => streamField.onChange(v ?? undefined)}
                  streamEmptyLabel={t("noStream")}
                  classPlaceholder={t("selectClass")}
                  activeClassesOnly={mode === "create"}
                />
              )}
            />
          )}
        />
        {form.formState.errors.classId && <p className="text-xs text-destructive">{form.formState.errors.classId.message}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          {/* Phase 6 Slice 2b follow-up item 3 — no `required` asterisk anymore; boarding is genuinely optional now, see `StudentFormValues.boarding`'s own doc comment above. */}
          <Label>{t("boarding")}</Label>
          <Controller
            control={form.control}
            name="boarding"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectBoarding")} />
                </SelectTrigger>
                <SelectContent>
                  {STUDENT_BOARDING_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {t(`boardingKind.${kind}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {form.formState.errors.boarding && <p className="text-xs text-destructive">{form.formState.errors.boarding.message}</p>}
        </div>

        <div className="space-y-2">
          <Label>{t("feeGroup")}</Label>
          <Controller
            control={form.control}
            name="feeGroupId"
            render={({ field }) => (
              <Select value={field.value ?? NO_FEE_GROUP_VALUE} onValueChange={(v) => field.onChange(v === NO_FEE_GROUP_VALUE ? undefined : v)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectFeeGroup")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_FEE_GROUP_VALUE}>{t("selectFeeGroup")}</SelectItem>
                  {feeGroupsQuery.data?.map((fg) => (
                    <SelectItem key={fg.id} value={fg.id}>
                      {fg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      {mode === "create" && (
        <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{t("guardianSection.title")}</h3>
            <p className="text-xs text-muted-foreground">{t("guardianSection.description")}</p>
          </div>
          <GuardianFields value={guardianFields} onChange={setGuardianFields} fieldErrors={guardianFieldErrors} />
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={mutation.isPending || guardianSaving}>
          {mutation.isPending || guardianSaving ? t("submitting") : mode === "create" ? t("submitCreate") : t("submitEdit")}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
