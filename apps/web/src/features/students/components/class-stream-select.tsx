"use client";

import * as React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveClasses, useClasses } from "../hooks/use-classes";
import { useStreamsForClass } from "../hooks/use-streams";

/** Non-empty sentinel for the "no stream"/"all classes" option — Radix `Select.Item`'s `value` prop cannot be `""` (that's reserved to represent an unset/placeholder state), so a real select-able "clear" option needs its own non-empty value, translated back to `null` in the change handler. */
const EMPTY_VALUE = "__none__";

export interface ClassStreamSelectProps {
  classId: string | null;
  streamId: string | null;
  onClassChange: (classId: string | null) => void;
  onStreamChange: (streamId: string | null) => void;
  /** Present -> an extra "no filter" option is shown for class (list filters usage). Absent -> class is a required single-pick (create/edit form usage), matching `CreateStudentDtoSchema.classId: z.string().uuid()` (no `.optional()`). */
  classAllLabel?: string;
  /** Always shown — `streamId` is nullable on the student entity regardless of context. */
  streamEmptyLabel: string;
  classPlaceholder?: string;
  /** `true` for the create-form picker (only enrollable into an active class); `false`/omitted for filters and the edit form, where an already-assigned inactive class must still be visible (`GET /students/classes` doesn't filter `isActive` server-side — see `classes.api.ts`'s doc comment; this component does the client-side filtering when asked). */
  activeClassesOnly?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Plain value/onChange props, deliberately NOT coupled to `react-hook-form`
 * directly — `student-form.tsx` composes this via RHF's `<Controller>`
 * instead, and `student-filters.tsx` uses it completely standalone (plain
 * `useState`), so this one component serves both contexts and stays
 * reusable for any future module with the same class→stream cascade. Clears
 * the stream selection via a real `useEffect` (not an inline `onClassChange`
 * side effect) whenever the class actually changes — matches
 * `students.service.ts`'s own "stream must belong to its class" invariant
 * (server-side `StreamsService.findByIdOrFail` doesn't cross-check
 * `classId`, so this is a client-side UX guard against submitting a
 * mismatched pair, not a substitute for server validation).
 */
export function ClassStreamSelect({
  classId,
  streamId,
  onClassChange,
  onStreamChange,
  classAllLabel,
  streamEmptyLabel,
  classPlaceholder,
  activeClassesOnly,
  disabled,
  className,
}: ClassStreamSelectProps) {
  const allClasses = useClasses();
  const activeClasses = useActiveClasses();
  const classesQuery = activeClassesOnly ? activeClasses : allClasses;
  const streamsQuery = useStreamsForClass(classId ?? undefined);

  const previousClassId = React.useRef(classId);
  React.useEffect(() => {
    if (previousClassId.current !== classId) {
      previousClassId.current = classId;
      onStreamChange(null);
    }
  }, [classId, onStreamChange]);

  return (
    <div className={className ?? "flex flex-col gap-3 sm:flex-row"}>
      <Select
        value={classId ?? (classAllLabel ? EMPTY_VALUE : "")}
        onValueChange={(v) => onClassChange(v === EMPTY_VALUE ? null : v)}
        disabled={disabled || classesQuery.isLoading}
      >
        <SelectTrigger className="sm:w-52">
          <SelectValue placeholder={classPlaceholder} />
        </SelectTrigger>
        <SelectContent>
          {classAllLabel && <SelectItem value={EMPTY_VALUE}>{classAllLabel}</SelectItem>}
          {classesQuery.data?.map((klass) => (
            <SelectItem key={klass.id} value={klass.id}>
              {klass.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={streamId ?? EMPTY_VALUE} onValueChange={(v) => onStreamChange(v === EMPTY_VALUE ? null : v)} disabled={disabled || !classId}>
        <SelectTrigger className="sm:w-52">
          <SelectValue placeholder={streamEmptyLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={EMPTY_VALUE}>{streamEmptyLabel}</SelectItem>
          {streamsQuery.data?.map((stream) => (
            <SelectItem key={stream.id} value={stream.id}>
              {stream.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
