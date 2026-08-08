import { Injectable } from "@nestjs/common";
import { BillInvoiceRepository } from "../../billing";
import { StdStudentRepository } from "../../students";
import { Money } from "../../../shared/money/money";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export interface AgingOutstandingParams {
  asOfDate?: string;
}

type AgingBucketKey = "bucket0to30" | "bucket31to60" | "bucket61to90" | "bucket90plus";

interface StudentAgingRow {
  studentId: string;
  admissionNo: string;
  studentName: string;
  classId: string;
  bucket0to30: Money;
  bucket31to60: Money;
  bucket61to90: Money;
  bucket90plus: Money;
  total: Money;
}

const ZERO_BUCKETS: Record<AgingBucketKey, Money> = {
  bucket0to30: Money.ZERO,
  bucket31to60: Money.ZERO,
  bucket61to90: Money.ZERO,
  bucket90plus: Money.ZERO,
};

/**
 * Same 4-bucket convention `mv_ar_summary`'s own migration SQL documents
 * (`MvArSummaryRow`'s doc comment): buckets on `asOfDate - dueDate` in whole
 * days, with `<= 30` (which also catches NEGATIVE day-differences — an
 * invoice not yet due) folded into `"0-30"`. Parses both dates as UTC
 * midnight so day-count arithmetic isn't affected by the server's local
 * timezone (both columns are Postgres `date`, returned as plain `YYYY-MM-DD`
 * strings with no time-of-day component to begin with).
 */
function bucketFor(dueDate: string, asOfDate: string): AgingBucketKey {
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  const asOf = Date.parse(`${asOfDate}T00:00:00Z`);
  const daysOverdue = Math.floor((asOf - due) / 86_400_000);
  if (daysOverdue <= 30) return "bucket0to30";
  if (daysOverdue <= 60) return "bucket31to60";
  if (daysOverdue <= 90) return "bucket61to90";
  return "bucket90plus";
}

/**
 * FR-RPT-008 report-of-record Aging/Outstanding — "the report-of-record
 * version of what `mv_ar_summary` approximates for dashboard speed" (task
 * brief) — queries `bill_invoice` directly via `domains/billing`'s exported
 * `BillInvoiceRepository.findAllOpen()` (added by this pass specifically for
 * this report — see that method's own doc comment), never the MV.
 *
 * **Grouped by student, not by class** (unlike `mv_ar_summary`, which groups
 * by `class_id` for the Dashboard's chart-friendly shape): a report-of-record
 * aging listing needs to name WHICH student owes what, per the task brief's
 * "grouped by student + aging bucket, with per-student and grand totals" —
 * each row is one student with FOUR bucket columns (a pivoted/tabular shape,
 * the conventional way an aging report reads) plus that student's own
 * `total`; `totals` on the returned `ReportResult` carries the grand,
 * across-all-students total per bucket, satisfying "per-student and grand
 * totals" on both axes.
 *
 * **`asOfDate` only affects the aging-bucket day-math, not which invoices are
 * included** — `bill_invoice.balance`/`.status` are live stored-cache columns
 * (see that entity's own doc comment), not a historical point-in-time
 * snapshot; there is no "AR ledger as it stood on some past date" to query,
 * only "every currently-open invoice, aged as of whichever date the caller
 * asks about" — the exact same limitation `mv_ar_summary`'s own
 * `CURRENT_DATE`-only design has (documented there too). Defaults to today
 * (server-local date) when omitted.
 *
 * **Student lookups are N individual `findById()` calls, not a bulk
 * `findByIds()`** — `StdStudentRepository` has no bulk finder (a documented
 * gap, not an oversight): for a single school's realistic distinct-debtor
 * count this is acceptable, and a future pass can add a bulk finder without
 * changing this report's shape if it ever becomes a real bottleneck.
 */
