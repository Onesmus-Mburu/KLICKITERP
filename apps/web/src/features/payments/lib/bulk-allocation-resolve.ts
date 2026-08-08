import type { StudentResponseDto } from "@klickit/contracts";
import { searchStudents } from "@/features/students/api/students.api";
import { isValidDecimalString, normalizeMoneyInput } from "@/lib/money";
import type { RawBulkAllocationRow } from "./bulk-allocation-xlsx";

export type BulkAllocationRowReason = "missingAdmissionNo" | "missingAmount" | "invalidAmount" | "nonPositiveAmount" | "unresolvedAdmissionNo";

export interface BulkAllocationPreviewRow {
  rowNumber: number;
  raw: RawBulkAllocationRow;
  admissionNo: string;
  normalizedAmount: string | null;
  /** Structurally valid AND (once resolved) has a matching student — the real, complete "ready to submit" signal for this one row. */
  valid: boolean;
  reasons: BulkAllocationRowReason[];
  studentId: string | null;
  studentName: string | null;
}

function isPositiveDecimal(value: string): boolean {
  return isValidDecimalString(value) && !value.trim().startsWith("-") && !/^0(\.0+)?$/.test(value.trim());
}

/**
 * Structural validation only (synchronous, no network) — mirrors
 * `resolveImportRows()`'s shape from Students' bulk import, but genuinely
 * new rules for this domain's two columns. A row where BOTH cells are blank
 * (the template's own note row) is silently skipped, not reported as an
 * error row — same "delete this row" convention the template's own note
 * text tells the uploader to follow.
 */
function validateStructure(raw: RawBulkAllocationRow, rowNumber: number): BulkAllocationPreviewRow | null {
  const admissionNo = raw.admissionNo.trim();
  const amountRaw = raw.amount.trim();
  if (!admissionNo && !amountRaw) return null;

  const reasons: BulkAllocationRowReason[] = [];
  if (!admissionNo) reasons.push("missingAdmissionNo");
  if (!amountRaw) reasons.push("missingAmount");

  let normalizedAmount: string | null = null;
  if (amountRaw) {
    if (!isPositiveDecimal(amountRaw)) {
      reasons.push(isValidDecimalString(amountRaw) ? "nonPositiveAmount" : "invalidAmount");
    } else {
      normalizedAmount = normalizeMoneyInput(amountRaw);
    }
  }

  return {
    rowNumber,
    raw,
    admissionNo,
    normalizedAmount,
    valid: reasons.length === 0,
    reasons,
    studentId: null,
    studentName: null,
  };
}

/**
 * **Real, documented judgement call**: `BulkAllocationController` has no
 * endpoint to validate/resolve admission numbers ahead of
 * `POST /payments/bulk-allocations` itself (confirmed by reading it) — that
 * endpoint's own `createBatch()` resolves the WHOLE batch synchronously and
 * rejects everything up front on any unresolved number. To surface that as a
 * batch-wide blocking issue BEFORE submit (per the plan's explicit ask),
 * this reuses the real, already-existing `GET /students/search` trigram
 * endpoint (`searchStudents()`, the exact one `StudentSearchBox`/
 * `useStudentSearch()` already call elsewhere in this feature) and looks for
 * an EXACT `admissionNo` match among its results — not merely "got some
 * results" — which gives a reliable resolution signal for a short,
 * near-exact query string like an admission number. This is a UX nicety, not
 * a security/correctness boundary: the server's own synchronous resolution
 * in `createBatch()` remains the real authority, and a false negative here
 * (a real student this search happens to miss) is still safely caught
 * server-side, surfacing the identical unresolved-admission-number rejection
 * this preview step is trying to pre-empt.
 *
 * Distinct admission numbers are resolved once each (not once per row) —
 * `admissionNo` legitimately repeats across multiple lines (the same student
 * appearing more than once in one bulk-payment file).
 */
export async function resolveBulkAllocationRows(rawRows: RawBulkAllocationRow[]): Promise<BulkAllocationPreviewRow[]> {
  const structural = rawRows.map((raw, i) => validateStructure(raw, i + 1)).filter((r): r is BulkAllocationPreviewRow => r !== null);

  const distinctAdmissionNos = [...new Set(structural.filter((r) => r.admissionNo).map((r) => r.admissionNo))];
  const resolutions = new Map<string, StudentResponseDto | null>();
  await Promise.all(
    distinctAdmissionNos.map(async (admissionNo) => {
      const results = await searchStudents(admissionNo, 5);
      resolutions.set(admissionNo, results.find((s) => s.admissionNo === admissionNo) ?? null);
    }),
  );

  return structural.map((row) => {
    if (!row.admissionNo) return row;
    const student = resolutions.get(row.admissionNo) ?? null;
    if (!student) {
      return { ...row, valid: false, reasons: [...row.reasons, "unresolvedAdmissionNo" as const] };
    }
    return { ...row, studentId: student.id, studentName: `${student.firstName} ${student.lastName}` };
  });
}

/** Every distinct admission number blocked ONLY by `unresolvedAdmissionNo` — the batch-wide blocking list the preview step surfaces before allowing submit, per the plan's explicit instruction. */
export function getUnresolvedAdmissionNumbers(rows: BulkAllocationPreviewRow[]): string[] {
  return [...new Set(rows.filter((r) => r.reasons.includes("unresolvedAdmissionNo")).map((r) => r.admissionNo))];
}
