"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useStudent } from "@/features/students/hooks/use-students";

/**
 * `BulkAllocationBatchLineResponseDto` carries only `studentId` (confirmed
 * by reading `bulk-allocation.dto.ts`) — the original spreadsheet's
 * `admissionNo` is never persisted back onto the line, so a human-readable
 * name/admission number is resolved here per row via the already-existing
 * `useStudent()` hook (`features/students/hooks/use-students.ts`, reused
 * verbatim — one cached fetch per distinct student id, not re-fetched per
 * row that happens to share one).
 */
export function BulkAllocationLineStudentCell({ studentId }: { studentId: string }) {
  const t = useTranslations("payments.bulkAllocations.detail");
  const studentQuery = useStudent(studentId);

  if (studentQuery.isLoading) return <span className="text-muted-foreground">{t("loadingStudent")}</span>;
  if (studentQuery.isError || !studentQuery.data) return <span className="text-muted-foreground">{studentId.slice(0, 8)}…</span>;

  const student = studentQuery.data;
  return (
    <Link href={`/students/${studentId}`} className="text-primary hover:underline">
      {student.firstName} {student.lastName} — {student.admissionNo}
    </Link>
  );
}