@Injectable()
export class AgingOutstandingReport implements ReportDefinition<AgingOutstandingParams> {
  readonly code = "aging-outstanding";
  readonly name = "Aging / Outstanding";
  readonly domain = "billing";
  readonly permissionCode = "reports:aging-outstanding:view";
  readonly paramsShape = { asOfDate: "date" } as const;
  readonly columns: ReportColumnDef[] = [
    { key: "admissionNo", label: "Admission No.", type: "string" },
    { key: "studentName", label: "Student", type: "string" },
    { key: "classId", label: "Class", type: "string" },
    { key: "bucket0to30", label: "0-30 Days", type: "money" },
    { key: "bucket31to60", label: "31-60 Days", type: "money" },
    { key: "bucket61to90", label: "61-90 Days", type: "money" },
    { key: "bucket90plus", label: "90+ Days", type: "money" },
    { key: "total", label: "Total Outstanding", type: "money" },
  ];

  constructor(
    private readonly billInvoiceRepository: BillInvoiceRepository,
    private readonly studentRepository: StdStudentRepository,
  ) {}

  async execute(params: AgingOutstandingParams): Promise<ReportResult> {
    const asOfDate = params.asOfDate ?? new Date().toISOString().slice(0, 10);
    const invoices = await this.billInvoiceRepository.findAllOpen();

    const byStudent = new Map<string, Record<AgingBucketKey, Money>>();
    for (const invoice of invoices) {
      const bucket = bucketFor(invoice.dueDate, asOfDate);
      const existing = byStudent.get(invoice.studentId) ?? { ...ZERO_BUCKETS };
      existing[bucket] = existing[bucket].add(invoice.balance);
      byStudent.set(invoice.studentId, existing);
    }

    const studentIds = [...byStudent.keys()];
    const students = await Promise.all(studentIds.map((id) => this.studentRepository.findById(id)));
    const studentById = new Map(students.filter((s): s is NonNullable<typeof s> => s !== null).map((s) => [s.id, s]));

    // NOTE: deliberately NOT annotated `: StudentAgingRow[]` — a named interface
    // loses TypeScript's "fresh object literal" exemption for index-signature
    // assignability, so a `StudentAgingRow[]`-typed local would fail to satisfy
    // `ReportResult.rows: Record<string, unknown>[]` below without an extra
    // cast. Letting the array's type be inferred from the literal returned by
    // `.map()` (same convention every other report in this pass uses) keeps it
    // assignable with no cast, while `StudentAgingRow` itself still documents
    // the row shape for readers.
    const rows = studentIds.map((studentId) => {
      const buckets = byStudent.get(studentId)!;
      const student = studentById.get(studentId);
      const total = buckets.bucket0to30.add(buckets.bucket31to60).add(buckets.bucket61to90).add(buckets.bucket90plus);
      return {
        studentId,
        admissionNo: student?.admissionNo ?? "",
        studentName: student ? `${student.firstName} ${student.lastName}` : "",
        classId: student?.classId ?? "",
        bucket0to30: buckets.bucket0to30,
        bucket31to60: buckets.bucket31to60,
        bucket61to90: buckets.bucket61to90,
        bucket90plus: buckets.bucket90plus,
        total,
      };
    });

    rows.sort((a: StudentAgingRow, b: StudentAgingRow) => b.total.compare(a.total));

    const grand = rows.reduce(
      (sum: Record<AgingBucketKey, Money>, row: StudentAgingRow) => ({
        bucket0to30: sum.bucket0to30.add(row.bucket0to30),
        bucket31to60: sum.bucket31to60.add(row.bucket31to60),
        bucket61to90: sum.bucket61to90.add(row.bucket61to90),
        bucket90plus: sum.bucket90plus.add(row.bucket90plus),
      }),
      { ...ZERO_BUCKETS },
    );
    const grandTotal = grand.bucket0to30.add(grand.bucket31to60).add(grand.bucket61to90).add(grand.bucket90plus);

    return {
      rows,
      totals: { ...grand, grandTotal },
      generatedAt: new Date(),
    };
  }
}
